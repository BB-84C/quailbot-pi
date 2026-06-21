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

function cliNameControl(state: AppState): HTMLElement {
  const label = document.createElement("label");
  label.className = "toolbar-label";
  const text = document.createElement("span");
  text.textContent = "CLI Name";
  const input = document.createElement("input");
  input.type = "text";
  input.dataset.cliImportName = "true";
  input.value = state.cliImport.cliName || state.workspace.cliName || "";
  label.append(text, input);
  return label;
}

function cliEnabledControl(state: AppState): HTMLElement {
  const label = document.createElement("label");
  label.className = "toolbar-check toolbar-row-span";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.dataset.action = "cli-tools-enabled";
  input.checked = state.workspace.cliEnabled;
  const text = document.createElement("span");
  text.textContent = "CLI tools enabled";
  label.append(input, text);
  return label;
}

export function renderToolbar(rootEl: HTMLElement, state: AppState): void {
  rootEl.className = "workspace-toolbar";
  const grid = document.createElement("div");
  grid.className = "toolbar-grid";
  grid.append(
    button("tree-add-roi", "Add ROI"),
    button("tree-add-anchor", "Add Anchor"),
    button("tree-add-group", "Add Group"),
    button("cli-import-load", state.cliImport.inFlight ? "Loading..." : "Load Param From CLI", state.cliImport.inFlight),
    button("tree-delete", "Delete", state.tree.selected.length === 0),
    button("file-browser-save", "Save", state.workspace.currentPath.trim().length === 0),
    cliNameControl(state),
    cliEnabledControl(state),
  );
  if (state.cliImport.lastError) {
    const error = document.createElement("p");
    error.className = "cli-import-error toolbar-row-span";
    error.textContent = state.cliImport.lastError;
    grid.append(error);
  }

  const pickGroup = document.createElement("fieldset");
  pickGroup.className = "toolbar-fieldset";
  const pickLegend = document.createElement("legend");
  pickLegend.textContent = "Pick on screenshot";
  const pickStack = document.createElement("div");
  pickStack.className = "toolbar-stack";
  pickStack.append(
    button("canvas-draw-roi", "Draw ROI box", !hasSingleSelection(state, "roi")),
    button("canvas-pick-anchor", "Pick anchor point", !hasSingleSelection(state, "anchor")),
    button("capture-refresh", "Refresh screenshot"),
  );
  pickGroup.append(pickLegend, pickStack);

  rootEl.replaceChildren(grid, pickGroup);
}
