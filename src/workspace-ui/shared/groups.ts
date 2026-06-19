import type { AnchorDraft, CliParamDraft, GroupDraft, RoiDraft } from "./model.js";

export type DeleteItemKind = "roi" | "anchor" | "group" | "cli";

function cleanName(value: string): string {
  return String(value || "").trim();
}

export function groupDescendants(groups: GroupDraft[], rootName: string): Set<string> {
  // Python parity: `_group_descendants` returns descendants only. The root name is
  // the initial queue seed but is never included in the returned set.
  const out = new Set<string>();
  const root = String(rootName || "");
  const pending = [root];
  while (pending.length > 0) {
    const cur = pending.pop() ?? "";
    for (const group of groups) {
      if (group.group === cur && group.name && !out.has(group.name)) {
        out.add(group.name);
        pending.push(group.name);
      }
    }
  }
  return out;
}

export function dedupeName(existing: Set<string>, base: string): string {
  if (!existing.has(base)) {
    return base;
  }
  let i = 2;
  while (existing.has(`${base}_${i}`)) {
    i += 1;
  }
  return `${base}_${i}`;
}

export function groupDisplayOptions(groups: GroupDraft[], exclude: Set<string>): Array<{ display: string; name: string }> {
  const expandedExclude = new Set<string>(exclude);
  for (const name of exclude) {
    for (const descendant of groupDescendants(groups, name)) {
      expandedExclude.add(descendant);
    }
  }

  const groupNames = new Set(groups.map((group) => group.name).filter((name) => name.length > 0));
  const groupsByParent = new Map<string, GroupDraft[]>();
  for (const group of groups) {
    if (!group.name || expandedExclude.has(group.name)) {
      continue;
    }
    const parent = groupNames.has(group.group) && !expandedExclude.has(group.group) ? group.group : "";
    const bucket = groupsByParent.get(parent) ?? [];
    bucket.push(group);
    groupsByParent.set(parent, bucket);
  }

  const out: Array<{ display: string; name: string }> = [];
  const seen = new Set<string>();
  const add = (parent: string, depth: number): void => {
    const children = [...(groupsByParent.get(parent) ?? [])].sort((a, b) => {
      const al = a.name.toLowerCase();
      const bl = b.name.toLowerCase();
      if (al !== bl) {
        return al < bl ? -1 : 1;
      }
      if (a.name === b.name) {
        return 0;
      }
      return a.name < b.name ? -1 : 1;
    });
    for (const group of children) {
      if (seen.has(group.name)) {
        continue;
      }
      seen.add(group.name);
      out.push({ display: `${"  ".repeat(Math.max(0, depth))}${group.name}`, name: group.name });
      add(group.name, depth + 1);
    }
  };

  add("", 0);
  return out;
}

export function setGroupActiveCascade(args: {
  groups: GroupDraft[];
  rois: RoiDraft[];
  anchors: AnchorDraft[];
  cliParams: CliParamDraft[];
  groupName: string;
  active: boolean;
}): void {
  const visited = new Set<string>();
  const setGroup = (groupName: string): void => {
    if (visited.has(groupName)) {
      return;
    }
    visited.add(groupName);
    for (const group of args.groups) {
      if (group.group === groupName) {
        group.active = args.active;
        setGroup(group.name);
      }
    }
    for (const roi of args.rois) {
      if (roi.group === groupName) {
        roi.active = args.active;
      }
    }
    for (const anchor of args.anchors) {
      if (anchor.group === groupName) {
        anchor.active = args.active;
      }
    }
    for (const param of args.cliParams) {
      if (param.group === groupName) {
        param.enabled = args.active;
      }
    }
  };

  setGroup(args.groupName);
}

export function renameGroupCascade(args: {
  groups: GroupDraft[];
  rois: RoiDraft[];
  anchors: AnchorDraft[];
  cliParams: CliParamDraft[];
  oldName: string;
  newName: string;
}): void {
  for (const group of args.groups) {
    if (group.name === args.oldName) {
      group.name = args.newName;
    }
    if (group.group === args.oldName) {
      group.group = args.newName;
    }
  }
  for (const roi of args.rois) {
    if (roi.group === args.oldName) {
      roi.group = args.newName;
    }
  }
  for (const anchor of args.anchors) {
    if (anchor.group === args.oldName) {
      anchor.group = args.newName;
    }
  }
  for (const param of args.cliParams) {
    if (param.group === args.oldName) {
      param.group = args.newName;
    }
  }
}

