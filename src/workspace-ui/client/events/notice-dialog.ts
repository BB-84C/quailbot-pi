import { noticeClose, type Action } from "../actions.js";
import type { AppState } from "../state.js";
import { attachScopedActivation, attachScopedEvent, closestWithin } from "./delegation.js";

export function attachNoticeDialogEvents(args: { root: HTMLElement; dispatch: (action: Action) => void; getState: () => AppState }): () => void {
  const { root, dispatch, getState } = args;

  const close = (): void => {
    dispatch(noticeClose());
  };

  const onClick = (event: MouseEvent): boolean => {
    const closeButton = closestWithin<HTMLButtonElement>(event.target, 'button[data-action="notice-close"]', root);
    const backdrop = closestWithin<HTMLElement>(event.target, '[data-region="notice-backdrop"]', root);
    if (closeButton || event.target === backdrop) {
      event.preventDefault();
      close();
      return true;
    }
    return false;
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!getState().noticeDialog.open) {
      return;
    }
    if (event.key === "Escape" || event.key === "Enter") {
      event.preventDefault();
      close();
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
