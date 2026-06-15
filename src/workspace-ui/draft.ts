import { arrayOfRecords, asString, cloneJson, isRecord, record, type JsonRecord } from "./json.js";

export type WorkspaceDraft = {
  root: JsonRecord;
  groups: JsonRecord[];
  rois: JsonRecord[];
  anchors: JsonRecord[];
  parameters: JsonRecord[];
  actions: JsonRecord[];
};

type VisualKind = "group" | "roi" | "anchor";
type DraftItemKind = VisualKind | "parameter" | "action";

export function createWorkspaceDraft(input: unknown): WorkspaceDraft {
  const parsedRoot = cloneJson(record(input));
  const gui = record(parsedRoot.GUI);
  const root = isRecord(parsedRoot.GUI)
    ? {
        ...gui,
        ...parsedRoot,
        groups: gui.groups ?? parsedRoot.groups,
        rois: gui.rois ?? parsedRoot.rois,
        anchors: gui.anchors ?? parsedRoot.anchors,
      }
    : parsedRoot;
  const cli = normalizeCliDraft(root);

  return {
    root,
    groups: arrayOfRecords(root.groups),
    rois: arrayOfRecords(root.rois),
    anchors: arrayOfRecords(root.anchors),
    parameters: cli.parameters,
    actions: cli.actions,
  };
}

export function serializeWorkspaceDraft(draft: WorkspaceDraft): JsonRecord {
  syncAnchorLinkFields(draft);
  applyForcedRoiActivation(draft);
  const output = cloneJson(draft.root);
  delete output.GUI;
  output.groups = cloneJson(draft.groups);
  output.rois = cloneJson(draft.rois);
  output.anchors = cloneJson(draft.anchors);
  const cliParams = record(output.cli_params);
  if (draft.parameters.length > 0 || isRecord(cliParams.parameters)) {
    cliParams.parameters = { ...record(cliParams.parameters), count: draft.parameters.length, items: cloneJson(draft.parameters) };
  }
  if (draft.actions.length > 0 || isRecord(cliParams.action_commands)) {
    cliParams.action_commands = { ...record(cliParams.action_commands), count: draft.actions.length, items: cloneJson(draft.actions) };
  }
  if (isRecord(output.cli_params) || Object.keys(cliParams).length > 0) {
    output.cli_params = cliParams;
  }
  return output;
}

export function addGroup(draft: WorkspaceDraft, input: { name: string; parent?: string; active?: boolean }): void {
  validateName(input.name);
  ensureUniqueName(draft, input.name);
  if (input.parent !== undefined) {
    ensureGroupExists(draft, input.parent);
  }

  const group: JsonRecord = { name: input.name };
  if (input.parent !== undefined) group.group = input.parent;
  if (input.active !== undefined) group.active = input.active;
  draft.groups.push(group);
}

export function addRoi(
  draft: WorkspaceDraft,
  input: { name: string; group?: string; active?: boolean; x?: number; y?: number; w?: number; h?: number },
): void {
  validateName(input.name);
  validateRoiDimensions(input);
  ensureUniqueName(draft, input.name);
  if (input.group !== undefined) {
    ensureGroupExists(draft, input.group);
  }

  const roi: JsonRecord = { name: input.name };
  if (input.group !== undefined) roi.group = input.group;
  if (input.active !== undefined) roi.active = input.active;
  if (input.x !== undefined) roi.x = input.x;
  if (input.y !== undefined) roi.y = input.y;
  if (input.w !== undefined) roi.w = input.w;
  if (input.h !== undefined) roi.h = input.h;
  draft.rois.push(roi);
}

export function addAnchor(
  draft: WorkspaceDraft,
  input: { name: string; group?: string; active?: boolean; x?: number; y?: number; linked_ROIs?: string[] },
): void {
  validateName(input.name);
  ensureUniqueName(draft, input.name);
  if (input.group !== undefined) {
    ensureGroupExists(draft, input.group);
  }

  const anchor: JsonRecord = { name: input.name };
  if (input.group !== undefined) anchor.group = input.group;
  if (input.active !== undefined) anchor.active = input.active;
  if (input.x !== undefined) anchor.x = input.x;
  if (input.y !== undefined) anchor.y = input.y;
  if (input.linked_ROIs !== undefined) {
    anchor.linked_ROIs = [...input.linked_ROIs];
    anchor.linked_observables = [...input.linked_ROIs];
  }
  draft.anchors.push(anchor);
}

export function updateRoiGeometry(
  draft: WorkspaceDraft,
  name: string,
  geometry: { x: number; y: number; w: number; h: number },
): void {
  validateRoiDimensions(geometry);

  Object.assign(findNamedRecord(draft.rois, name, "ROI"), geometry);
}

export function updateAnchorGeometry(draft: WorkspaceDraft, name: string, geometry: { x: number; y: number }): void {
  Object.assign(findNamedRecord(draft.anchors, name, "anchor"), geometry);
}

