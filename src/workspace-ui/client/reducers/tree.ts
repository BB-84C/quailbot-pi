import { itemMatchesFilter, subtreeVisibility } from "../../shared/filter.js";
import { dedupeName, deleteItems, setGroupActiveCascade } from "../../shared/groups.js";
import type { AnchorDraft, CliParamDraft, GroupDraft, RoiDraft } from "../../shared/model.js";
import type { Action } from "../actions.js";
import type { AppState, TreeItemKey, TreeItemKind } from "../state.js";

export type RenderedTreeRow = TreeItemKey & {
  depth: number;
  active: boolean;
  forced: boolean;
  displayName: string;
  tag: string;
};

type WorkspaceClone = AppState["workspace"];

function keyEquals(a: TreeItemKey | null, b: TreeItemKey | null): boolean {
  return Boolean(a && b && a.kind === b.kind && a.name === b.name);
}

function keyId(key: TreeItemKey): string {
  return `${key.kind}:${key.name}`;
}

function cleanKey(key: TreeItemKey): TreeItemKey {
  return { kind: key.kind, name: key.name };
}

function uniqueKeys(keys: TreeItemKey[]): TreeItemKey[] {
  const seen = new Set<string>();
  const out: TreeItemKey[] = [];
  for (const key of keys) {
    const id = keyId(key);
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push({ kind: key.kind, name: key.name });
  }
  return out;
}

export function forcedRoiNames(state: AppState): Set<string> {
  const roiNames = new Set(state.workspace.rois.map((roi) => roi.name).filter((name) => name.length > 0));
  const forced = new Set<string>();
  for (const anchor of state.workspace.anchors) {
    if (!anchor.active) {
      continue;
    }
    for (const linked of anchor.linked_rois || []) {
      const name = String(linked || "").trim();
      if (roiNames.has(name)) {
        forced.add(name);
      }
    }
  }
  return forced;
}

function cloneWorkspace(workspace: AppState["workspace"]): WorkspaceClone {
  return {
    ...workspace,
    rois: workspace.rois.map((roi) => ({ ...roi })),
    anchors: workspace.anchors.map((anchor) => ({ ...anchor, linked_rois: [...anchor.linked_rois] })),
    groups: workspace.groups.map((group) => ({ ...group })),
    cliParams: workspace.cliParams.map((param) => ({ ...param, linked_observables: [...param.linked_observables] })),
  };
}

function existingNames(workspace: AppState["workspace"]): Set<string> {
  return new Set([
    ...workspace.rois.map((item) => item.name),
    ...workspace.anchors.map((item) => item.name),
    ...workspace.groups.map((item) => item.name),
    ...workspace.cliParams.map((item) => item.name),
  ]);
}

function selectedGroupName(state: AppState): string {
  if (state.tree.selected.length !== 1) {
    return "";
  }
  const selected = state.tree.selected[0];
  if (selected?.kind !== "group") {
    return "";
  }
  return state.workspace.groups.some((group) => group.name === selected.name) ? selected.name : "";
}

function addItem(state: AppState, kind: "roi" | "anchor" | "group"): AppState {
  const workspace = cloneWorkspace(state.workspace);
  const group = selectedGroupName(state);
  const names = existingNames(workspace);
  if (kind === "roi") {
    const name = dedupeName(names, "new_roi");
    workspace.rois.push({ name, x: 0, y: 0, w: 0, h: 0, description: "", tags: "", active: true, group });
    return { ...state, workspace, tree: { ...state.tree, selected: [{ kind, name }], activeAnchor: { kind, name } } };
  }
  if (kind === "anchor") {
    const name = dedupeName(names, "new_anchor");
    workspace.anchors.push({ name, x: 0, y: 0, description: "", tags: "", linked_rois: [], active: true, group });
    return { ...state, workspace, tree: { ...state.tree, selected: [{ kind, name }], activeAnchor: { kind, name } } };
  }
  const name = dedupeName(names, "new_group");
  workspace.groups.push({ name, description: "", tags: "", active: true, group, collapsed: false });
  return { ...state, workspace, tree: { ...state.tree, selected: [{ kind, name }], activeAnchor: { kind, name } } };
}

