import { describe, expect, it } from "vitest";

import { fileBrowserOpen } from "../../../src/workspace-ui/client/actions.js";
import { attachFileBrowserEvents } from "../../../src/workspace-ui/client/events/file-browser.js";
import { renderFileBrowserModal } from "../../../src/workspace-ui/client/render/file-browser.js";
import { createStore } from "../../../src/workspace-ui/client/store.js";
import { initialState } from "../../../src/workspace-ui/client/state.js";
import type { Action } from "../../../src/workspace-ui/client/actions.js";

describe("file browser cancel flow", () => {
  it("dismisses on Escape and overlay backdrop click", () => {
    const formRoot = document.createElement("section");
    const modalRoot = document.createElement("section");
    document.body.replaceChildren(formRoot, modalRoot);
    const store = createStore(initialState());
    const dispatch = (action: Action): void => {
      store.dispatch(action);
      renderFileBrowserModal(modalRoot, store.getState());
    };
    attachFileBrowserEvents({ formRoot, modalRoot, dispatch, getState: store.getState });

    dispatch(fileBrowserOpen("load"));
    expect(store.getState().fileBrowser.open).toBe(true);
    modalRoot.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(store.getState().fileBrowser.open).toBe(false);

    dispatch(fileBrowserOpen("export"));
    modalRoot.querySelector<HTMLElement>(".file-browser-backdrop")?.click();
    expect(store.getState().fileBrowser.open).toBe(false);
  });
});
