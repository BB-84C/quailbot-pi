import { effectiveScale, screenToCanvas } from "../shared/geometry.js";
import { attachCanvasEvents } from "./events/canvas.js";
import { attachCliImportEvents } from "./events/cli-import.js";
import { attachFilterEvents } from "./events/filter.js";
import { attachFileBrowserEvents } from "./events/file-browser.js";
import { attachFormEvents } from "./events/form.js";
import { attachItemsTreeEvents } from "./events/items-tree.js";
import { formSelectionChanged, type Action } from "./actions.js";
import { renderCanvas } from "./render/canvas.js";
import { renderCliImportModal } from "./render/cli-import-modal.js";
import { renderFilter } from "./render/filter.js";
import { renderFileBrowserModal } from "./render/file-browser.js";
import { renderForm } from "./render/form.js";
import { renderItemsTree } from "./render/items-tree.js";
import { selectionSummary } from "./selectors/form.js";
import { createStore } from "./store.js";

declare global {
  interface Window {
    __quailbotWorkspaceUiReady?: boolean;
    __quailbotShared?: {
      effectiveScale: typeof effectiveScale;
      screenToCanvas: typeof screenToCanvas;
    };
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const appRoot = document.querySelector<HTMLElement>("[data-workspace-ui-root]") ?? document.body;
  let treeRoot = appRoot.querySelector<HTMLElement>("[data-items-tree-root]");
  if (!treeRoot) {
    treeRoot = document.createElement("section");
    treeRoot.dataset.itemsTreeRoot = "true";
    appRoot.append(treeRoot);
  }
  let filterRoot = appRoot.querySelector<HTMLElement>("[data-filter-root]");
  if (!filterRoot) {
    filterRoot = document.createElement("section");
    filterRoot.dataset.filterRoot = "true";
    treeRoot.after(filterRoot);
  }
  let canvasRoot = appRoot.querySelector<HTMLElement>("#canvas-root, [data-canvas-root]");
  if (!canvasRoot) {
    canvasRoot = document.createElement("section");
    canvasRoot.id = "canvas-root";
    canvasRoot.dataset.canvasRoot = "true";
    appRoot.prepend(canvasRoot);
  }
  let formRoot = appRoot.querySelector<HTMLElement>("[data-form-root]");
  if (!formRoot) {
    formRoot = document.createElement("section");
    formRoot.dataset.formRoot = "true";
    appRoot.append(formRoot);
  }
  let modalRoot = appRoot.querySelector<HTMLElement>("[data-cli-import-modal-root]");
  if (!modalRoot) {
    modalRoot = document.createElement("section");
    modalRoot.dataset.cliImportModalRoot = "true";
    formRoot.after(modalRoot);
  }
  let fileBrowserRoot = appRoot.querySelector<HTMLElement>("[data-file-browser-modal-root]");
  if (!fileBrowserRoot) {
    fileBrowserRoot = document.createElement("section");
    fileBrowserRoot.dataset.fileBrowserModalRoot = "true";
    modalRoot.after(fileBrowserRoot);
  }

  const store = createStore();
  const dispatch = (action: Action): void => {
    store.dispatch(action);
    if (action.type.startsWith("TREE_")) {
      store.dispatch(formSelectionChanged(selectionSummary(store.getState())));
    }
  };
  const render = (): void => {
    renderItemsTree(treeRoot, store.getState());
    renderFilter(filterRoot, store.getState());
    renderCanvas(canvasRoot, store.getState());
    renderForm(formRoot, store.getState());
    renderCliImportModal(modalRoot, store.getState());
    renderFileBrowserModal(fileBrowserRoot, store.getState());
  };
  store.dispatch(formSelectionChanged(selectionSummary(store.getState())));
  render();
  store.subscribe(render);
  attachItemsTreeEvents(treeRoot, dispatch);
  attachFilterEvents(filterRoot, dispatch);
  attachCanvasEvents(canvasRoot, dispatch, store.getState);
  attachFormEvents(formRoot, dispatch, store.getState);
  attachCliImportEvents({ formRoot, modalRoot, dispatch, getState: store.getState });
  attachFileBrowserEvents({ formRoot, modalRoot: fileBrowserRoot, dispatch, getState: store.getState });

  window.__quailbotWorkspaceUiReady = true;
  window.__quailbotShared = { effectiveScale, screenToCanvas };
});
