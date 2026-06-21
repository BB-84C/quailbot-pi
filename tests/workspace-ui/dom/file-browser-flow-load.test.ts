import { beforeEach, describe, expect, it, vi } from "vitest";

import { attachFileBrowserEvents } from "../../../src/workspace-ui/client/events/file-browser.js";
import { renderFileBrowserModal } from "../../../src/workspace-ui/client/render/file-browser.js";
import { renderForm } from "../../../src/workspace-ui/client/render/form.js";
import { renderMenu } from "../../../src/workspace-ui/client/render/menu.js";
import { renderToolbar } from "../../../src/workspace-ui/client/render/toolbar.js";
import { createStore } from "../../../src/workspace-ui/client/store.js";
import { initialState, type AppState } from "../../../src/workspace-ui/client/state.js";
import type { Action } from "../../../src/workspace-ui/client/actions.js";

function flush(): Promise<void> {
  return Promise.resolve().then(() => Promise.resolve()).then(() => Promise.resolve()).then(() => Promise.resolve());
}

function mount(state: AppState) {
  const formRoot = document.createElement("section");
  const toolbarRoot = document.createElement("section");
  const menuRoot = document.createElement("section");
  const modalRoot = document.createElement("section");
  document.body.replaceChildren(menuRoot, toolbarRoot, formRoot, modalRoot);
  const store = createStore(state);
  const dispatch = (action: Action): void => {
    store.dispatch(action);
    renderMenu(menuRoot);
    renderToolbar(toolbarRoot, store.getState());
    renderForm(formRoot, store.getState());
    renderFileBrowserModal(modalRoot, store.getState());
  };
  renderMenu(menuRoot);
  renderToolbar(toolbarRoot, store.getState());
  renderForm(formRoot, store.getState());
  renderFileBrowserModal(modalRoot, store.getState());
  const off = attachFileBrowserEvents({ formRoots: [toolbarRoot, menuRoot], modalRoot, dispatch, getState: store.getState });
  return { menuRoot, toolbarRoot, formRoot, modalRoot, store, off };
}

describe("file browser load flow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("opens, browses, selects a file, loads it, and replaces workspace state/currentPath", async () => {
    const state = initialState();
    state.workspace.currentPath = "D:\\quailbot\\workspaces\\active.json";
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, resolved: "D:\\quailbot\\workspaces", entries: [{ name: "loaded.json", kind: "file", path: "D:\\quailbot\\workspaces\\loaded.json" }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, path: "D:\\quailbot\\workspaces\\loaded.json", canonicalJson: { rois: [{ name: "loaded-roi", x: 1, y: 2, w: 3, h: 4, description: "", active: true }], anchors: [], groups: [], tools: {} }, summary: { path: "D:\\quailbot\\workspaces\\loaded.json", hash: "abcd1234abcd1234" } })));
    vi.stubGlobal("fetch", fetch);
    const { menuRoot, formRoot, modalRoot, store } = mount(state);

    expect(formRoot.querySelector('button[data-action="file-browser-load"]')).toBeNull();
    menuRoot.querySelector<HTMLButtonElement>('button[data-action="file-browser-load"]')?.click();
    await flush();
    modalRoot.querySelector<HTMLButtonElement>('button[data-file-browser-entry="file"]')?.click();
    modalRoot.querySelector<HTMLButtonElement>('button[data-action="file-browser-open"]')?.click();
    await flush();

    expect(fetch).toHaveBeenNthCalledWith(1, "/api/browse", expect.objectContaining({ method: "POST" }));
    expect(fetch).toHaveBeenNthCalledWith(2, "/api/load", expect.objectContaining({ method: "POST" }));
    expect(store.getState().workspace.rois.map((roi) => roi.name)).toEqual(["loaded-roi"]);
    expect(store.getState().workspace.currentPath).toBe("D:\\quailbot\\workspaces\\loaded.json");
  });
});
