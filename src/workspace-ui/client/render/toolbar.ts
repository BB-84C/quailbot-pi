import type { AppState } from "../state.js";

function hasSingleSelection(state: AppState, kind: "roi" | "anchor"): boolean {
  if (state.tree.selected.length !== 1) return false;
  const selected = state.tree.selected[0];
  if (!selected || selected.kind !== kind) return false;
  const source = kind === "roi" ? state.workspace.rois : state.workspace.anchors;
  return source.some((item) => item.name === selected.name);
}

function button(action: string, label: string, disabled = false): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.dataset.action = action;
  el.textContent = label;
  el.disabled = disabled;
  return el;
}

export function renderToolbar(rootEl: HTMLElement, state: AppState): void {
  rootEl.className = "workspace-toolbar";
  rootEl.replaceChildren(
    button("tree-add-roi", "Add ROI"),
    button("tree-add-anchor", "Add Anchor"),
    button("tree-add-group", "Add Group"),
    button("capture-refresh", "Refresh screenshot"),
    button("canvas-draw-roi", "Draw ROI box", !hasSingleSelection(state, "roi")),
    button("canvas-pick-anchor", "Pick anchor point", !hasSingleSelection(state, "anchor")),
    button("tree-delete", "Delete", state.tree.selected.length === 0),
  );
}
