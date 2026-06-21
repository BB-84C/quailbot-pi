import type { AppState } from "../state.js";

export function renderNoticeDialog(rootEl: HTMLElement, state: AppState): void {
  rootEl.replaceChildren();
  if (!state.noticeDialog.open) {
    return;
  }

  const backdrop = document.createElement("div");
  backdrop.className = "notice-backdrop";
  backdrop.dataset.region = "notice-backdrop";

  const dialog = document.createElement("article");
  dialog.className = "notice-dialog";
  dialog.dataset.noticeDialog = "true";
  dialog.setAttribute("role", "alertdialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "notice-dialog-title");
  dialog.setAttribute("aria-describedby", "notice-dialog-message");

  const title = document.createElement("h2");
  title.id = "notice-dialog-title";
  title.textContent = "Message";

  const message = document.createElement("p");
  message.id = "notice-dialog-message";
  message.className = "notice-dialog-message";
  message.textContent = state.noticeDialog.message;

  const actions = document.createElement("div");
  actions.className = "notice-dialog-actions";

  const ok = document.createElement("button");
  ok.type = "button";
  ok.dataset.action = "notice-close";
  ok.textContent = "OK";

  actions.append(ok);
  dialog.append(title, message, actions);
  backdrop.append(dialog);
  rootEl.append(backdrop);
  ok.focus();
}
