import { renameGroupCascade, wouldCreateGroupCycle } from "../../shared/groups.js";
import type { AnchorDraft, CliParamDraft, GroupDraft, RoiDraft } from "../../shared/model.js";
import type { FormAction } from "../actions.js";
import type { AppState, FieldHistory, FormFieldKey, TreeItemKey } from "../state.js";

type WorkspaceClone = AppState["workspace"];

function cloneWorkspace(workspace: AppState["workspace"]): WorkspaceClone {
  return {
    ...workspace,
    rois: workspace.rois.map((roi) => ({ ...roi })),
    anchors: workspace.anchors.map((anchor) => ({ ...anchor, linked_rois: [...anchor.linked_rois] })),
    groups: workspace.groups.map((group) => ({ ...group })),
    cliParams: workspace.cliParams.map((param) => ({ ...param, linked_observables: [...param.linked_observables] })),
  };
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
  return {
    ...state,
    form: {
      ...state.form,
      buffers: { ...state.form.buffers, [field]: entry.text },
      history: { ...state.form.history, [field]: { ...history, index } },
    },
  };
}

function commitField(state: AppState, field: FormFieldKey): AppState {
  if (state.tree.selected.length !== 1) return state;
  const key = state.tree.selected[0]!;
  if (key.kind === "cli") return state;
  const workspace = cloneWorkspace(state.workspace);
  const draft = selectedDraft(workspace, key);
  if (!draft) return state;
  const text = state.form.buffers[field] ?? "";

  if (field === "description") {
    draft.description = text;
    return commitDescriptionHistory({ ...state, workspace }, text);
  }
  if (field === "tags") {
    draft.tags = text;
    return { ...state, workspace };
  }
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

export function formReducer(state: AppState, action: FormAction): AppState {
  switch (action.type) {
    case "FORM_SELECTION_CHANGED": {
      const summary = action.payload.selectionSummary;
      const buffers = summary.kind === "single" ? { ...summary.fields } : {};
      const history = Object.fromEntries(Object.entries(buffers).map(([field, text]) => [field, historyFor(String(text ?? ""))]));
      return { ...state, form: { buffers, history } };
    }
    case "FORM_EDIT_FIELD": {
      if (state.tree.selected.length > 1) return state;
      const { field, text, cursor } = action.payload;
      return { ...state, form: { ...state.form, buffers: { ...state.form.buffers, [field]: text }, history: { ...state.form.history, [field]: recordHistory(state.form.history[field], text, cursor) } } };
    }
    case "FORM_EDIT_DESCRIPTION": {
      if (state.tree.selected.length > 1) return state;
      return { ...state, form: { ...state.form, buffers: { ...state.form.buffers, description: action.payload.text } } };
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
    default:
      return state;
  }
}
