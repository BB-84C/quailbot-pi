import { confirmClose, treeDeleteSelected, type Action } from "../actions.js";
import type { AppState } from "../state.js";
import { attachScopedActivation, attachScopedEvent, closestWithin } from "./delegation.js";

export function attachConfirmDialogEvents(args: { root: HTMLElement; dispatch: (action: Action) => void; getState: () => AppState }): () => void {
  const { root, dispatch, getState } = args;

  const close = (): void => {
    dispatch(confirmClose());
  };

  const accept = (): void => {
    const state = getState();
    if (state.confirmDialog.action === "delete-selected") {
      dispatch(treeDeleteSelected());
    }
    dispatch(confirmClose());
  };

  const onClick = (event: MouseEvent): boolean => {
    const acceptButton = closestWithin<HTMLButtonElement>(event.target, 'button[data-action="confirm-accept"]', root);
    if (acceptButton) {
      event.preventDefault();
      accept();
      return true;
    }

    const cancelButton = closestWithin<HTMLButtonElement>(event.target, 'button[data-action="confirm-cancel"]', root);
    const backdrop = closestWithin<HTMLElement>(event.target, '[data-region="confirm-backdrop"]', root);
    if (cancelButton || event.target === backdrop) {
      event.preventDefault();
      close();
      return true;
    }

    return false;
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!getState().confirmDialog.open) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      accept();
    }
  };

  const offClick = attachScopedActivation(root, onClick);
  const offRootKeyDown = attachScopedEvent<KeyboardEvent>(root, "keydown", onKeyDown);
  document.addEventListener("keydown", onKeyDown, true);
  return () => {
    offClick();
    offRootKeyDown();
    document.removeEventListener("keydown", onKeyDown, true);
  };
}
