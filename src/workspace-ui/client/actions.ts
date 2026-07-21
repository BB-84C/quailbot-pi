import type { StartupWorkspacePayload, TreeItemKind, TreeItemKey } from "./state.js";
import type { CliSafetyField, FormFieldKey } from "./state.js";
import type { CaptureFrame } from "../shared/geometry.js";
import type { SelectionSummary } from "./selectors/form.js";
import type { CliParamDraft } from "../shared/model.js";
import type { CliImportConflict, MergeResult } from "../shared/cli-import.js";

export interface BrowseEntry { name: string; kind: "dir" | "file"; path: string }

export type TreeClickModifiers = {
  ctrl: boolean;
  shift: boolean;
};

export type TreeAction =
  | {
      type: "TREE_ADD_ITEM";
      payload: { kind: "roi" | "anchor" | "group" };
    }
  | { type: "TREE_DELETE_SELECTED" }
  | { type: "STARTUP_WORKSPACE_LOADED"; payload: StartupWorkspacePayload }
  | { type: "STARTUP_FINISHED"; payload: { error: string | null } }
  | {
      type: "TREE_CLICK_ITEM";
      payload: TreeItemKey & {
        modifiers: TreeClickModifiers;
        region: "toggle" | "body";
      };
    }
  | {
      type: "TREE_DOUBLE_CLICK_ITEM";
      payload: TreeItemKey;
    }
  | {
      type: "TREE_KEYBOARD_NAV";
      payload: {
        key: "ArrowUp" | "ArrowDown";
        modifiers: { shift: boolean };
      };
    }
  | {
      type: "TREE_CTRL_TOGGLE_ROW";
      payload: TreeItemKey;
    }
  | {
      type: "TREE_SHIFT_RANGE";
      payload: TreeItemKey;
    };

export type CanvasAction =
  | { type: "CANVAS_FRAME_LOADED"; payload: { frame: CaptureFrame } }
  | { type: "CANVAS_VIEWPORT_CHANGED"; payload: { width: number; height: number } }
  | { type: "CANVAS_BEGIN_DRAW_ROI" }
  | { type: "CANVAS_BEGIN_PICK_ANCHOR" }
  | { type: "CANVAS_POINTER_DOWN"; payload: { canvasX: number; canvasY: number } }
  | { type: "CANVAS_POINTER_MOVE"; payload: { canvasX: number; canvasY: number } }
  | { type: "CANVAS_POINTER_UP"; payload: { canvasX: number; canvasY: number } }
  | { type: "CANVAS_ZOOM_AT_POINTER"; payload: { direction: 1 | -1; pointerCanvasX: number; pointerCanvasY: number } }
  | { type: "CANVAS_PAN_WHEEL"; payload: { deltaX: number; deltaY: number } };

export type FormAction =
  | { type: "FORM_SELECTION_CHANGED"; payload: { selectionSummary: SelectionSummary } }
  | { type: "FORM_EDIT_FIELD"; payload: { field: FormFieldKey; text: string; cursor: number } }
  | { type: "FORM_UNDO_FIELD"; payload: { field: FormFieldKey } }
  | { type: "FORM_REDO_FIELD"; payload: { field: FormFieldKey } }
  | { type: "FORM_COMMIT_FIELD"; payload: { field: FormFieldKey } }
  | { type: "FORM_EDIT_GROUP"; payload: { groupName: string } }
  | { type: "FORM_EDIT_DESCRIPTION"; payload: { text: string; cursor: number } }
  | { type: "FORM_UNDO_DESCRIPTION" }
  | { type: "FORM_REDO_DESCRIPTION" }
  | { type: "FORM_EDIT_CLI_WRITABLE"; payload: { value: boolean } }
  | { type: "FORM_EDIT_CLI_SAFETY_MODE"; payload: { value: "alwaysAllowed" | "guarded" | "blocked" } }
  | { type: "FORM_EDIT_CLI_GET_DESC"; payload: { text: string; commit?: boolean } }
  | { type: "FORM_EDIT_CLI_SET_DESC"; payload: { text: string; commit?: boolean } }
  | { type: "FORM_EDIT_CLI_SAFETY_FIELD"; payload: { field: CliSafetyField; text: string; commit?: boolean } }
  | { type: "FORM_EDIT_CLI_RAMP_ENABLED"; payload: { value: boolean } }
  | { type: "FORM_EDIT_CLI_ACTION"; payload: { action: "get" | "set" | "ramp"; value: boolean } }
  | { type: "LINKED_SEARCH_CHANGED"; payload: { text: string } }
  | { type: "LINKED_PICKER_CHANGED"; payload: { value: string } }
  | { type: "LINKED_SELECT"; payload: { value: string; modifiers: { ctrl: boolean } } }
  | { type: "LINKED_ADD" }
  | { type: "LINKED_REMOVE_SELECTED" }
  | { type: "LINKED_REMOVE"; payload: { value: string } };