export function setGroupActive(draft: WorkspaceDraft, name: string, active: boolean): void {
  ensureGroupExists(draft, name);
  const affectedGroups = descendantGroupNames(draft, name);

  for (const group of draft.groups) {
    const groupName = asString(group.name);
    if (groupName !== undefined && affectedGroups.has(groupName)) {
      group.active = active;
    }
  }

  for (const item of [...draft.rois, ...draft.anchors]) {
    const groupName = itemGroupName(item);
    if (groupName !== undefined && affectedGroups.has(groupName)) {
      item.active = active;
    }
  }

  for (const item of [...draft.parameters, ...draft.actions]) {
    const groupName = itemGroupName(item);
    if (groupName !== undefined && affectedGroups.has(groupName)) {
      item.enabled = active;
    }
  }
}

export function assignItemGroup(
  draft: WorkspaceDraft,
  item: { kind: "group" | "roi" | "anchor"; name: string },
  groupName: string | undefined,
): void {
  const target = findVisualItem(draft, item.kind, item.name);

  if (groupName === undefined) {
    delete target.group;
    delete target.parent;
    return;
  }

  ensureGroupExists(draft, groupName);

  if (item.kind === "group") {
    if (item.name === groupName || wouldCreateGroupCycle(draft, item.name, groupName)) {
      throw new Error(`group cycle rejected for ${item.name}`);
    }
    target.group = groupName;
    delete target.parent;
    return;
  }

  target.group = groupName;
  delete target.parent;
}

export function deleteVisualItem(draft: WorkspaceDraft, item: { kind: DraftItemKind; name: string }): void {
  const removedRoiNames = new Set<string>();

  if (item.kind === "roi") {
    removeNamed(draft.rois, item.name, removedRoiNames);
    removeDeletedRoiLinks(draft, removedRoiNames);
    return;
  }
  if (item.kind === "anchor") {
    removeNamed(draft.anchors, item.name);
    return;
  }
  if (item.kind === "parameter") {
    removeNamed(draft.parameters, item.name);
    return;
  }
  if (item.kind === "action") {
    removeNamed(draft.actions, item.name);
    return;
  }

  const originalGroupParent = new Map<string, string>();
  for (const group of draft.groups) {
    const name = asString(group.name);
    if (name !== undefined) originalGroupParent.set(name, itemGroupName(group) ?? "");
  }
  const removedGroupNames = new Set<string>();
  removeNamed(draft.groups, item.name, removedGroupNames);
  repairGroupReferences(draft, removedGroupNames, originalGroupParent);
}

function ensureUniqueName(draft: WorkspaceDraft, name: string): void {
  if (allNamedItems(draft).some((item) => asString(item.name) === name)) {
    throw new Error(`duplicate name conflict: ${name}`);
  }
}

function validateName(name: string): void {
  if (name.trim().length === 0) {
    throw new Error("name must be non-empty");
  }
}

function validateRoiDimensions(geometry: { w?: number; h?: number }): void {
  if ((geometry.w !== undefined && geometry.w <= 0) || (geometry.h !== undefined && geometry.h <= 0)) {
    throw new Error("ROI width and height must be positive");
  }
}

function ensureGroupExists(draft: WorkspaceDraft, name: string): void {
  findNamedRecord(draft.groups, name, "group");
}

function findVisualItem(draft: WorkspaceDraft, kind: VisualKind, name: string): JsonRecord {
  switch (kind) {
    case "group":
      return findNamedRecord(draft.groups, name, "group");
    case "roi":
      return findNamedRecord(draft.rois, name, "ROI");
    case "anchor":
      return findNamedRecord(draft.anchors, name, "anchor");
  }
}

function findNamedRecord(items: JsonRecord[], name: string, label: string): JsonRecord {
  const item = items.find((candidate) => asString(candidate.name) === name);
  if (item === undefined) {
    throw new Error(`${label} not found: ${name}`);
  }
  return item;
}

function allNamedItems(draft: WorkspaceDraft): JsonRecord[] {
  return [...draft.groups, ...draft.rois, ...draft.anchors, ...draft.parameters, ...draft.actions];
}

function removeNamed(items: JsonRecord[], name: string, removedNames?: Set<string>): void {
  const index = items.findIndex((candidate) => asString(candidate.name) === name);
  if (index < 0) {
    return;
  }
  const removedName = asString(items[index]?.name);
  if (removedName !== undefined) removedNames?.add(removedName);
  items.splice(index, 1);
}

function removeDeletedRoiLinks(draft: WorkspaceDraft, removedRoiNames: Set<string>): void {
  if (removedRoiNames.size === 0) {
    return;
  }
  for (const anchor of draft.anchors) {
    if (Array.isArray(anchor.linked_ROIs)) {
      anchor.linked_ROIs = anchor.linked_ROIs.filter((name) => typeof name !== "string" || !removedRoiNames.has(name));
    }
    if (Array.isArray(anchor.linked_observables)) {
      anchor.linked_observables = anchor.linked_observables.filter(
        (name) => typeof name !== "string" || !removedRoiNames.has(name),
      );
    }
  }
}

