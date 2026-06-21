import type { AppState } from "../state.js";

export function renderConfirmDialog(rootEl: HTMLElement, state: AppState): void {
  rootEl.replaceChildren();
  if (!state.confirmDialog.open) {
    return;
  }

  const backdrop = document.createElement("div");
  backdrop.className = "confirm-backdrop";
  backdrop.dataset.region = "confirm-backdrop";

  const dialog = document.createElement("article");
  dialog.className = "confirm-dialog";
  dialog.dataset.confirmDialog = "true";
  dialog.setAttribute("role", "alertdialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "confirm-dialog-title");
  dialog.setAttribute("aria-describedby", "confirm-dialog-message");

  const title = document.createElement("h2");
  title.id = "confirm-dialog-title";
  title.textContent = "Confirm";

  const message = document.createElement("p");
  message.id = "confirm-dialog-message";
  message.className = "confirm-dialog-message";
  message.textContent = state.confirmDialog.message;

  const actions = document.createElement("div");
  actions.className = "confirm-dialog-actions";

  const ok = document.createElement("button");
  ok.type = "button";
  ok.dataset.action = "confirm-accept";
  ok.textContent = "OK";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.dataset.action = "confirm-cancel";
  cancel.textContent = "Cancel";

  actions.append(ok, cancel);
  dialog.append(title, message, actions);
  backdrop.append(dialog);
  rootEl.append(backdrop);
  ok.focus();
}
