import type { TreeItemKind, TreeItemKey } from "./state.js";
import type { FormFieldKey } from "./state.js";
import type { CaptureFrame } from "../shared/geometry.js";
import type { SelectionSummary } from "./selectors/form.js";

export type TreeClickModifiers = {
  ctrl: boolean;
  shift: boolean;
};

export type TreeAction =
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
  | { type: "FORM_REDO_DESCRIPTION" };

export type Action = TreeAction | CanvasAction | FormAction;

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