export type FilterAction =
  | { type: "FILTER_TOGGLE_TAG"; payload: { tag: string; selected?: boolean } }
  | { type: "FILTER_KEYWORD_CHANGED"; payload: { text: string } }
  | { type: "FILTER_TOGGLE_LOGIC" }
  | { type: "FILTER_CLEAR" };

export type CliImportAction =
  | { type: "CLI_IMPORT_NAME_CHANGED"; payload: { text: string } }
  | { type: "CLI_IMPORT_PROBE_STARTED" }
  | { type: "CLI_IMPORT_PROBE_SUCCEEDED"; payload: { cliName: string; usedSubcommand: "capabilities" | "capacities" | ""; mergeResult: MergeResult; loadedDrafts: CliParamDraft[] } }
  | { type: "CLI_IMPORT_PROBE_FAILED"; payload: { error: string } }
  | { type: "CLI_IMPORT_RESOLVE_KEEP_EXISTING" }
  | { type: "CLI_IMPORT_RESOLVE_USE_LOADED" }
  | { type: "CLI_IMPORT_RESOLVE_CANCEL" }
  | { type: "CLI_IMPORT_MODAL_OPENED"; payload: { conflicts: CliImportConflict[]; merged: CliParamDraft[] } };

export type FileBrowserAction =
  | { type: "FILE_BROWSER_OPEN"; payload: { mode: "load" | "export" } }
  | { type: "FILE_BROWSER_NAV"; payload: { path: string } }
  | { type: "FILE_BROWSER_BROWSE_RESULT"; payload: { entries: BrowseEntry[]; currentPath: string } }
  | { type: "FILE_BROWSER_SELECT"; payload: { name: string; path: string } }
  | { type: "FILE_BROWSER_FILENAME_CHANGED"; payload: { filename: string } }
  | { type: "FILE_BROWSER_LOAD_STARTED" }
  | { type: "FILE_BROWSER_LOAD_SUCCEEDED"; payload: { path: string; workspaceJson: Record<string, unknown> } }
  | { type: "FILE_BROWSER_SAVE_STARTED" }
  | { type: "FILE_BROWSER_SAVE_SUCCEEDED"; payload: { path: string; updateCurrent: boolean } }
  | { type: "FILE_BROWSER_FAILED"; payload: { error: string; restorePath?: string } }
  | { type: "FILE_BROWSER_CANCEL" };

export type WorkspaceAction = { type: "WORKSPACE_CLI_ENABLED_CHANGED"; payload: { value: boolean } };

export type ConfirmAction =
  | { type: "CONFIRM_OPEN"; payload: { message: string; action: "delete-selected" } }
  | { type: "CONFIRM_CLOSE" };

export type NoticeAction =
  | { type: "NOTICE_OPEN"; payload: { message: string } }
  | { type: "NOTICE_CLOSE" };

export type Action = TreeAction | CanvasAction | FormAction | FilterAction | CliImportAction | FileBrowserAction | WorkspaceAction | ConfirmAction | NoticeAction;

export function treeAddItem(kind: "roi" | "anchor" | "group"): Action {
  return { type: "TREE_ADD_ITEM", payload: { kind } };
}

export function treeDeleteSelected(): Action {
  return { type: "TREE_DELETE_SELECTED" };
}

export function startupWorkspaceLoaded(payload: StartupWorkspacePayload): Action {
  return { type: "STARTUP_WORKSPACE_LOADED", payload };
}

export function startupFinished(error: string | null): Action {
  return { type: "STARTUP_FINISHED", payload: { error } };
}

export function treeClickItem(payload: TreeItemKey & { modifiers: TreeClickModifiers; region: "toggle" | "body" }): Action {
  return { type: "TREE_CLICK_ITEM", payload };
}

export function treeDoubleClickItem(kind: TreeItemKind, name: string): Action {
  return { type: "TREE_DOUBLE_CLICK_ITEM", payload: { kind, name } };
}

export function treeKeyboardNav(key: "ArrowUp" | "ArrowDown", modifiers: { shift: boolean }): Action {
  return { type: "TREE_KEYBOARD_NAV", payload: { key, modifiers } };
}

