import type { AppState } from "../state.js";

function button(action: string, text: string, disabled = false): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.dataset.action = action;
  el.textContent = text;
  el.disabled = disabled;
  return el;
}

export function renderFileBrowserModal(rootEl: HTMLElement, state: AppState): void {
  rootEl.replaceChildren();
  if (!state.fileBrowser.open) return;
  const backdrop = document.createElement("div");
  backdrop.className = "file-browser-backdrop";
  backdrop.dataset.action = "file-browser-cancel";
  const modal = document.createElement("section");
  modal.className = "file-browser-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.tabIndex = -1;

  const title = document.createElement("h2");
  title.textContent = state.fileBrowser.mode === "load" ? "Load workspace" : "Export workspace";
  const path = document.createElement("p");
  path.className = "file-browser-path";
  path.textContent = state.fileBrowser.currentPath;
  const up = button("file-browser-up", "Parent");
  modal.append(title, path, up);

  const list = document.createElement("ul");
  list.className = "file-browser-entries";
  for (const entry of state.fileBrowser.entries) {
    const item = document.createElement("li");
    const entryButton = button("file-browser-entry", `${entry.kind === "dir" ? "[DIR]" : "[JSON]"} ${entry.name}`);
    entryButton.dataset.fileBrowserEntry = entry.kind;
    entryButton.dataset.path = entry.path;
    entryButton.dataset.name = entry.name;
    if (entry.path === state.fileBrowser.selectedFile) entryButton.setAttribute("aria-selected", "true");
    item.append(entryButton);
    list.append(item);
  }
  modal.append(list);

  if (state.fileBrowser.mode === "export") {
    const label = document.createElement("label");
    label.className = "file-browser-filename-row";
    label.textContent = "Filename";
    const input = document.createElement("input");
    input.dataset.fileBrowserFilename = "true";
    input.value = state.fileBrowser.typedFilename;
    label.append(input);
    modal.append(label);
  }

  if (state.fileBrowser.lastError) {
    const error = document.createElement("p");
    error.className = "file-browser-error";
    error.textContent = state.fileBrowser.lastError;
    modal.append(error);
  }

  const controls = document.createElement("footer");
  controls.className = "file-browser-controls";
  const primaryDisabled = state.fileBrowser.inFlight || (state.fileBrowser.mode === "load" && !state.fileBrowser.selectedFile);
  controls.append(
    button(state.fileBrowser.mode === "load" ? "file-browser-open" : "file-browser-save", state.fileBrowser.mode === "load" ? "Open" : "Save", primaryDisabled),
    button("file-browser-cancel", "Cancel"),
  );
  modal.append(controls);
  rootEl.append(backdrop, modal);
  modal.focus();
}