function selectedIndexes(state: AppState): Array<{ kind: "roi" | "anchor" | "group" | "cli"; idx: number }> {
  const out: Array<{ kind: "roi" | "anchor" | "group" | "cli"; idx: number }> = [];
  for (const key of state.tree.selected) {
    const source = key.kind === "roi" ? state.workspace.rois : key.kind === "anchor" ? state.workspace.anchors : key.kind === "group" ? state.workspace.groups : state.workspace.cliParams;
    const idx = source.findIndex((item) => item.name === key.name);
    if (idx >= 0) {
      out.push({ kind: key.kind, idx });
    }
  }
  return out;
}

function deleteSelected(state: AppState): AppState {
  const selected = selectedIndexes(state);
  if (selected.length === 0) {
    return state;
  }
  const workspace = cloneWorkspace(state.workspace);
  deleteItems({ groups: workspace.groups, rois: workspace.rois, anchors: workspace.anchors, cliParams: workspace.cliParams, selected });
  return { ...state, workspace, tree: { ...state.tree, selected: [], activeAnchor: null } };
}

function withForcedActivation(state: AppState): AppState {
  const forced = forcedRoiNames(state);
  if (forced.size === 0) {
    return state;
  }
  let changed = false;
  const rois = state.workspace.rois.map((roi) => {
    if (forced.has(roi.name) && !roi.active) {
      changed = true;
      return { ...roi, active: true };
    }
    return roi;
  });
  if (!changed) {
    return state;
  }
  return { ...state, workspace: { ...state.workspace, rois } };
}

function itemActive(workspace: AppState["workspace"], kind: TreeItemKind, name: string, forced: Set<string>): boolean {
  if (kind === "roi") {
    const roi = workspace.rois.find((candidate) => candidate.name === name);
    return Boolean(roi?.active || forced.has(name));
  }
  if (kind === "anchor") {
    return Boolean(workspace.anchors.find((candidate) => candidate.name === name)?.active);
  }
  if (kind === "group") {
    return Boolean(workspace.groups.find((candidate) => candidate.name === name)?.active);
  }
  return Boolean(workspace.cliParams.find((candidate) => candidate.name === name)?.enabled);
}

function displayName(kind: TreeItemKind, item: RoiDraft | AnchorDraft | GroupDraft | CliParamDraft): string {
  if (kind === "cli") {
    const param = item as CliParamDraft;
    const label = String(param.label || "").trim();
    const name = String(param.name || "").trim();
    if (label && name && label !== name) {
      return `${label} (${name})`;
    }
    if (label) {
      return label;
    }
    return name;
  }
  return String(item.name || "");
}

function tagFor(kind: TreeItemKind, item: RoiDraft | AnchorDraft | GroupDraft | CliParamDraft): string {
  if (kind === "roi") {
    return "[ROI]";
  }
  if (kind === "anchor") {
    return "[ANCHOR]";
  }
  if (kind === "group") {
    return "[GROUP]";
  }
  const cliName = String((item as CliParamDraft).cli_name || "cli").trim() || "cli";
  return `[${cliName}]`;
}