function repairGroupReferences(
  draft: WorkspaceDraft,
  removedGroupNames: Set<string>,
  originalGroupParent: Map<string, string>,
): void {
  if (removedGroupNames.size === 0) {
    return;
  }
  const existingGroupNames = new Set(draft.groups.map((group) => asString(group.name)).filter((name): name is string => name !== undefined));

  function resolveParent(groupName: unknown): string | undefined {
    let current = typeof groupName === "string" ? groupName.trim() : "";
    const seen = new Set<string>();
    while (current && !existingGroupNames.has(current) && !seen.has(current)) {
      seen.add(current);
      current = originalGroupParent.get(current)?.trim() ?? "";
    }
    return existingGroupNames.has(current) ? current : undefined;
  }

  for (const item of [...draft.groups, ...draft.rois, ...draft.anchors, ...draft.parameters, ...draft.actions]) {
    setCanonicalGroupRef(item, resolveParent(itemGroupName(item)));
  }
}

function setCanonicalGroupRef(item: JsonRecord, groupName: string | undefined): void {
  delete item.parent;
  if (groupName === undefined) {
    delete item.group;
    return;
  }
  item.group = groupName;
}

function normalizeCliDraft(root: JsonRecord): { parameters: JsonRecord[]; actions: JsonRecord[] } {
  let cliParams = record(root.cli_params);
  if (!isRecord(root.cli_params) && isRecord(record(root.tools).cli)) {
    const legacyCli = record(record(root.tools).cli);
    cliParams = {
      cli_name: asString(legacyCli.cli_name) ?? asString(legacyCli.CLI_Name) ?? "cli",
      enabled: typeof legacyCli.enabled === "boolean" ? legacyCli.enabled : false,
      parameters: {
        items: sectionItems(record(legacyCli.parameters)).filter((item) => !isRecord(item.action_cmd)),
      },
      action_commands: {
        items: [
          ...sectionItems(record(legacyCli.parameters)).filter((item) => isRecord(item.action_cmd)),
          ...sectionItems(record(legacyCli.actions)),
          ...sectionItems(record(legacyCli.action_commands)),
        ],
      },
    };
    root.cli_params = cliParams;
  }

  return {
    parameters: sectionItems(record(cliParams.parameters)).filter((item) => !isRecord(item.action_cmd)),
    actions: [
      ...sectionItems(record(cliParams.parameters)).filter((item) => isRecord(item.action_cmd)),
      ...sectionItems(record(cliParams.action_commands)),
      ...sectionItems(record(cliParams.actions)),
    ],
  };
}

function sectionItems(container: JsonRecord): JsonRecord[] {
  if (Array.isArray(container.items)) {
    return arrayOfRecords(container.items);
  }

  const items: JsonRecord[] = [];
  for (const [key, value] of Object.entries(container)) {
    if (key === "items" || key === "count") {
      continue;
    }
    if (!isRecord(value)) {
      continue;
    }
    items.push(asString(value.name) === undefined ? { ...value, name: key } : value);
  }
  return items;
}

function anchorLinkedRoiNames(anchor: JsonRecord): string[] {
  const names = new Set<string>();
  for (const field of [anchor.linked_observables, anchor.linked_ROIs]) {
    if (!Array.isArray(field)) {
      continue;
    }
    for (const value of field) {
      if (typeof value === "string" && value.length > 0) {
        names.add(value);
      }
    }
  }
  return [...names];
}

function syncAnchorLinkFields(draft: WorkspaceDraft): void {
  for (const anchor of draft.anchors) {
    const linkedRois = anchorLinkedRoiNames(anchor);
    if (linkedRois.length === 0) {
      continue;
    }
    anchor.linked_ROIs = [...linkedRois];
    anchor.linked_observables = [...linkedRois];
  }
}

function applyForcedRoiActivation(draft: WorkspaceDraft): void {
  const forcedNames = new Set<string>();
  for (const anchor of draft.anchors) {
    if (anchor.active === false) {
      continue;
    }
    for (const name of anchorLinkedRoiNames(anchor)) {
      forcedNames.add(name);
    }
  }

  for (const roi of draft.rois) {
    const name = asString(roi.name);
    if (name !== undefined && forcedNames.has(name)) {
      roi.active = true;
    }
  }
}

function descendantGroupNames(draft: WorkspaceDraft, rootName: string): Set<string> {
  const names = new Set<string>([rootName]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const group of draft.groups) {
      const groupName = asString(group.name);
      const parentName = itemGroupName(group);
      if (groupName !== undefined && parentName !== undefined && !names.has(groupName) && names.has(parentName)) {
        names.add(groupName);
        changed = true;
      }
    }
  }

  return names;
}

function itemGroupName(item: JsonRecord): string | undefined {
  return asString(item.parent) ?? asString(item.group);
}

function wouldCreateGroupCycle(draft: WorkspaceDraft, name: string, newParent: string): boolean {
  let current: string | undefined = newParent;
  const seen = new Set<string>();

  while (current !== undefined) {
    if (current === name) {
      return true;
    }
    if (seen.has(current)) {
      return false;
    }
    seen.add(current);
    const group = draft.groups.find((candidate) => asString(candidate.name) === current);
    current = group === undefined ? undefined : itemGroupName(group);
  }

  return false;
}
