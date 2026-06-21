import { canvasBeginDrawRoi, canvasBeginPickAnchor, canvasFrameLoaded, startupFinished, treeAddItem, treeDeleteSelected, workspaceCliEnabledChanged, type Action } from "../actions.js";
import { postCapture } from "../api/workspace.js";
import type { AppState } from "../state.js";
import { attachScopedActivation, attachScopedEvent } from "./delegation.js";

function closestButton(target: EventTarget | null, root: HTMLElement): HTMLButtonElement | null {
  if (!(target instanceof Element)) return null;
  const button = target.closest<HTMLButtonElement>("button[data-action]");
  return button && root.contains(button) ? button : null;
}

async function refreshCapture(dispatch: (action: Action) => void): Promise<void> {
  const response = await postCapture();
  if (response.ok) {
    dispatch(canvasFrameLoaded(response.frame));
    dispatch(startupFinished(null));
  } else {
    dispatch(startupFinished(response.error || "Screen capture unavailable."));
  }
}

export function attachToolbarEvents(args: { root: HTMLElement; dispatch: (action: Action) => void; getState: () => AppState }): () => void {
  const { root, dispatch, getState } = args;
  const onClick = (event: MouseEvent): void => {
    const clicked = closestButton(event.target, root);
    if (!clicked || clicked.disabled) return;
    event.preventDefault();
    switch (clicked.dataset.action) {
      case "tree-add-roi":
        dispatch(treeAddItem("roi"));
        return;
      case "tree-add-anchor":
        dispatch(treeAddItem("anchor"));
        return;
      case "tree-add-group":
        dispatch(treeAddItem("group"));
        return;
      case "capture-refresh":
        void refreshCapture(dispatch);
        return;
      case "canvas-draw-roi":
        dispatch(canvasBeginDrawRoi());
        return;
      case "canvas-pick-anchor":
        dispatch(canvasBeginPickAnchor());
        return;
      case "tree-delete": {
        const count = getState().tree.selected.length;
        if (count === 0) return;
        const prompt = count === 1 ? "Delete selected item?" : `Delete ${count} selected items?`;
        if (window.confirm(prompt)) {
          dispatch(treeDeleteSelected());
        }
      }
    }
  };
  const onChange = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.dataset.action !== "cli-tools-enabled") return;
    dispatch(workspaceCliEnabledChanged(target.checked));
  };
  const offClick = attachScopedActivation(root, onClick);
  const offChange = attachScopedEvent<Event>(root, "change", onChange);
  return () => {
    offClick();
    offChange();
  };
}
