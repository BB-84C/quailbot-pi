import type { TreeItemKind, TreeItemKey } from "./state.js";

export type TreeClickModifiers = {
  ctrl: boolean;
  shift: boolean;
};

export type Action =
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