export function treeCtrlToggleRow(kind: TreeItemKind, name: string): Action {
  return { type: "TREE_CTRL_TOGGLE_ROW", payload: { kind, name } };
}

export function treeShiftRange(kind: TreeItemKind, name: string): Action {
  return { type: "TREE_SHIFT_RANGE", payload: { kind, name } };
}

export function canvasFrameLoaded(frame: CaptureFrame): Action {
  return { type: "CANVAS_FRAME_LOADED", payload: { frame } };
}

export function canvasViewportChanged(width: number, height: number): Action {
  return { type: "CANVAS_VIEWPORT_CHANGED", payload: { width, height } };
}

export function canvasBeginDrawRoi(): Action {
  return { type: "CANVAS_BEGIN_DRAW_ROI" };
}

export function canvasBeginPickAnchor(): Action {
  return { type: "CANVAS_BEGIN_PICK_ANCHOR" };
}

export function canvasPointerDown(canvasX: number, canvasY: number): Action {
  return { type: "CANVAS_POINTER_DOWN", payload: { canvasX, canvasY } };
}

export function canvasPointerMove(canvasX: number, canvasY: number): Action {
  return { type: "CANVAS_POINTER_MOVE", payload: { canvasX, canvasY } };
}

export function canvasPointerUp(canvasX: number, canvasY: number): Action {
  return { type: "CANVAS_POINTER_UP", payload: { canvasX, canvasY } };
}

export function canvasZoomAtPointer(direction: 1 | -1, pointerCanvasX: number, pointerCanvasY: number): Action {
  return { type: "CANVAS_ZOOM_AT_POINTER", payload: { direction, pointerCanvasX, pointerCanvasY } };
}

export function canvasPanWheel(deltaX: number, deltaY: number): Action {
  return { type: "CANVAS_PAN_WHEEL", payload: { deltaX, deltaY } };
}

export function formSelectionChanged(selectionSummary: SelectionSummary): Action {
  return { type: "FORM_SELECTION_CHANGED", payload: { selectionSummary } };
}

export function formEditField(field: FormFieldKey, text: string, cursor: number): Action {
  return { type: "FORM_EDIT_FIELD", payload: { field, text, cursor } };
}

export function formUndoField(field: FormFieldKey): Action {
  return { type: "FORM_UNDO_FIELD", payload: { field } };
}

export function formRedoField(field: FormFieldKey): Action {
  return { type: "FORM_REDO_FIELD", payload: { field } };
}

export function formCommitField(field: FormFieldKey): Action {
  return { type: "FORM_COMMIT_FIELD", payload: { field } };
}

export function formEditGroup(groupName: string): Action {
  return { type: "FORM_EDIT_GROUP", payload: { groupName } };
}

export function formEditDescription(text: string, cursor: number): Action {
  return { type: "FORM_EDIT_DESCRIPTION", payload: { text, cursor } };
}

export function formUndoDescription(): Action {
  return { type: "FORM_UNDO_DESCRIPTION" };
}

export function formRedoDescription(): Action {
  return { type: "FORM_REDO_DESCRIPTION" };
}

export function formEditCliWritable(value: boolean): Action {
  return { type: "FORM_EDIT_CLI_WRITABLE", payload: { value } };
}

export function formEditCliSafetyMode(value: "alwaysAllowed" | "guarded" | "blocked"): Action {
  return { type: "FORM_EDIT_CLI_SAFETY_MODE", payload: { value } };
}

export function formEditCliGetDesc(text: string, commit = false): Action {
  return { type: "FORM_EDIT_CLI_GET_DESC", payload: { text, commit } };
}

export function formEditCliSetDesc(text: string, commit = false): Action {
  return { type: "FORM_EDIT_CLI_SET_DESC", payload: { text, commit } };
}

export function formEditCliSafetyField(field: CliSafetyField, text: string, commit = false): Action {
  return { type: "FORM_EDIT_CLI_SAFETY_FIELD", payload: { field, text, commit } };
}

export function formEditCliRampEnabled(value: boolean): Action {
  return { type: "FORM_EDIT_CLI_RAMP_ENABLED", payload: { value } };
}

export function formEditCliAction(action: "get" | "set" | "ramp", value: boolean): Action {
  return { type: "FORM_EDIT_CLI_ACTION", payload: { action, value } };
}

export function linkedSearchChanged(text: string): Action {
  return { type: "LINKED_SEARCH_CHANGED", payload: { text } };
}

