import {
  treeClickItem,
  treeCtrlToggleRow,
  treeDoubleClickItem,
  treeKeyboardNav,
  treeShiftRange,
  type Action,
} from "../actions.js";
import type { TreeItemKind } from "../state.js";
import { attachScopedActivation, attachScopedEvent, closestWithin } from "./delegation.js";

function rowFromEvent(target: EventTarget | null, root: HTMLElement): { kind: TreeItemKind; name: string; region: "toggle" | "body" } | null {
  const regionEl = closestWithin<HTMLElement>(target, "[data-region]", root);
  const rowEl = closestWithin<HTMLElement>(target, ".tree-row[data-kind][data-name]", root);
  const region = regionEl?.dataset.region ?? (rowEl ? "body" : undefined);
  const kind = rowEl?.dataset.kind;
  const name = rowEl?.dataset.name;
  if ((region !== "toggle" && region !== "body") || (kind !== "roi" && kind !== "anchor" && kind !== "group" && kind !== "cli") || !name) {
    return null;
  }
  return { kind, name, region };
}

export function attachItemsTreeEvents(rootEl: HTMLElement, dispatch: (action: Action) => void): () => void {
  rootEl.tabIndex = rootEl.tabIndex < 0 ? 0 : rootEl.tabIndex;
  let lastBodyActivation: { kind: TreeItemKind; name: string; time: number } | null = null;
  let lastGroupCollapse: { name: string; time: number } | null = null;

  const collapseGroup = (name: string): void => {
    lastGroupCollapse = { name, time: Date.now() };
    dispatch(treeDoubleClickItem("group", name));
  };

  const onClick = (event: MouseEvent): boolean => {
    const row = rowFromEvent(event.target, rootEl);
    if (!row) {
      lastBodyActivation = null;
      return false;
    }
    const now = Date.now();
    if (row.region === "body" && row.kind === "group") {
      if (lastBodyActivation?.kind === row.kind && lastBodyActivation.name === row.name && now - lastBodyActivation.time <= 650) {
        lastBodyActivation = null;
        collapseGroup(row.name);
        return true;
      }
      lastBodyActivation = { kind: row.kind, name: row.name, time: now };
    } else {
      lastBodyActivation = null;
    }
    if (row.region === "toggle") {
      dispatch(treeClickItem({ kind: row.kind, name: row.name, region: "toggle", modifiers: { ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey } }));
      return true;
    }
    if (event.shiftKey) {
      dispatch(treeShiftRange(row.kind, row.name));
      return true;
    }
    if (event.ctrlKey || event.metaKey) {
      dispatch(treeCtrlToggleRow(row.kind, row.name));
      return true;
    }
    dispatch(treeClickItem({ kind: row.kind, name: row.name, region: "body", modifiers: { ctrl: false, shift: false } }));
    return true;
  };

  const onDoubleClick = (event: MouseEvent): void => {
    const row = rowFromEvent(event.target, rootEl);
    if (!row || row.region !== "body" || row.kind !== "group") {
      return;
    }
    if (lastGroupCollapse?.name === row.name && Date.now() - lastGroupCollapse.time <= 650) {
      return;
    }
    collapseGroup(row.name);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return;
    }
    event.preventDefault();
    dispatch(treeKeyboardNav(event.key, { shift: event.shiftKey }));
  };

  const offClick = attachScopedActivation(rootEl, onClick);
  const offDoubleClick = attachScopedEvent<MouseEvent>(rootEl, "dblclick", onDoubleClick);
  const offKeyDown = attachScopedEvent<KeyboardEvent>(rootEl, "keydown", onKeyDown);

  return () => {
    offClick();
    offDoubleClick();
    offKeyDown();
  };
}
