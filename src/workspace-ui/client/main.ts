import { effectiveScale, screenToCanvas } from "../shared/geometry.js";
import { loadWorkspaceData } from "../shared/parse.js";
import { attachCanvasEvents } from "./events/canvas.js";
import { attachCliImportEvents } from "./events/cli-import.js";
import { attachConfirmDialogEvents } from "./events/confirm-dialog.js";
import { attachFilterEvents } from "./events/filter.js";
import { attachFileBrowserEvents } from "./events/file-browser.js";
import { attachFormEvents } from "./events/form.js";
import { attachItemsTreeEvents } from "./events/items-tree.js";
import { attachMenuEvents } from "./events/menu.js";
import { attachNoticeDialogEvents } from "./events/notice-dialog.js";
import { attachToolbarEvents } from "./events/toolbar.js";
import { canvasFrameLoaded, formSelectionChanged, startupFinished, startupWorkspaceLoaded, type Action } from "./actions.js";
import { postCapture, postFetchWorkspace } from "./api/workspace.js";
import { renderCanvas } from "./render/canvas.js";
import { renderCliImportModal } from "./render/cli-import-modal.js";
import { renderConfirmDialog } from "./render/confirm-dialog.js";
import { renderFilter } from "./render/filter.js";
import { renderFileBrowserModal } from "./render/file-browser.js";
import { renderForm } from "./render/form.js";
import { renderItemsTree } from "./render/items-tree.js";
import { renderMenu } from "./render/menu.js";
import { renderNoticeDialog } from "./render/notice-dialog.js";
import { renderToolbar } from "./render/toolbar.js";
import { selectionSummary } from "./selectors/form.js";
import { createStore } from "./store.js";
import type { AppState } from "./state.js";
import { workspaceDocumentTitle } from "./title.js";

declare global {
  interface Window {
    __quailbotWorkspaceUiReady?: boolean;
    __quailbotWorkspaceUiBooting?: boolean;
    __quailbotWorkspaceUiBootStep?: string;
    __quailbotWorkspaceUiError?: string;
    __quailbotShared?: {
      effectiveScale: typeof effectiveScale;
      screenToCanvas: typeof screenToCanvas;
    };
  }
}

function bootWorkspaceUiOnce(): void {
  if (window.__quailbotWorkspaceUiReady || window.__quailbotWorkspaceUiBooting) return;
  window.__quailbotWorkspaceUiBooting = true;
  try {
    bootstrapWorkspaceUi();
  } catch (error) {
    reportStartupFatal(error);
  } finally {
    window.__quailbotWorkspaceUiBooting = false;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootWorkspaceUiOnce, { once: true });
} else {
  bootWorkspaceUiOnce();
}

