import { renameGroupCascade, wouldCreateGroupCycle } from "../../shared/groups.js";
import { editableLinkedObservables, runtimeLinkedObservables, syncActionsFromMetadata } from "../../shared/model.js";
import { normalizeSafetyMode, safeFloat } from "../../shared/parse.js";
import type { AnchorDraft, CliParamDraft, GroupDraft, RoiDraft } from "../../shared/model.js";
import type { FormAction } from "../actions.js";
import { cliSafetyFields, linkedControlsEnabled, linkedFrameMode, linkedListEntries, linkedPickerOptions } from "../selectors/form.js";
import type { AppState, CliMetaBuffers, CliSafetyField, FieldHistory, FormFieldKey, TreeItemKey } from "../state.js";

type WorkspaceClone = AppState["workspace"];

function cloneWorkspace(workspace: AppState["workspace"]): WorkspaceClone {
  return {
    ...workspace,
    rois: workspace.rois.map((roi) => ({ ...roi })),
    anchors: workspace.anchors.map((anchor) => ({ ...anchor, linked_rois: [...anchor.linked_rois] })),
    groups: workspace.groups.map((group) => ({ ...group })),
    cliParams: workspace.cliParams.map((param) => ({
      ...param,
      safety: cloneNullableRecord(param.safety),
      get_cmd: cloneNullableRecord(param.get_cmd),
      set_cmd: cloneNullableRecord(param.set_cmd),
      action_cmd: cloneNullableRecord(param.action_cmd),
      raw_item: { ...param.raw_item },
      linked_observables: [...param.linked_observables],
    })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneNullableRecord(value: Record<string, unknown> | null): Record<string, unknown> | null {
  return isRecord(value) ? { ...value } : null;
}

function historyFor(text: string): FieldHistory {
  return { entries: [{ text, cursor: text.length }], index: 0 };
}

function recordHistory(history: FieldHistory | undefined, text: string, cursor: number): FieldHistory {
  const current = history ?? historyFor("");
  const entries = current.entries.length > 0 ? current.entries : [{ text: "", cursor: 0 }];
  const last = entries[current.index] ?? entries[entries.length - 1]!;
  if (last.text === text) {
    const nextEntries = entries.slice(0, current.index + 1);
    nextEntries[current.index] = { text, cursor };
    return { entries: nextEntries, index: current.index };
  }
  const nextEntries = entries.slice(0, current.index + 1);
  nextEntries.push({ text, cursor });
  return { entries: nextEntries, index: nextEntries.length - 1 };
}

function selectedDraft(workspace: WorkspaceClone, key: TreeItemKey): RoiDraft | AnchorDraft | GroupDraft | CliParamDraft | null {
  if (key.kind === "roi") return workspace.rois.find((item) => item.name === key.name) ?? null;
  if (key.kind === "anchor") return workspace.anchors.find((item) => item.name === key.name) ?? null;
  if (key.kind === "group") return workspace.groups.find((item) => item.name === key.name) ?? null;
  return workspace.cliParams.find((item) => item.name === key.name) ?? null;
}

function selectedCli(workspace: WorkspaceClone, key: TreeItemKey | undefined): CliParamDraft | null {
  if (!key || key.kind !== "cli") return null;
  return workspace.cliParams.find((item) => item.name === key.name) ?? null;
}

function cliMetaBuffersForSelection(state: AppState): CliMetaBuffers {
  if (state.tree.selected.length !== 1) return {};
  const cli = selectedCli(state.workspace, state.tree.selected[0]);
  if (!cli) return {};
  const safety: Partial<Record<CliSafetyField, string>> = {};
  if (isRecord(cli.safety)) {
    for (const field of cliSafetyFields) {
      const value = cli.safety[field];
      if (value !== null && value !== undefined) {
        safety[field] = String(value);
      }
    }
  }
  return {
    writable: Boolean(cli.writable),
    safetyMode: normalizeSafetyMode(cli.safety_mode),
    getCmdDescription: isRecord(cli.get_cmd) ? String(cli.get_cmd.description ?? "") : "",
    setCmdDescription: isRecord(cli.set_cmd) ? String(cli.set_cmd.description ?? "") : "",
    safety,
    safetyRampEnabled: isRecord(cli.safety) ? Boolean(cli.safety.ramp_enabled) : undefined,
  };
}

function setGroup(draft: RoiDraft | AnchorDraft | GroupDraft | CliParamDraft, groupName: string): void {
  draft.group = groupName;
}

function parseIntegerOrKeep(text: string, previous: number, positive: boolean): number {
  const n = Math.trunc(Number(text));
  if (!Number.isFinite(n)) return previous;
  if (positive && n <= 0) return previous;
  return n;
}

function commitDescriptionHistory(state: AppState, text: string): AppState {
  const history = recordHistory(state.form.history.description, text, text.length);
  return { ...state, form: { ...state.form, history: { ...state.form.history, description: history } } };
}

function applyHistoryMove(state: AppState, field: FormFieldKey, direction: -1 | 1): AppState {
  const history = state.form.history[field];
  if (!history) return state;
  const index = Math.max(0, Math.min(history.entries.length - 1, history.index + direction));
  const entry = history.entries[index];
  if (!entry || index === history.index) return state;
  const nextState = {
    ...state,
    form: {
      ...state.form,
      buffers: { ...state.form.buffers, [field]: entry.text },
      history: { ...state.form.history, [field]: { ...history, index } },
    },
  };
  return commitField(nextState, field, { recordDescriptionHistory: false });
}

function commitField(state: AppState, field: FormFieldKey, options: { recordDescriptionHistory?: boolean } = {}): AppState {
  if (state.tree.selected.length !== 1) return state;
  const key = state.tree.selected[0]!;
  const workspace = cloneWorkspace(state.workspace);
  const draft = selectedDraft(workspace, key);
  if (!draft) return state;
  const text = state.form.buffers[field] ?? "";

  if (field === "description") {
    draft.description = text;
    const nextState = { ...state, workspace };
    return options.recordDescriptionHistory === false ? nextState : commitDescriptionHistory(nextState, text);
  }
  if (field === "tags") {
    draft.tags = text;
    return { ...state, workspace };
  }
  if (key.kind === "cli") return state;
  if (field === "name") {
    const nextName = text.trim();
    if (!nextName) return state;
    if (key.kind === "group") {
      const oldName = (draft as GroupDraft).name;
      if (oldName !== nextName) {
        renameGroupCascade({ groups: workspace.groups, rois: workspace.rois, anchors: workspace.anchors, cliParams: workspace.cliParams, oldName, newName: nextName });
        const nextKey = { kind: "group" as const, name: nextName };
        return { ...state, workspace, tree: { ...state.tree, selected: [nextKey], activeAnchor: nextKey } };
      }
      return state;
    }
    draft.name = nextName;
    const nextKey = { kind: key.kind, name: nextName };
    return { ...state, workspace, tree: { ...state.tree, selected: [nextKey], activeAnchor: nextKey } };
  }
  if (key.kind === "roi") {
    const roi = draft as RoiDraft;
    if (field === "x") roi.x = parseIntegerOrKeep(text, roi.x, false);
    if (field === "y") roi.y = parseIntegerOrKeep(text, roi.y, false);
    if (field === "w") roi.w = parseIntegerOrKeep(text, roi.w, true);
    if (field === "h") roi.h = parseIntegerOrKeep(text, roi.h, true);
    return { ...state, workspace };
  }
  if (key.kind === "anchor") {
    const anchor = draft as AnchorDraft;
    if (field === "x") anchor.x = parseIntegerOrKeep(text, anchor.x, false);
    if (field === "y") anchor.y = parseIntegerOrKeep(text, anchor.y, false);
    return { ...state, workspace };
  }
  return state;
}

function withCliMetaBuffer(state: AppState, cliMeta: CliMetaBuffers): AppState {
  return { ...state, form: { ...state.form, cliMeta: { ...state.form.cliMeta, ...cliMeta } } };
}

function applyCliMetaChange(state: AppState, mutate: (cli: CliParamDraft) => void, cliMeta?: CliMetaBuffers): AppState {
  if (state.tree.selected.length !== 1) return state;
  const workspace = cloneWorkspace(state.workspace);
  const cli = selectedCli(workspace, state.tree.selected[0]);
  if (!cli) return state;
  mutate(cli);
  syncActionsFromMetadata(cli);
  return { ...state, workspace, form: { ...state.form, cliMeta: { ...state.form.cliMeta, ...(cliMeta ?? {}) } } };
}

function previousNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function editCliSafetyField(state: AppState, field: CliSafetyField, text: string, commit: boolean | undefined): AppState {
  const nextSafetyBuffer = { ...(state.form.cliMeta.safety ?? {}), [field]: text };
  if (!commit) {
    return withCliMetaBuffer(state, { safety: nextSafetyBuffer });
  }
  return applyCliMetaChange(
    state,
    (cli) => {
      if (!isRecord(cli.safety) || cli.safety[field] === null || cli.safety[field] === undefined) return;
      cli.safety[field] = safeFloat(text, previousNumber(cli.safety[field]));
    },
    { safety: nextSafetyBuffer },
  );
}

function editGroup(state: AppState, groupName: string): AppState {
  if (groupName === "(mixed)") return state;
  const selected = state.tree.selected;
  if (selected.length === 0) return state;
  for (const key of selected) {
    if (key.kind === "group" && wouldCreateGroupCycle(state.workspace.groups, key.name, groupName)) {
      return { ...state, form: { ...state.form, lastCycleRejection: { selectedGroup: key.name, attemptedParent: groupName } } };
    }
  }
  const workspace = cloneWorkspace(state.workspace);
  for (const key of selected) {
    const draft = selectedDraft(workspace, key);
    if (draft) setGroup(draft, groupName);
  }
  const { lastCycleRejection: _lastCycleRejection, ...formRest } = state.form;
  return { ...state, workspace, form: formRest };
}

function cleanLinkedName(value: string): string {
  return String(value || "").trim();
}

function selectedAnchor(workspace: WorkspaceClone, key: TreeItemKey | undefined): AnchorDraft | null {
  if (!key || key.kind !== "anchor") return null;
  return workspace.anchors.find((item) => item.name === key.name) ?? null;
}

function syncLinkedPickerToOptions(state: AppState): AppState {
  const options = linkedPickerOptions(state);
  const pickerValue = options.includes(state.form.linkedObs.pickerValue) ? state.form.linkedObs.pickerValue : (options[0] ?? "");
  const linkedNames = new Set(linkedListEntries(state).map((entry) => entry.name));
  const selectedNames = state.form.linkedObs.selectedNames.filter((name) => linkedNames.has(name));
  if (pickerValue === state.form.linkedObs.pickerValue && selectedNames.length === state.form.linkedObs.selectedNames.length) return state;
  return { ...state, form: { ...state.form, linkedObs: { ...state.form.linkedObs, pickerValue, selectedNames } } };
}

function addLinkedObservable(state: AppState): AppState {
  if (!linkedControlsEnabled(state)) return state;
  const options = linkedPickerOptions(state);
  const rawValue = state.form.linkedObs.pickerValue || options[0] || "";
  const name = cleanLinkedName(rawValue);
  if (!name || !options.includes(name)) return state;
  const key = state.tree.selected[0];
  const mode = linkedFrameMode(state);
  const workspace = cloneWorkspace(state.workspace);
  if (mode === "anchor") {
    const anchor = selectedAnchor(workspace, key);
    if (!anchor || anchor.linked_rois.includes(name)) return state;
    anchor.linked_rois = [...anchor.linked_rois, name];
    return { ...state, workspace, form: { ...state.form, linkedObs: { ...state.form.linkedObs, pickerValue: name } } };
  }
  if (mode === "cli" || mode === "cli_action") {
    const cli = selectedCli(workspace, key);
    if (!cli) return state;
    const runtimeEntries = runtimeLinkedObservables(cli);
    if (runtimeEntries.some((entry) => entry.name === name)) return state;
    cli.linked_observables = [...editableLinkedObservables(cli), name];
    syncActionsFromMetadata(cli);
    return { ...state, workspace, form: { ...state.form, linkedObs: { ...state.form.linkedObs, pickerValue: name } } };
  }
  return state;
}

function removeLinkedObservable(state: AppState, value: string): AppState {
  if (!linkedControlsEnabled(state)) return state;
  const name = cleanLinkedName(value);
  if (!name) return state;
  const key = state.tree.selected[0];
  const mode = linkedFrameMode(state);
  const workspace = cloneWorkspace(state.workspace);
  if (mode === "anchor") {
    const anchor = selectedAnchor(workspace, key);
    if (!anchor || !anchor.linked_rois.includes(name)) return state;
    anchor.linked_rois = anchor.linked_rois.filter((item) => item !== name);
    return { ...state, workspace };
  }
  if (mode === "cli" || mode === "cli_action") {
    const cli = selectedCli(workspace, key);
    if (!cli) return state;
    const entry = runtimeLinkedObservables(cli).find((item) => item.name === name);
    if (!entry?.editable) return state;
    cli.linked_observables = editableLinkedObservables(cli).filter((item) => item !== name);
    syncActionsFromMetadata(cli);
    return { ...state, workspace };
  }
  return state;
}

function selectLinkedObservable(state: AppState, value: string, modifiers: { ctrl: boolean }): AppState {
  if (!linkedControlsEnabled(state)) return state;
  const name = cleanLinkedName(value);
  if (!name || !linkedListEntries(state).some((entry) => entry.name === name)) return state;
  const selected = state.form.linkedObs.selectedNames;
  const selectedNames = modifiers.ctrl ? (selected.includes(name) ? selected.filter((item) => item !== name) : [...selected, name]) : [name];
  return { ...state, form: { ...state.form, linkedObs: { ...state.form.linkedObs, selectedNames } } };
}

function removeSelectedLinkedObservables(state: AppState): AppState {
  if (!linkedControlsEnabled(state)) return state;
  let next = state;
  for (const name of state.form.linkedObs.selectedNames) {
    next = removeLinkedObservable(next, name);
  }
  return { ...next, form: { ...next.form, linkedObs: { ...next.form.linkedObs, selectedNames: [] } } };
}

export function formReducer(state: AppState, action: FormAction): AppState {
  switch (action.type) {
    case "FORM_SELECTION_CHANGED": {
      const summary = action.payload.selectionSummary;
      const buffers = summary.kind === "single" ? { ...summary.fields } : {};
      const history = Object.fromEntries(Object.entries(buffers).map(([field, text]) => [field, historyFor(String(text ?? ""))]));
      return syncLinkedPickerToOptions({ ...state, form: { buffers, history, cliMeta: cliMetaBuffersForSelection(state), linkedObs: { ...state.form.linkedObs, selectedNames: [] } } });
    }
    case "FORM_EDIT_FIELD": {
      if (state.tree.selected.length > 1) return state;
      const { field, text, cursor } = action.payload;
      const nextState = { ...state, form: { ...state.form, buffers: { ...state.form.buffers, [field]: text }, history: { ...state.form.history, [field]: recordHistory(state.form.history[field], text, cursor) } } };
      return commitField(nextState, field);
    }
    case "FORM_EDIT_DESCRIPTION": {
      if (state.tree.selected.length > 1) return state;
      const nextState = {
        ...state,
        form: {
          ...state.form,
          buffers: { ...state.form.buffers, description: action.payload.text },
          history: { ...state.form.history, description: recordHistory(state.form.history.description, action.payload.text, action.payload.cursor) },
        },
      };
      return commitField(nextState, "description", { recordDescriptionHistory: false });
    }
    case "FORM_UNDO_FIELD":
      return applyHistoryMove(state, action.payload.field, -1);
    case "FORM_REDO_FIELD":
      return applyHistoryMove(state, action.payload.field, 1);
    case "FORM_UNDO_DESCRIPTION":
      return applyHistoryMove(state, "description", -1);
    case "FORM_REDO_DESCRIPTION":
      return applyHistoryMove(state, "description", 1);
    case "FORM_COMMIT_FIELD":
      return commitField(state, action.payload.field);
    case "FORM_EDIT_GROUP":
      return editGroup(state, action.payload.groupName);
    case "FORM_EDIT_CLI_WRITABLE":
      return applyCliMetaChange(
        state,
        (cli) => {
          cli.writable = isRecord(cli.set_cmd) ? action.payload.value : false;
        },
        { writable: action.payload.value },
      );
    case "FORM_EDIT_CLI_SAFETY_MODE":
      return applyCliMetaChange(
        state,
        (cli) => {
          if (isRecord(cli.action_cmd)) {
            cli.safety_mode = normalizeSafetyMode(action.payload.value);
          }
        },
        { safetyMode: normalizeSafetyMode(action.payload.value) },
      );
    case "FORM_EDIT_CLI_GET_DESC":
      if (!action.payload.commit) return withCliMetaBuffer(state, { getCmdDescription: action.payload.text });
      return applyCliMetaChange(
        state,
        (cli) => {
          if (isRecord(cli.get_cmd)) cli.get_cmd.description = action.payload.text;
        },
        { getCmdDescription: action.payload.text },
      );
    case "FORM_EDIT_CLI_SET_DESC":
      if (!action.payload.commit) return withCliMetaBuffer(state, { setCmdDescription: action.payload.text });
      return applyCliMetaChange(
        state,
        (cli) => {
          if (isRecord(cli.set_cmd)) cli.set_cmd.description = action.payload.text;
        },
        { setCmdDescription: action.payload.text },
      );
    case "FORM_EDIT_CLI_SAFETY_FIELD":
      return editCliSafetyField(state, action.payload.field, action.payload.text, action.payload.commit);
    case "FORM_EDIT_CLI_RAMP_ENABLED":
      return applyCliMetaChange(
        state,
        (cli) => {
          if (isRecord(cli.safety) && cli.safety.ramp_enabled !== null && cli.safety.ramp_enabled !== undefined) {
            cli.safety.ramp_enabled = action.payload.value;
          }
        },
        { safetyRampEnabled: action.payload.value },
      );
    case "LINKED_SEARCH_CHANGED":
      return syncLinkedPickerToOptions({ ...state, form: { ...state.form, linkedObs: { ...state.form.linkedObs, searchText: action.payload.text } } });
    case "LINKED_PICKER_CHANGED":
      return { ...state, form: { ...state.form, linkedObs: { ...state.form.linkedObs, pickerValue: action.payload.value } } };
    case "LINKED_SELECT":
      return selectLinkedObservable(state, action.payload.value, action.payload.modifiers);
    case "LINKED_ADD":
      return addLinkedObservable(state);
    case "LINKED_REMOVE_SELECTED":
      return removeSelectedLinkedObservables(state);
    case "LINKED_REMOVE":
      return removeLinkedObservable(state, action.payload.value);
    default:
      return state;
  }
}
