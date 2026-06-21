import { groupDescendants, groupDisplayOptions } from "../../shared/groups.js";
import { cliParamToJson, runtimeLinkedObservables } from "../../shared/model.js";
import type { AnchorDraft, CliParamDraft, GroupDraft, RoiDraft } from "../../shared/model.js";
import type { AppState, CliSafetyField, FormFieldKey, TreeItemKey } from "../state.js";

export const cliSafetyFields: CliSafetyField[] = ["cooldown_s", "max_slew_per_s", "max_step", "max_value", "min_value", "ramp_interval_s"];

export interface CliMetaVisibility {
  showWritable: boolean;
  showSafetyMode: boolean;
  showGetDesc: boolean;
  showSetDesc: boolean;
  safetyFieldsEnabled: Partial<Record<CliSafetyField, boolean>>;
  rampEnabledVisible: boolean;
}

export type LinkedFrameMode = "anchor" | "cli" | "cli_action" | "none";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cleanLinkedValue(value: unknown): string {
  return String(value ?? "").trim();
}

function linkedValuesFromRawItem(rawItem: Record<string, unknown>): string[] {
  const raw = Array.isArray(rawItem.linked_observables) ? rawItem.linked_observables : Array.isArray(rawItem.linked_ROIs) ? rawItem.linked_ROIs : [];
  return raw.map(cleanLinkedValue).filter((name) => name.length > 0);
}

function uniqueNames(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const name = cleanLinkedValue(value);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

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
    return { name: anchor.name, x: String(anchor.x), y: String(anchor.y), w: "", h: "", tags: anchor.tags, description: anchor.description };
  }
  if (kind === "group") {
    const group = draft as GroupDraft;
    return { name: group.name, x: "", y: "", w: "", h: "", tags: group.tags, description: group.description };
  }
  const cli = draft as CliParamDraft;
  return { name: cli.name, tags: cli.tags, description: cli.description };
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
      exclude.add(summary.name);
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
  if (field === "description") return true;
  if (field === "tags") return true;
  if (field === "name") return true;
  if (itemKind === "roi") return field === "x" || field === "y" || field === "w" || field === "h";
  if (itemKind === "anchor") return field === "x" || field === "y" || field === "w" || field === "h";
  if (itemKind === "group") return field === "x" || field === "y" || field === "w" || field === "h";
  return false;
}

export function isFieldEnabled(itemKind: "roi" | "anchor" | "group" | "cli", field: FormFieldKey): boolean {
  if (itemKind === "cli") return field !== "name";
  if (itemKind === "anchor") return field !== "w" && field !== "h";
  if (itemKind === "group") return field === "name" || field === "tags" || field === "description";
  return true;
}

export function cliMetaVisibility(cli: CliParamDraft): CliMetaVisibility {
  const hasAction = isRecord(cli.action_cmd);
  const hasSet = !hasAction && isRecord(cli.set_cmd);
  const hasGet = !hasAction && isRecord(cli.get_cmd);
  const hasSafety = !hasAction && isRecord(cli.safety);
  const safetyFieldsEnabled: Partial<Record<CliSafetyField, boolean>> = {};
  for (const field of cliSafetyFields) {
    safetyFieldsEnabled[field] = Boolean(hasSafety && cli.safety?.[field] !== null && cli.safety?.[field] !== undefined);
  }
  return {
    showWritable: hasSet,
    showSafetyMode: hasAction,
    showGetDesc: hasGet,
    showSetDesc: hasSet,
    safetyFieldsEnabled,
    rampEnabledVisible: Boolean(hasSafety && cli.safety?.ramp_enabled !== null && cli.safety?.ramp_enabled !== undefined),
  };
}

export function cliPayloadPreviewText(cli: CliParamDraft): string {
  return JSON.stringify(cliParamToJson(cli), null, 2);
}

function selectedSingleDraft(state: AppState): { key: TreeItemKey; draft: RoiDraft | AnchorDraft | GroupDraft | CliParamDraft } | null {
  if (state.tree.selected.length !== 1) return null;
  const key = state.tree.selected[0]!;
  const draft = selectedDraft(state, key);
  return draft ? { key, draft } : null;
}

export function linkedFrameMode(state: AppState): LinkedFrameMode {
  const selected = selectedSingleDraft(state);
  if (!selected) return "none";
  if (selected.key.kind === "anchor") return "anchor";
  if (selected.key.kind === "cli") {
    const cli = selected.draft as CliParamDraft;
    return isRecord(cli.action_cmd) ? "cli_action" : "cli";
  }
  return "none";
}

export function linkedControlsEnabled(state: AppState): boolean {
  const selected = selectedSingleDraft(state);
  if (!selected) return false;
  const mode = linkedFrameMode(state);
  if (mode === "anchor") return true;
  if (mode === "cli" || mode === "cli_action") {
    const cli = selected.draft as CliParamDraft;
    return isRecord(cli.set_cmd) || isRecord(cli.action_cmd);
  }
  return false;
}

export function linkedListEntries(state: AppState): Array<{ name: string; editable: boolean }> {
  const selected = selectedSingleDraft(state);
  if (!selected) return [];
  const mode = linkedFrameMode(state);
  if (mode === "anchor") {
    const anchor = selected.draft as AnchorDraft;
    return anchor.linked_rois.map((name) => ({ name, editable: true }));
  }
  if (mode === "cli" || mode === "cli_action") {
    return runtimeLinkedObservables(selected.draft as CliParamDraft);
  }
  return [];
}

export function linkedPickerOptions(state: AppState): string[] {
  const selected = selectedSingleDraft(state);
  const mode = linkedFrameMode(state);
  let values: string[] = [];
  if (mode === "anchor") {
    values = state.workspace.rois.map((roi) => roi.name).filter((name) => name.length > 0);
  } else if ((mode === "cli" || mode === "cli_action") && selected?.key.kind === "cli") {
    const currentName = selected.key.name;
    const currentKey = currentName.toLowerCase();
    const cli = selected.draft as CliParamDraft;
    values = uniqueNames([
      ...state.workspace.cliParams.map((param) => param.name).filter((name) => name.length > 0 && name !== currentName),
      ...linkedValuesFromRawItem(cli.raw_item),
      ...cli.linked_observables,
    ]).filter((name) => name.toLowerCase() !== currentKey);
  }
  const query = state.form.linkedObs.searchText.trim().toLowerCase();
  if (!query) return values;
  return values.filter((name) => name.toLowerCase().includes(query));
}