function bootstrapWorkspaceUi(): void {
  window.__quailbotWorkspaceUiBootStep = "mount-roots";
  const appRoot = document.querySelector<HTMLElement>("[data-workspace-ui-root]") ?? document.body;
  appRoot.dataset.workspaceUiBootStep = "mount-roots";
  let menuRoot = appRoot.querySelector<HTMLElement>("[data-menu-root]");
  if (!menuRoot) {
    menuRoot = document.createElement("nav");
    menuRoot.dataset.menuRoot = "true";
    appRoot.prepend(menuRoot);
  }
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
  let toolbarRoot = appRoot.querySelector<HTMLElement>("[data-workspace-toolbar-root]");
  if (!toolbarRoot) {
    toolbarRoot = document.createElement("div");
    toolbarRoot.dataset.workspaceToolbarRoot = "true";
    filterRoot.after(toolbarRoot);
  }
  let startupRoot = appRoot.querySelector<HTMLElement>("[data-startup-banner-root]");
  if (!startupRoot) {
    startupRoot = document.createElement("section");
    startupRoot.dataset.startupBannerRoot = "true";
    menuRoot.after(startupRoot);
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
  let helpRoot = appRoot.querySelector<HTMLElement>("[data-help-modal-root]");
  if (!helpRoot) {
    helpRoot = document.createElement("section");
    helpRoot.dataset.helpModalRoot = "true";
    fileBrowserRoot.after(helpRoot);
  }
  let confirmRoot = appRoot.querySelector<HTMLElement>("[data-confirm-modal-root]");
  if (!confirmRoot) {
    confirmRoot = document.createElement("section");
    confirmRoot.dataset.confirmModalRoot = "true";
    helpRoot.after(confirmRoot);
  }
  let noticeRoot = appRoot.querySelector<HTMLElement>("[data-notice-modal-root]");
  if (!noticeRoot) {
    noticeRoot = document.createElement("section");
    noticeRoot.dataset.noticeModalRoot = "true";
    confirmRoot.after(noticeRoot);
  }

  const store = createStore();
  window.__quailbotWorkspaceUiBootStep = "create-store";
  appRoot.dataset.workspaceUiBootStep = "create-store";
  const dispatch = (action: Action): void => {
    store.dispatch(action);
    if (action.type.startsWith("TREE_")) {
      store.dispatch(formSelectionChanged(selectionSummary(store.getState())));
    }
  };
  let previousState: AppState | null = null;
  const render = (): void => {
    const state = store.getState();
    const prev = previousState;
    if (!prev || prev.workspace.currentPath !== state.workspace.currentPath || prev.canvas.mode !== state.canvas.mode) {
      document.title = workspaceDocumentTitle(state);
      renderMenu(menuRoot, state);
    }
    if (!prev || prev.startup !== state.startup) {
      renderStartupBanner(startupRoot, state);
    }
    if (
      !prev ||
      prev.workspace.currentPath !== state.workspace.currentPath ||
      prev.workspace.cliEnabled !== state.workspace.cliEnabled ||
      prev.workspace.cliName !== state.workspace.cliName ||
      prev.tree.selected !== state.tree.selected ||
      prev.cliImport !== state.cliImport ||
      prev.canvas.frame !== state.canvas.frame
    ) {
      renderToolbar(toolbarRoot, state);
    }
    if (
      !prev ||
      prev.workspace.rois !== state.workspace.rois ||
      prev.workspace.anchors !== state.workspace.anchors ||
      prev.workspace.groups !== state.workspace.groups ||
      prev.workspace.cliParams !== state.workspace.cliParams ||
      prev.tree !== state.tree ||
      prev.filter !== state.filter
    ) {
      renderItemsTree(treeRoot, state);
    }
    if (!prev || prev.workspace !== state.workspace || prev.filter !== state.filter) {
      renderFilter(filterRoot, state);
    }
    if (
      !prev ||
      prev.canvas !== state.canvas ||
      prev.workspace.rois !== state.workspace.rois ||
      prev.workspace.anchors !== state.workspace.anchors ||
      prev.tree.selected !== state.tree.selected
    ) {
      renderCanvas(canvasRoot, state);
    }
    if (!prev || prev.workspace !== state.workspace || prev.tree.selected !== state.tree.selected || prev.form !== state.form) {
      renderForm(formRoot, state);
    }
    if (!prev || prev.cliImport !== state.cliImport) {
      renderCliImportModal(modalRoot, state);
    }
    if (!prev || prev.fileBrowser !== state.fileBrowser) {
      renderFileBrowserModal(fileBrowserRoot, state);
    }
    if (!prev || prev.confirmDialog !== state.confirmDialog) {
      renderConfirmDialog(confirmRoot, state);
    }
    if (!prev || prev.noticeDialog !== state.noticeDialog) {
      renderNoticeDialog(noticeRoot, state);
    }
    previousState = state;
  };
  store.dispatch(formSelectionChanged(selectionSummary(store.getState())));
  window.__quailbotWorkspaceUiBootStep = "initial-render";
  appRoot.dataset.workspaceUiBootStep = "initial-render";
  render();
  store.subscribe(render);
  window.__quailbotWorkspaceUiBootStep = "attach-items-tree";
  appRoot.dataset.workspaceUiBootStep = "attach-items-tree";
  attachItemsTreeEvents(treeRoot, dispatch);
  window.__quailbotWorkspaceUiBootStep = "attach-filter";
  appRoot.dataset.workspaceUiBootStep = "attach-filter";
  attachFilterEvents(filterRoot, dispatch);
  window.__quailbotWorkspaceUiBootStep = "attach-canvas";
  appRoot.dataset.workspaceUiBootStep = "attach-canvas";
  attachCanvasEvents(canvasRoot, dispatch, store.getState);
  window.__quailbotWorkspaceUiBootStep = "attach-form";
  appRoot.dataset.workspaceUiBootStep = "attach-form";
  attachFormEvents(formRoot, dispatch, store.getState);
  window.__quailbotWorkspaceUiBootStep = "attach-cli-import";
  appRoot.dataset.workspaceUiBootStep = "attach-cli-import";
  attachCliImportEvents({ formRoot: toolbarRoot, modalRoot, dispatch, getState: store.getState });
  window.__quailbotWorkspaceUiBootStep = "attach-file-browser";
  appRoot.dataset.workspaceUiBootStep = "attach-file-browser";
  attachFileBrowserEvents({ formRoots: [toolbarRoot, menuRoot], modalRoot: fileBrowserRoot, dispatch, getState: store.getState });
  window.__quailbotWorkspaceUiBootStep = "attach-toolbar";
  appRoot.dataset.workspaceUiBootStep = "attach-toolbar";
  attachToolbarEvents({ root: toolbarRoot, dispatch, getState: store.getState });
  attachConfirmDialogEvents({ root: confirmRoot, dispatch, getState: store.getState });
  attachNoticeDialogEvents({ root: noticeRoot, dispatch, getState: store.getState });
  window.__quailbotWorkspaceUiBootStep = "attach-menu";
  appRoot.dataset.workspaceUiBootStep = "attach-menu";
  attachMenuEvents({ menuRoot, helpRoot });

  window.__quailbotWorkspaceUiBootStep = "startup-fetch";
  appRoot.dataset.workspaceUiBootStep = "startup-fetch";
  void runStartupFetch(dispatch);

  window.__quailbotWorkspaceUiReady = true;
  window.__quailbotWorkspaceUiBootStep = "ready";
  appRoot.dataset.workspaceUiReady = "true";
  appRoot.dataset.workspaceUiBootStep = "ready";
  window.__quailbotShared = { effectiveScale, screenToCanvas };
}

function reportStartupFatal(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  window.__quailbotWorkspaceUiError = message;
  const root = document.querySelector<HTMLElement>("[data-startup-banner-root]") ?? document.querySelector<HTMLElement>("[data-workspace-ui-root]") ?? document.body;
  root.dataset.startupError = message;
  const banner = document.createElement("div");
  banner.className = "startup-error-banner";
  banner.textContent = `Workspace UI startup failed: ${message}`;
  root.prepend(banner);
  console.error("Workspace UI startup failed", error);
}

async function runStartupFetch(dispatch: (action: Action) => void): Promise<void> {
  const errors: string[] = [];
  try {
    const workspace = await postFetchWorkspace();
    if (workspace.ok) {
      const parsed = loadWorkspaceData(workspace.canonicalJson);
      dispatch(
        startupWorkspaceLoaded({
          ...parsed,
          raw: workspace.canonicalJson,
          currentPath: workspace.summary.path,
          lastSavedHash: workspace.summary.hash,
        }),
      );
    } else {
      errors.push(workspace.error || "Workspace startup fetch failed");
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  try {
    const capture = await postCapture();
    if (capture.ok) {
      dispatch(canvasFrameLoaded(capture.frame));
    } else {
      errors.push(capture.error || "Capture startup fetch failed");
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  dispatch(startupFinished(errors.length > 0 ? errors.join("; ") : null));
}

function renderStartupBanner(rootEl: HTMLElement, state: AppState): void {
  rootEl.replaceChildren();
  if (!state.startup.error) return;
  const banner = document.createElement("div");
  banner.className = "startup-error-banner";
  banner.textContent = state.startup.error;
  rootEl.append(banner);
}