export function renderedTreeRows(state: AppState): RenderedTreeRow[] {
  const forced = forcedRoiNames(state);
  const visible = subtreeVisibility({
    groups: state.workspace.groups,
    rois: state.workspace.rois,
    anchors: state.workspace.anchors,
    cliParams: state.workspace.cliParams,
    state: state.filter,
  });
  const groupNames = new Set(state.workspace.groups.map((group) => group.name).filter((name) => name.length > 0));
  const parentKey = (name: string): string => (groupNames.has(name) ? name : "");
  const groupsByParent = new Map<string, GroupDraft[]>();
  for (const group of state.workspace.groups) {
    const bucket = groupsByParent.get(parentKey(group.group)) ?? [];
    bucket.push(group);
    groupsByParent.set(parentKey(group.group), bucket);
  }
  const itemsByParent = new Map<string, Array<{ kind: Exclude<TreeItemKind, "group">; item: RoiDraft | AnchorDraft | CliParamDraft }>>();
  const addItem = (parent: string, kind: Exclude<TreeItemKind, "group">, item: RoiDraft | AnchorDraft | CliParamDraft): void => {
    const bucket = itemsByParent.get(parent) ?? [];
    bucket.push({ kind, item });
    itemsByParent.set(parent, bucket);
  };
  for (const roi of state.workspace.rois) addItem(parentKey(roi.group), "roi", roi);
  for (const anchor of state.workspace.anchors) addItem(parentKey(anchor.group), "anchor", anchor);
  for (const param of state.workspace.cliParams) addItem(parentKey(param.group), "cli", param);

  const out: RenderedTreeRow[] = [];
  const addRow = (kind: TreeItemKind, item: RoiDraft | AnchorDraft | GroupDraft | CliParamDraft, depth: number): void => {
    const name = item.name;
    out.push({
      kind,
      name,
      depth,
      forced: kind === "roi" && forced.has(name),
      active: itemActive(state.workspace, kind, name, forced),
      displayName: displayName(kind, item),
      tag: tagFor(kind, item),
    });
  };
  const addItems = (parentName: string, depth: number): void => {
    for (const group of groupsByParent.get(parentName) ?? []) {
      if (!visible.has(`group:${group.name}`)) {
        continue;
      }
      addRow("group", group, depth);
      if (!state.tree.collapsedGroups.has(group.name)) {
        addItems(group.name, depth + 1);
      }
    }
    for (const item of itemsByParent.get(parentName) ?? []) {
      if (!itemMatchesFilter(item.kind, item.item, state.filter)) {
        continue;
      }
      addRow(item.kind, item.item, depth);
    }
  };
  addItems("", 0);
  return out;
}

function renderedRange(state: AppState, start: TreeItemKey | null, end: TreeItemKey): TreeItemKey[] {
  const rows = renderedTreeRows(state);
  const endIdx = rows.findIndex((row) => keyEquals(row, end));
  if (endIdx < 0) {
    return state.tree.selected;
  }
  const startIdx = start ? rows.findIndex((row) => keyEquals(row, start)) : -1;
  if (startIdx < 0) {
    return [{ kind: end.kind, name: end.name }];
  }
  const lo = Math.min(startIdx, endIdx);
  const hi = Math.max(startIdx, endIdx);
  return rows.slice(lo, hi + 1).map((row) => ({ kind: row.kind, name: row.name }));
}

function selectionWithToggledKey(selected: TreeItemKey[], key: TreeItemKey): TreeItemKey[] {
  if (selected.some((item) => keyEquals(item, key))) {
    return selected.filter((item) => !keyEquals(item, key));
  }
  return [...selected, { kind: key.kind, name: key.name }];
}

function setItemActive(workspace: WorkspaceClone, key: TreeItemKey, active: boolean, forced: Set<string>): void {
  if (key.kind === "cli") {
    const item = workspace.cliParams.find((candidate) => candidate.name === key.name);
    if (item) item.enabled = active;
  } else if (key.kind === "group") {
    const item = workspace.groups.find((candidate) => candidate.name === key.name);
    if (item) {
      item.active = active;
      setGroupActiveCascade({ groups: workspace.groups, rois: workspace.rois, anchors: workspace.anchors, cliParams: workspace.cliParams, groupName: item.name, active });
    }
  } else if (key.kind === "anchor") {
    const item = workspace.anchors.find((candidate) => candidate.name === key.name);
    if (item) item.active = active;
  } else if (!forced.has(key.name)) {
    const item = workspace.rois.find((candidate) => candidate.name === key.name);
    if (item) item.active = active;
  }
}

function clickBody(state: AppState, key: TreeItemKey, modifiers: { ctrl: boolean; shift: boolean }): AppState {
  const clicked = cleanKey(key);
  const forced = forcedRoiNames(state);
  if (clicked.kind === "roi" && forced.has(clicked.name)) {
    return withForcedActivation({ ...state, tree: { ...state.tree, selected: [clicked], activeAnchor: clicked } });
  }
  if (modifiers.shift) {
    return { ...state, tree: { ...state.tree, selected: uniqueKeys(renderedRange(state, state.tree.activeAnchor, clicked)) } };
  }
  if (modifiers.ctrl) {
    return { ...state, tree: { ...state.tree, selected: uniqueKeys(selectionWithToggledKey(state.tree.selected, clicked)), activeAnchor: clicked } };
  }
  return { ...state, tree: { ...state.tree, selected: [clicked], activeAnchor: clicked } };
}

