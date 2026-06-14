import { arrayOfRecords, asString, cloneJson, isRecord, record, type JsonRecord } from "./json.js";

export type WorkspaceDraft = { root: JsonRecord; groups: JsonRecord[]; rois: JsonRecord[]; anchors: JsonRecord[] };

type VisualKind = "group" | "roi" | "anchor";

export function createWorkspaceDraft(input: unknown): WorkspaceDraft {
  const root = cloneJson(record(input));
  const gui = record(root.GUI);

  return {
    root,
    groups: arrayOfRecords(isRecord(root.GUI) && gui.groups !== undefined ? gui.groups : root.groups),
    rois: arrayOfRecords(isRecord(root.GUI) && gui.rois !== undefined ? gui.rois : root.rois),
    anchors: arrayOfRecords(isRecord(root.GUI) && gui.anchors !== undefined ? gui.anchors : root.anchors),
  };
}

export function serializeWorkspaceDraft(draft: WorkspaceDraft): JsonRecord {
  const output = cloneJson(draft.root);
  delete output.GUI;
  output.groups = cloneJson(draft.groups);
  output.rois = cloneJson(draft.rois);
  output.anchors = cloneJson(draft.anchors);
  return output;
}

export function addGroup(draft: WorkspaceDraft, input: { name: string; parent?: string; active?: boolean }): void {
  ensureUniqueName(draft, input.name);
  if (input.parent !== undefined) {
    ensureGroupExists(draft, input.parent);
  }

  const group: JsonRecord = { name: input.name };
  if (input.parent !== undefined) group.parent = input.parent;
  if (input.active !== undefined) group.active = input.active;
  draft.groups.push(group);
}

export function addRoi(
  draft: WorkspaceDraft,
  input: { name: string; group?: string; active?: boolean; x?: number; y?: number; w?: number; h?: number },
): void {
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
  ensureUniqueName(draft, input.name);
  if (input.group !== undefined) {
    ensureGroupExists(draft, input.group);
  }

  const anchor: JsonRecord = { name: input.name };
  if (input.group !== undefined) anchor.group = input.group;
  if (input.active !== undefined) anchor.active = input.active;
  if (input.x !== undefined) anchor.x = input.x;
  if (input.y !== undefined) anchor.y = input.y;
  if (input.linked_ROIs !== undefined) anchor.linked_ROIs = [...input.linked_ROIs];
  draft.anchors.push(anchor);
}

export function updateRoiGeometry(
  draft: WorkspaceDraft,
  name: string,
  geometry: { x: number; y: number; w: number; h: number },
): void {
  if (geometry.w <= 0 || geometry.h <= 0) {
    throw new Error("ROI width and height must be positive");
  }

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
    target.parent = groupName;
    delete target.group;
    return;
  }

  target.group = groupName;
  delete target.parent;
}

function ensureUniqueName(draft: WorkspaceDraft, name: string): void {
  if (allNamedItems(draft).some((item) => asString(item.name) === name)) {
    throw new Error(`duplicate name conflict: ${name}`);
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
  return [...draft.groups, ...draft.rois, ...draft.anchors];
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