export function linkedPickerChanged(value: string): Action {
  return { type: "LINKED_PICKER_CHANGED", payload: { value } };
}

export function linkedAdd(): Action {
  return { type: "LINKED_ADD" };
}

export function linkedSelect(value: string, modifiers: { ctrl: boolean } = { ctrl: false }): Action {
  return { type: "LINKED_SELECT", payload: { value, modifiers } };
}

export function linkedRemoveSelected(): Action {
  return { type: "LINKED_REMOVE_SELECTED" };
}

export function linkedRemove(value: string): Action {
  return { type: "LINKED_REMOVE", payload: { value } };
}

export function filterToggleTag(tag: string, selected?: boolean): Action {
  return { type: "FILTER_TOGGLE_TAG", payload: { tag, selected } };
}

export function filterKeywordChanged(text: string): Action {
  return { type: "FILTER_KEYWORD_CHANGED", payload: { text } };
}

export function filterToggleLogic(): Action {
  return { type: "FILTER_TOGGLE_LOGIC" };
}

export function filterClear(): Action {
  return { type: "FILTER_CLEAR" };
}

export function cliImportNameChanged(text: string): Action {
  return { type: "CLI_IMPORT_NAME_CHANGED", payload: { text } };
}

export function workspaceCliEnabledChanged(value: boolean): Action {
  return { type: "WORKSPACE_CLI_ENABLED_CHANGED", payload: { value } };
}

export function confirmOpen(message: string, action: "delete-selected"): Action {
  return { type: "CONFIRM_OPEN", payload: { message, action } };
}

export function confirmClose(): Action {
  return { type: "CONFIRM_CLOSE" };
}

export function noticeOpen(message: string): Action {
  return { type: "NOTICE_OPEN", payload: { message } };
}

export function noticeClose(): Action {
  return { type: "NOTICE_CLOSE" };
}

export function cliImportProbeStarted(): Action {
  return { type: "CLI_IMPORT_PROBE_STARTED" };
}

export function cliImportProbeSucceeded(payload: { cliName: string; usedSubcommand: "capabilities" | "capacities" | ""; mergeResult: MergeResult; loadedDrafts: CliParamDraft[] }): Action {
  return { type: "CLI_IMPORT_PROBE_SUCCEEDED", payload };
}

export function cliImportProbeFailed(error: string): Action {
  return { type: "CLI_IMPORT_PROBE_FAILED", payload: { error } };
}

export function cliImportResolveKeepExisting(): Action {
  return { type: "CLI_IMPORT_RESOLVE_KEEP_EXISTING" };
}

export function cliImportResolveUseLoaded(): Action {
  return { type: "CLI_IMPORT_RESOLVE_USE_LOADED" };
}

export function cliImportResolveCancel(): Action {
  return { type: "CLI_IMPORT_RESOLVE_CANCEL" };
}

export function fileBrowserOpen(mode: "load" | "export"): Action {
  return { type: "FILE_BROWSER_OPEN", payload: { mode } };
}

export function fileBrowserNav(path: string): Action {
  return { type: "FILE_BROWSER_NAV", payload: { path } };
}

export function fileBrowserBrowseResult(entries: BrowseEntry[], currentPath: string): Action {
  return { type: "FILE_BROWSER_BROWSE_RESULT", payload: { entries, currentPath } };
}

export function fileBrowserSelect(name: string, path: string): Action {
  return { type: "FILE_BROWSER_SELECT", payload: { name, path } };
}

export function fileBrowserFilenameChanged(filename: string): Action {
  return { type: "FILE_BROWSER_FILENAME_CHANGED", payload: { filename } };
}

export function fileBrowserLoadStarted(): Action {
  return { type: "FILE_BROWSER_LOAD_STARTED" };
}

export function fileBrowserLoadSucceeded(path: string, workspaceJson: Record<string, unknown>): Action {
  return { type: "FILE_BROWSER_LOAD_SUCCEEDED", payload: { path, workspaceJson } };
}

export function fileBrowserSaveStarted(): Action {
  return { type: "FILE_BROWSER_SAVE_STARTED" };
}

export function fileBrowserSaveSucceeded(path: string, updateCurrent: boolean): Action {
  return { type: "FILE_BROWSER_SAVE_SUCCEEDED", payload: { path, updateCurrent } };
}

export function fileBrowserFailed(error: string, restorePath?: string): Action {
  return { type: "FILE_BROWSER_FAILED", payload: { error, restorePath } };
}

export function fileBrowserCancel(): Action {
  return { type: "FILE_BROWSER_CANCEL" };
}
