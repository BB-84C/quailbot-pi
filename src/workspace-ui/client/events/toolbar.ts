import { canvasBeginDrawRoi, canvasBeginPickAnchor, canvasFrameLoaded, confirmOpen, noticeOpen, startupFinished, treeAddItem, workspaceCliEnabledChanged, type Action } from "../actions.js";
import { postCapture } from "../api/workspace.js";
import type { AppState } from "../state.js";
import { attachScopedActivation, attachScopedEvent } from "./delegation.js";

function closestButton(target: EventTarget | null, root: HTMLElement): HTMLButtonElement | null {
  if (!(target instanceof Element)) return null;
  const button = target.closest<HTMLButtonElement>("button[data-action]");
  return button && root.contains(button) ? button : null;
}

function hasSingleSelection(state: AppState, kind: "roi" | "anchor"): boolean {
  if (state.tree.selected.length !== 1) return false;
  const selected = state.tree.selected[0];
  if (!selected || selected.kind !== kind) return false;
  const source = kind === "roi" ? state.workspace.rois : state.workspace.anchors;
  return source.some((item) => item.name === selected.name);
}

const MISSING_CAPTURE_MESSAGE = "No screenshot is loaded. Click Refresh screenshot before drawing or picking on the canvas.";

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
  const onClick = (event: MouseEvent): boolean => {
    const cliEnabled =
      event.target instanceof Element
        ? (event.target.closest<HTMLInputElement>('input[data-action="cli-tools-enabled"]') ??
            event.target.closest<HTMLLabelElement>("label.toolbar-check")?.querySelector<HTMLInputElement>('input[data-action="cli-tools-enabled"]'))
        : null;
    if (cliEnabled && root.contains(cliEnabled)) {
      event.preventDefault();
      dispatch(workspaceCliEnabledChanged(!cliEnabled.checked));
      return true;
    }

    const clicked = closestButton(event.target, root);
    if (!clicked || clicked.disabled) return false;
    event.preventDefault();
    switch (clicked.dataset.action) {
      case "tree-add-roi":
        dispatch(treeAddItem("roi"));
        return true;
      case "tree-add-anchor":
        dispatch(treeAddItem("anchor"));
        return true;
      case "tree-add-group":
        dispatch(treeAddItem("group"));
        return true;
      case "capture-refresh":
        void refreshCapture(dispatch);
        return true;
      case "canvas-draw-roi":
        if (!hasSingleSelection(getState(), "roi")) {
          dispatch(noticeOpen("Select an ROI item first (or Add ROI)."));
          return true;
        }
        if (!getState().canvas.frame) {
          dispatch(startupFinished(MISSING_CAPTURE_MESSAGE));
          return true;
        }
        dispatch(canvasBeginDrawRoi());
        return true;
      case "canvas-pick-anchor":
        if (!hasSingleSelection(getState(), "anchor")) {
          dispatch(noticeOpen("Select an Anchor item first (or Add Anchor)."));
          return true;
        }
        if (!getState().canvas.frame) {
          dispatch(startupFinished(MISSING_CAPTURE_MESSAGE));
          return true;
        }
        dispatch(canvasBeginPickAnchor());
        return true;
      case "tree-delete": {
        const count = getState().tree.selected.length;
        if (count === 0) return true;
        const prompt = count === 1 ? "Delete selected item?" : `Delete ${count} selected items?`;
        dispatch(confirmOpen(prompt, "delete-selected"));
        return true;
      }
    }
    return false;
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
