import {
  treeClickItem,
  treeCtrlToggleRow,
  treeDoubleClickItem,
  treeKeyboardNav,
  treeShiftRange,
  type Action,
} from "../actions.js";
import type { TreeItemKind } from "../state.js";

function closestWithin<T extends Element>(target: EventTarget | null, selector: string, root: HTMLElement): T | null {
  if (!(target instanceof Element)) {
    return null;
  }
  const found = target.closest<T>(selector);
  return found && root.contains(found) ? found : null;
}

function rowFromEvent(target: EventTarget | null, root: HTMLElement): { kind: TreeItemKind; name: string; region: "toggle" | "body" } | null {
  const regionEl = closestWithin<HTMLElement>(target, "[data-region]", root);
  const rowEl = closestWithin<HTMLElement>(target, ".tree-row[data-kind][data-name]", root);
  const region = regionEl?.dataset.region;
  const kind = rowEl?.dataset.kind;
  const name = rowEl?.dataset.name;
  if ((region !== "toggle" && region !== "body") || (kind !== "roi" && kind !== "anchor" && kind !== "group" && kind !== "cli") || !name) {
    return null;
  }
  return { kind, name, region };
}

export function attachItemsTreeEvents(rootEl: HTMLElement, dispatch: (action: Action) => void): () => void {
  rootEl.tabIndex = rootEl.tabIndex < 0 ? 0 : rootEl.tabIndex;

  const onClick = (event: MouseEvent): void => {
    const row = rowFromEvent(event.target, rootEl);
    if (!row) {
      return;
    }
    if (row.region === "toggle") {
      dispatch(treeClickItem({ kind: row.kind, name: row.name, region: "toggle", modifiers: { ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey } }));
      return;
    }
    if (event.shiftKey) {
      dispatch(treeShiftRange(row.kind, row.name));
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      dispatch(treeCtrlToggleRow(row.kind, row.name));
      return;
    }
    dispatch(treeClickItem({ kind: row.kind, name: row.name, region: "body", modifiers: { ctrl: false, shift: false } }));
  };

  const onDoubleClick = (event: MouseEvent): void => {
    const row = rowFromEvent(event.target, rootEl);
    if (!row || row.region !== "body" || row.kind !== "group") {
      return;
    }
    dispatch(treeDoubleClickItem(row.kind, row.name));
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return;
    }
    event.preventDefault();
    dispatch(treeKeyboardNav(event.key, { shift: event.shiftKey }));
  };

  rootEl.addEventListener("click", onClick);
  rootEl.addEventListener("dblclick", onDoubleClick);
  rootEl.addEventListener("keydown", onKeyDown);

  return () => {
    rootEl.removeEventListener("click", onClick);
    rootEl.removeEventListener("dblclick", onDoubleClick);
    rootEl.removeEventListener("keydown", onKeyDown);
  };
}
