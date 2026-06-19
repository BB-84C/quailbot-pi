import type { AnchorDraft, CliParamDraft, GroupDraft, RoiDraft } from "./model.js";

export function splitTags(value: string): string[] {
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

export function filterTerms(keyword: string): string[] {
  return String(keyword || "")
    .split(",")
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length > 0);
}

export type FilterState = {
  selectedTags: string[];
  terms: string[];
  logic: "AND" | "OR";
};

export type FilterItemKind = "roi" | "anchor" | "group" | "cli";

function matchTerms(terms: string[], kind: FilterItemKind, item: RoiDraft | AnchorDraft | GroupDraft | CliParamDraft, logic: "AND" | "OR"): boolean {
  const fields: string[] = [];
  const name = item.name || "";
  const description = item.description || "";
  if (name) {
    fields.push(String(name));
  }
  if (description) {
    fields.push(String(description));
  }
  if (kind === "anchor") {
    fields.push(...((item as AnchorDraft).linked_rois || []).map((value) => String(value)).filter((value) => value.trim().length > 0));
  } else if (kind === "cli") {
    fields.push(...((item as CliParamDraft).linked_observables || []).map((value) => String(value)).filter((value) => value.trim().length > 0));
  }
  const fieldsLower = fields.map((field) => field.toLowerCase());
  const termMatches = (term: string): boolean => fieldsLower.some((field) => field.includes(term));
  if (logic === "AND") {
    return terms.every((term) => termMatches(term));
  }
  return terms.some((term) => termMatches(term));
}

export function itemMatchesFilter(kind: FilterItemKind, item: RoiDraft | AnchorDraft | GroupDraft | CliParamDraft, state: FilterState): boolean {
  let tagMatch = true;
  const selectedTags = state.selectedTags.map((tag) => tag.toLowerCase());
  if (selectedTags.length > 0) {
    const itemTags = splitTags(item.tags).map((tag) => tag.toLowerCase());
    tagMatch = selectedTags.some((tag) => itemTags.includes(tag));
  }

  const keywordMatch = state.terms.length === 0 ? true : matchTerms(state.terms, kind, item, state.logic);
  return tagMatch && keywordMatch;
}

export function collectTagCounts(args: { rois: RoiDraft[]; anchors: AnchorDraft[]; groups: GroupDraft[]; cliParams: CliParamDraft[] }): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  const addTags = (tags: string): void => {
    for (const tag of new Set(splitTags(tags))) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  };

  for (const roi of args.rois) {
    addTags(roi.tags);
  }
  for (const anchor of args.anchors) {
    addTags(anchor.tags);
  }
  for (const group of args.groups) {
    addTags(group.tags);
  }
  for (const param of args.cliParams) {
    addTags(param.tags);
  }

  return [...counts.entries()]
    .sort(([tagA, countA], [tagB, countB]) => {
      if (countA !== countB) {
        return countB - countA;
      }
      const lowerA = tagA.toLowerCase();
      const lowerB = tagB.toLowerCase();
      if (lowerA === lowerB) {
        return 0;
      }
      return lowerA < lowerB ? -1 : 1;
    })
    .map(([tag, count]) => ({ tag, count }));
}

export function subtreeVisibility(args: {
  groups: GroupDraft[];
  rois: RoiDraft[];
  anchors: AnchorDraft[];
  cliParams: CliParamDraft[];
  state: FilterState;
}): Set<string> {
  const groupNames = new Set(args.groups.map((group) => group.name).filter((name) => name.length > 0));
  const groupsByParent = new Map<string, number[]>();
  const itemsByParent = new Map<string, Array<{ kind: Exclude<FilterItemKind, "group">; idx: number }>>();

  const parentKey = (groupName: string): string => (groupNames.has(groupName) ? groupName : "");
  for (let idx = 0; idx < args.groups.length; idx += 1) {
    const group = args.groups[idx];
    if (!group) {
      continue;
    }
    const parent = parentKey(group.group);
    const bucket = groupsByParent.get(parent) ?? [];
    bucket.push(idx);
    groupsByParent.set(parent, bucket);
  }

  const addItem = (parent: string, kind: Exclude<FilterItemKind, "group">, idx: number): void => {
    const bucket = itemsByParent.get(parent) ?? [];
    bucket.push({ kind, idx });
    itemsByParent.set(parent, bucket);
  };
  args.rois.forEach((item, idx) => addItem(parentKey(item.group), "roi", idx));
  args.anchors.forEach((item, idx) => addItem(parentKey(item.group), "anchor", idx));
  args.cliParams.forEach((item, idx) => addItem(parentKey(item.group), "cli", idx));

  const itemFor = (kind: Exclude<FilterItemKind, "group">, idx: number): RoiDraft | AnchorDraft | CliParamDraft => {
    if (kind === "roi") {
      return args.rois[idx] as RoiDraft;
    }
    if (kind === "anchor") {
      return args.anchors[idx] as AnchorDraft;
    }
    return args.cliParams[idx] as CliParamDraft;
  };

  const visible = new Set<string>();
  const recursionStack = new Set<number>();
  const subtreeVisible = (groupIdx: number): boolean => {
    if (recursionStack.has(groupIdx)) {
      return false;
    }
    recursionStack.add(groupIdx);
    const group = args.groups[groupIdx];
    if (!group) {
      recursionStack.delete(groupIdx);
      return false;
    }
    if (itemMatchesFilter("group", group, args.state)) {
      recursionStack.delete(groupIdx);
      return true;
    }
    for (const childGroupIdx of groupsByParent.get(group.name) ?? []) {
      if (subtreeVisible(childGroupIdx)) {
        recursionStack.delete(groupIdx);
        return true;
      }
    }
    for (const item of itemsByParent.get(group.name) ?? []) {
      if (itemMatchesFilter(item.kind, itemFor(item.kind, item.idx), args.state)) {
        recursionStack.delete(groupIdx);
        return true;
      }
    }
    recursionStack.delete(groupIdx);
    return false;
  };

  const addItems = (parentName: string): void => {
    for (const groupIdx of groupsByParent.get(parentName) ?? []) {
      const group = args.groups[groupIdx];
      if (!group || !subtreeVisible(groupIdx)) {
        continue;
      }
      visible.add(`group:${group.name}`);
      addItems(group.name);
    }
    for (const item of itemsByParent.get(parentName) ?? []) {
      const draft = itemFor(item.kind, item.idx);
      if (!itemMatchesFilter(item.kind, draft, args.state)) {
        continue;
      }
      visible.add(`${item.kind}:${draft.name}`);
    }
  };

  addItems("");
  return visible;
}