function clickToggle(state: AppState, key: TreeItemKey): AppState {
  const clicked = cleanKey(key);
  const normalized = withForcedActivation(state);
  const forced = forcedRoiNames(normalized);
  if (clicked.kind === "roi" && forced.has(clicked.name)) {
    return { ...normalized, tree: { ...normalized.tree, selected: [clicked], activeAnchor: clicked } };
  }

  const selectedContainsClicked = normalized.tree.selected.some((item) => keyEquals(item, clicked));
  const targets = normalized.tree.selected.length > 1 && selectedContainsClicked ? normalized.tree.selected : [clicked];
  const workspace = cloneWorkspace(normalized.workspace);
  const newState = !itemActive(workspace, clicked.kind, clicked.name, forced);
  for (const target of targets) {
    setItemActive(workspace, target, newState, forced);
  }
  const next: AppState = {
    ...normalized,
    workspace,
    tree: { ...normalized.tree, selected: uniqueKeys(targets), activeAnchor: clicked },
  };
  return withForcedActivation(next);
}

function keyboardNav(state: AppState, key: "ArrowUp" | "ArrowDown", shift: boolean): AppState {
  const rows = renderedTreeRows(state);
  if (rows.length === 0) {
    return state;
  }
  const current = state.tree.activeAnchor ?? state.tree.selected[state.tree.selected.length - 1] ?? null;
  const currentIdx = current ? rows.findIndex((row) => keyEquals(row, current)) : -1;
  let nextIdx: number;
  if (currentIdx < 0) {
    nextIdx = key === "ArrowDown" ? 0 : 0;
  } else if (key === "ArrowDown") {
    nextIdx = Math.min(rows.length - 1, currentIdx + 1);
  } else {
    nextIdx = Math.max(0, currentIdx - 1);
  }
  const nextKey = { kind: rows[nextIdx]?.kind ?? "roi", name: rows[nextIdx]?.name ?? "" } as TreeItemKey;
  return {
    ...state,
    tree: {
      ...state.tree,
      selected: shift ? uniqueKeys(renderedRange(state, current, nextKey)) : [nextKey],
      activeAnchor: nextKey,
    },
  };
}

export function treeReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "TREE_ADD_ITEM":
      return addItem(state, action.payload.kind);
    case "TREE_DELETE_SELECTED":
      return deleteSelected(state);
    case "TREE_CLICK_ITEM":
      if (action.payload.region === "toggle") {
        return clickToggle(state, action.payload);
      }
      return clickBody(state, action.payload, action.payload.modifiers);
    case "TREE_DOUBLE_CLICK_ITEM": {
      if (action.payload.kind !== "group") {
        return state;
      }
      const collapsedGroups = new Set(state.tree.collapsedGroups);
      if (collapsedGroups.has(action.payload.name)) {
        collapsedGroups.delete(action.payload.name);
      } else {
        collapsedGroups.add(action.payload.name);
      }
      return { ...state, tree: { ...state.tree, collapsedGroups, selected: [action.payload], activeAnchor: action.payload } };
    }
    case "TREE_CTRL_TOGGLE_ROW":
      return { ...state, tree: { ...state.tree, selected: uniqueKeys(selectionWithToggledKey(state.tree.selected, cleanKey(action.payload))), activeAnchor: cleanKey(action.payload) } };
    case "TREE_SHIFT_RANGE":
      return { ...state, tree: { ...state.tree, selected: uniqueKeys(renderedRange(state, state.tree.activeAnchor, cleanKey(action.payload))) } };
    case "TREE_KEYBOARD_NAV":
      return keyboardNav(state, action.payload.key, action.payload.modifiers.shift);
    default:
      return state;
  }
}
