import { effectiveScale, screenToCanvas } from "../shared/geometry.js";
import { attachItemsTreeEvents } from "./events/items-tree.js";
import { renderItemsTree } from "./render/items-tree.js";
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

  const store = createStore();
  const render = (): void => renderItemsTree(treeRoot, store.getState());
  render();
  store.subscribe(render);
  attachItemsTreeEvents(treeRoot, store.dispatch);

  window.__quailbotWorkspaceUiReady = true;
  window.__quailbotShared = { effectiveScale, screenToCanvas };
});