export function deleteItems(args: {
  groups: GroupDraft[];
  rois: RoiDraft[];
  anchors: AnchorDraft[];
  cliParams: CliParamDraft[];
  selected: Array<{ kind: DeleteItemKind; idx: number }>;
}): void {
  const buckets: Record<DeleteItemKind, Set<number>> = {
    roi: new Set<number>(),
    anchor: new Set<number>(),
    group: new Set<number>(),
    cli: new Set<number>(),
  };
  for (const item of args.selected) {
    buckets[item.kind]?.add(Math.trunc(item.idx));
  }

  const removedRoiNames = new Set<string>();
  for (const idx of buckets.roi) {
    if (idx >= 0 && idx < args.rois.length) {
      const key = cleanName(args.rois[idx]?.name ?? "");
      if (key) {
        removedRoiNames.add(key);
      }
    }
  }

  const originalGroupParent = new Map<string, string>();
  for (const group of args.groups) {
    const key = cleanName(group.name);
    if (key) {
      originalGroupParent.set(key, cleanName(group.group));
    }
  }

  for (const idx of [...buckets.roi].filter((idx) => idx >= 0 && idx < args.rois.length).sort((a, b) => b - a)) {
    args.rois.splice(idx, 1);
  }
  for (const idx of [...buckets.anchor].filter((idx) => idx >= 0 && idx < args.anchors.length).sort((a, b) => b - a)) {
    args.anchors.splice(idx, 1);
  }
  for (const idx of [...buckets.cli].filter((idx) => idx >= 0 && idx < args.cliParams.length).sort((a, b) => b - a)) {
    args.cliParams.splice(idx, 1);
  }

  const removedGroupNames = new Set<string>();
  for (const idx of buckets.group) {
    if (idx >= 0 && idx < args.groups.length) {
      const key = cleanName(args.groups[idx]?.name ?? "");
      if (key) {
        removedGroupNames.add(key);
      }
    }
  }
  for (const idx of [...buckets.group].filter((idx) => idx >= 0 && idx < args.groups.length).sort((a, b) => b - a)) {
    args.groups.splice(idx, 1);
  }

  if (removedGroupNames.size > 0) {
    const existingGroupNames = new Set(args.groups.map((group) => cleanName(group.name)).filter((name) => name.length > 0));
    const resolveParent = (groupName: string): string => {
      let current = cleanName(groupName);
      const seen = new Set<string>();
      while (current && !existingGroupNames.has(current) && !seen.has(current)) {
        seen.add(current);
        current = cleanName(originalGroupParent.get(current) ?? "");
      }
      return existingGroupNames.has(current) ? current : "";
    };

    for (const group of args.groups) {
      group.group = resolveParent(group.group);
    }
    for (const roi of args.rois) {
      roi.group = resolveParent(roi.group);
    }
    for (const anchor of args.anchors) {
      anchor.group = resolveParent(anchor.group);
    }
    for (const param of args.cliParams) {
      param.group = resolveParent(param.group);
    }
  }

  if (removedRoiNames.size > 0) {
    for (const anchor of args.anchors) {
      anchor.linked_rois = (anchor.linked_rois || []).filter((name) => !removedRoiNames.has(String(name)));
    }
  }
}

export function wouldCreateGroupCycle(groups: GroupDraft[], childName: string, newParent: string): boolean {
  const child = String(childName || "");
  let current = String(newParent || "");
  if (!child || !current) {
    return false;
  }
  if (!groups.some((group) => group.name === child)) {
    return false;
  }
  const parentByName = new Map<string, string>();
  for (const group of groups) {
    if (group.name) {
      parentByName.set(group.name, group.group || "");
    }
  }
  const seen = new Set<string>();
  while (current) {
    if (current === child) {
      return true;
    }
    if (seen.has(current)) {
      return false;
    }
    seen.add(current);
    current = parentByName.get(current) ?? "";
  }
  return false;
}
