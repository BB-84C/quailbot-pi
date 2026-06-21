import type { AnchorDraft, CliParamDraft, GroupDraft, RoiDraft } from "./model.js";

export type SaveValidationError = {
  code: "empty_name" | "duplicate_name" | "roi_nonpositive_dim" | "group_cycle";
  message: string;
  itemKind?: "roi" | "anchor" | "group" | "cli";
  name?: string;
};

function addError(errors: SaveValidationError[], error: SaveValidationError): void {
  errors.push(error);
}

function applyForcedRoiActivation(rois: RoiDraft[], anchors: AnchorDraft[]): void {
  const forced = new Set<string>();
  for (const anchor of anchors) {
    if (!anchor.active) continue;
    for (const linked of anchor.linked_rois || []) {
      const key = String(linked).trim();
      if (key) forced.add(key);
    }
  }
  for (const roi of rois) {
    if (forced.has(roi.name)) {
      roi.active = true;
    }
  }
}

function pythonStringRepr(value: string): string {
  const escapedBackslashes = value.replaceAll("\\", "\\\\");
  if (escapedBackslashes.includes("'") && !escapedBackslashes.includes('"')) {
    return `"${escapedBackslashes.replaceAll('"', '\\"')}"`;
  }
  return `'${escapedBackslashes.replaceAll("'", "\\'")}'`;
}

export function validateAndNormalizeForSave(args: {
  rois: RoiDraft[];
  anchors: AnchorDraft[];
  groups: GroupDraft[];
  cliParams: CliParamDraft[];
}): { ok: true } | { ok: false; errors: SaveValidationError[] } {
  const { rois, anchors, groups, cliParams } = args;
  const errors: SaveValidationError[] = [];
  applyForcedRoiActivation(rois, anchors);

  const names = new Set<string>();
  const roiNames = new Set<string>();
  for (const roi of rois) {
    if (!roi.name.trim()) {
      addError(errors, { code: "empty_name", message: "ROI name cannot be empty", itemKind: "roi" });
      continue;
    }
    if (names.has(roi.name)) {
      addError(errors, { code: "duplicate_name", message: `Duplicate name: ${pythonStringRepr(roi.name)}`, itemKind: "roi", name: roi.name });
    }
    names.add(roi.name);
    roiNames.add(roi.name);
    if (roi.w <= 0 || roi.h <= 0) {
      addError(errors, { code: "roi_nonpositive_dim", message: `ROI ${pythonStringRepr(roi.name)} must have positive w/h`, itemKind: "roi", name: roi.name });
    }
  }

  for (const anchor of anchors) {
    if (!anchor.name.trim()) {
      addError(errors, { code: "empty_name", message: "Anchor name cannot be empty", itemKind: "anchor" });
      continue;
    }
    if (names.has(anchor.name)) {
      addError(errors, { code: "duplicate_name", message: `Duplicate name: ${pythonStringRepr(anchor.name)}`, itemKind: "anchor", name: anchor.name });
    }
    names.add(anchor.name);
    anchor.linked_rois = (anchor.linked_rois || []).filter((name) => roiNames.has(name));
  }

  for (const param of cliParams) {
    if (!param.name.trim()) {
      addError(errors, { code: "empty_name", message: "CLI parameter name cannot be empty", itemKind: "cli" });
      continue;
    }
    if (names.has(param.name)) {
      addError(errors, { code: "duplicate_name", message: `Duplicate name: ${pythonStringRepr(param.name)}`, itemKind: "cli", name: param.name });
    }
    names.add(param.name);
    const normalizedLinks: string[] = [];
    const seenLinks = new Set<string>();
    for (const linked of param.linked_observables) {
      const key = String(linked).trim();
      if (!key || seenLinks.has(key)) continue;
      normalizedLinks.push(key);
      seenLinks.add(key);
    }
    param.linked_observables = normalizedLinks;
  }

  const groupNames = new Set<string>();
  for (const group of groups) {
    if (!group.name.trim()) {
      addError(errors, { code: "empty_name", message: "Group name cannot be empty", itemKind: "group" });
      continue;
    }
    if (names.has(group.name)) {
      addError(errors, { code: "duplicate_name", message: `Duplicate name: ${pythonStringRepr(group.name)}`, itemKind: "group", name: group.name });
    }
    names.add(group.name);
    groupNames.add(group.name);
  }

  for (const group of groups) {
    if (group.group && !groupNames.has(group.group)) {
      group.group = "";
    }
  }
  for (const roi of rois) {
    if (roi.group && !groupNames.has(roi.group)) {
      roi.group = "";
    }
  }
  for (const anchor of anchors) {
    if (anchor.group && !groupNames.has(anchor.group)) {
      anchor.group = "";
    }
  }
  for (const param of cliParams) {
    if (param.group && !groupNames.has(param.group)) {
      param.group = "";
    }
  }

  for (const group of groups) {
    const seen = new Set<string>();
    let current: GroupDraft | undefined = group;
    while (current?.group) {
      if (seen.has(current.group)) {
        addError(errors, { code: "group_cycle", message: `Group cycle detected at ${pythonStringRepr(current.name)}`, itemKind: "group", name: current.name });
        break;
      }
      seen.add(current.group);
      current = groups.find((candidate) => candidate.name === current?.group);
      if (current === undefined) break;
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true };
}
