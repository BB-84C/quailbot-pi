import { groupDescendants, groupDisplayOptions } from "../../shared/groups.js";
import type { AnchorDraft, CliParamDraft, GroupDraft, RoiDraft } from "../../shared/model.js";
import type { AppState, FormFieldKey, TreeItemKey } from "../state.js";

export type SelectionSummary =
  | { kind: "none" }
  | { kind: "single"; itemKind: "roi" | "anchor" | "group" | "cli"; name: string; fields: Partial<Record<FormFieldKey, string>>; groupValue: string }
  | { kind: "multi"; count: number; commonGroup: string | "(mixed)" };

function selectedDraft(state: AppState, key: TreeItemKey): RoiDraft | AnchorDraft | GroupDraft | CliParamDraft | null {
  if (key.kind === "roi") return state.workspace.rois.find((item) => item.name === key.name) ?? null;
  if (key.kind === "anchor") return state.workspace.anchors.find((item) => item.name === key.name) ?? null;
  if (key.kind === "group") return state.workspace.groups.find((item) => item.name === key.name) ?? null;
  return state.workspace.cliParams.find((item) => item.name === key.name) ?? null;
}

function groupOf(state: AppState, key: TreeItemKey): string | null {
  const draft = selectedDraft(state, key);
  return draft ? String(draft.group || "") : null;
}

function fieldsFor(kind: TreeItemKey["kind"], draft: RoiDraft | AnchorDraft | GroupDraft | CliParamDraft): Partial<Record<FormFieldKey, string>> {
  if (kind === "roi") {
    const roi = draft as RoiDraft;
    return { name: roi.name, x: String(roi.x), y: String(roi.y), w: String(roi.w), h: String(roi.h), tags: roi.tags, description: roi.description };
  }
  if (kind === "anchor") {
    const anchor = draft as AnchorDraft;
    return { name: anchor.name, x: String(anchor.x), y: String(anchor.y), tags: anchor.tags, description: anchor.description };
  }
  if (kind === "group") {
    const group = draft as GroupDraft;
    return { name: group.name, tags: group.tags, description: group.description };
  }
  const cli = draft as CliParamDraft;
  return { name: cli.name };
}

export function selectionSummary(state: AppState): SelectionSummary {
  if (state.tree.selected.length === 0) {
    return { kind: "none" };
  }
  if (state.tree.selected.length > 1) {
    const values = state.tree.selected.map((key) => groupOf(state, key)).filter((value): value is string => value !== null);
    const first = values[0] ?? "";
    const commonGroup = values.length === state.tree.selected.length && values.every((value) => value === first) ? first : "(mixed)";
    return { kind: "multi", count: state.tree.selected.length, commonGroup };
  }
  const key = state.tree.selected[0]!;
  const draft = selectedDraft(state, key);
  if (!draft) {
    return { kind: "none" };
  }
  return { kind: "single", itemKind: key.kind, name: key.name, fields: fieldsFor(key.kind, draft), groupValue: String(draft.group || "") };
}

export function groupComboboxOptions(state: AppState): Array<{ display: string; value: string; selected: boolean }> {
  const summary = selectionSummary(state);
  const exclude = new Set<string>();
  let selectedValue = "";
  if (summary.kind === "single") {
    selectedValue = summary.groupValue;
    if (summary.itemKind === "group") {
      for (const name of groupDescendants(state.workspace.groups, summary.name)) {
        exclude.add(name);
      }
    }
  } else if (summary.kind === "multi") {
    selectedValue = summary.commonGroup;
  }

  const options: Array<{ display: string; value: string; selected: boolean }> = [];
  if (selectedValue === "(mixed)") {
    options.push({ display: "(mixed)", value: "(mixed)", selected: true });
  }
  options.push({ display: "(none)", value: "", selected: selectedValue === "" });
  for (const option of groupDisplayOptions(state.workspace.groups, exclude)) {
    options.push({ display: option.display, value: option.name, selected: selectedValue === option.name });
  }
  return options;
}

export function shouldShowField(itemKind: "roi" | "anchor" | "group" | "cli", field: FormFieldKey): boolean {
  if (field === "description") return itemKind !== "cli";
  if (field === "tags") return itemKind !== "cli";
  if (field === "name") return true;
  if (itemKind === "roi") return field === "x" || field === "y" || field === "w" || field === "h";
  if (itemKind === "anchor") return field === "x" || field === "y";
  return false;
}
