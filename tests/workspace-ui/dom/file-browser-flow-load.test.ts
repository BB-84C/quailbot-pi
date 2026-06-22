import { beforeEach, describe, expect, it, vi } from "vitest";

import { attachFileBrowserEvents } from "../../../src/workspace-ui/client/events/file-browser.js";
import { renderFileBrowserModal } from "../../../src/workspace-ui/client/render/file-browser.js";
import { renderForm } from "../../../src/workspace-ui/client/render/form.js";
import { renderMenu } from "../../../src/workspace-ui/client/render/menu.js";
import { renderNoticeDialog } from "../../../src/workspace-ui/client/render/notice-dialog.js";
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
  const noticeRoot = document.createElement("section");
  document.body.replaceChildren(menuRoot, toolbarRoot, formRoot, modalRoot, noticeRoot);
  const store = createStore(state);
  const dispatch = (action: Action): void => {
    store.dispatch(action);
    renderMenu(menuRoot, store.getState());
    renderToolbar(toolbarRoot, store.getState());
    renderForm(formRoot, store.getState());
    renderFileBrowserModal(modalRoot, store.getState());
    renderNoticeDialog(noticeRoot, store.getState());
  };
  renderMenu(menuRoot, store.getState());
  renderToolbar(toolbarRoot, store.getState());
  renderForm(formRoot, store.getState());
  renderFileBrowserModal(modalRoot, store.getState());
  const off = attachFileBrowserEvents({ formRoots: [toolbarRoot, menuRoot], modalRoot, dispatch, getState: store.getState });
  return { menuRoot, toolbarRoot, formRoot, modalRoot, noticeRoot, store, off };
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
    const { menuRoot, formRoot, modalRoot, noticeRoot, store } = mount(state);

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
    expect(menuRoot.querySelector(".workspace-path-file")?.textContent).toBe("loaded.json");
    expect(menuRoot.querySelector(".workspace-path-full")?.textContent).toBe("D:\\quailbot\\workspaces\\loaded.json");
    expect(noticeRoot.querySelector(".notice-dialog-message")?.textContent).toBe("Loaded D:\\quailbot\\workspaces\\loaded.json");
  });

  it("opens a selected file on a fast second activation like the Tk file dialog double-click path", async () => {
    const state = initialState();
    state.workspace.currentPath = "D:\\quailbot\\workspaces\\active.json";
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, resolved: "D:\\quailbot\\workspaces", entries: [{ name: "double.json", kind: "file", path: "D:\\quailbot\\workspaces\\double.json" }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, path: "D:\\quailbot\\workspaces\\double.json", canonicalJson: { rois: [{ name: "double-roi", x: 1, y: 2, w: 3, h: 4, description: "", active: true }], anchors: [], groups: [], tools: {} }, summary: { path: "D:\\quailbot\\workspaces\\double.json", hash: "abcd1234abcd1234" } })));
    vi.stubGlobal("fetch", fetch);
    const { menuRoot, modalRoot, noticeRoot, store } = mount(state);

    menuRoot.querySelector<HTMLButtonElement>('button[data-action="file-browser-load"]')?.click();
    await flush();
    modalRoot.querySelector<HTMLButtonElement>('button[data-file-browser-entry="file"]')?.click();
    expect(store.getState().fileBrowser.selectedFile).toBe("D:\\quailbot\\workspaces\\double.json");
    modalRoot.querySelector<HTMLButtonElement>('button[data-file-browser-entry="file"]')?.click();
    await flush();

    expect(fetch).toHaveBeenNthCalledWith(2, "/api/load", expect.objectContaining({ method: "POST" }));
    expect(store.getState().workspace.rois.map((roi) => roi.name)).toEqual(["double-roi"]);
    expect(store.getState().workspace.currentPath).toBe("D:\\quailbot\\workspaces\\double.json");
    expect(noticeRoot.querySelector(".notice-dialog-message")?.textContent).toBe("Loaded D:\\quailbot\\workspaces\\double.json");
  });

  it("shows load failures in the app-owned notice dialog", async () => {
    const state = initialState();
    state.workspace.currentPath = "D:\\quailbot\\workspaces\\active.json";
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, resolved: "D:\\quailbot\\workspaces", entries: [{ name: "broken.json", kind: "file", path: "D:\\quailbot\\workspaces\\broken.json" }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: "invalid workspace JSON" })));
    vi.stubGlobal("fetch", fetch);
    const { menuRoot, modalRoot, noticeRoot, store } = mount(state);

    menuRoot.querySelector<HTMLButtonElement>('button[data-action="file-browser-load"]')?.click();
    await flush();
    modalRoot.querySelector<HTMLButtonElement>('button[data-file-browser-entry="file"]')?.click();
    modalRoot.querySelector<HTMLButtonElement>('button[data-action="file-browser-open"]')?.click();
    await flush();

    expect(store.getState().workspace.currentPath).toBe("D:\\quailbot\\workspaces\\active.json");
    expect(store.getState().fileBrowser.open).toBe(true);
    expect(store.getState().fileBrowser.lastError).toBe("invalid workspace JSON");
    expect(noticeRoot.querySelector(".notice-dialog-message")?.textContent).toBe("invalid workspace JSON");
  });

  it("keeps the last successful directory visible when parent browse is rejected by path policy", async () => {
    const state = initialState();
    state.workspace.currentPath = "D:\\quailbot\\.quailbot-pi\\workspace.json";
    const fetch = vi.fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            resolved: "D:\\quailbot\\.quailbot-pi",
            entries: [{ name: "workspace.json", kind: "file", path: "D:\\quailbot\\.quailbot-pi\\workspace.json" }],
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: "path is outside the allowed roots" })));
    vi.stubGlobal("fetch", fetch);
    const { menuRoot, modalRoot, store } = mount(state);

    menuRoot.querySelector<HTMLButtonElement>('button[data-action="file-browser-load"]')?.click();
    await flush();

    expect(store.getState().fileBrowser.currentPath).toBe("D:\\quailbot\\.quailbot-pi");
    expect(modalRoot.querySelector<HTMLButtonElement>('button[data-action="file-browser-open"]')?.disabled).toBe(true);

    modalRoot.querySelector<HTMLButtonElement>('button[data-action="file-browser-up"]')?.click();
    await flush();

    expect(fetch).toHaveBeenNthCalledWith(2, "/api/browse", expect.objectContaining({ method: "POST" }));
    expect(store.getState().fileBrowser.currentPath).toBe("D:\\quailbot\\.quailbot-pi");
    expect(store.getState().fileBrowser.entries.map((entry) => entry.name)).toEqual(["workspace.json"]);
    expect(store.getState().fileBrowser.lastError).toBe("path is outside the allowed roots");
    expect(modalRoot.querySelector(".file-browser-path")?.textContent).toBe("D:\\quailbot\\.quailbot-pi");
    expect(modalRoot.querySelector(".file-browser-error")?.textContent).toBe("path is outside the allowed roots");
  });

  it("starts from the project directory when the active workspace is in the hidden state directory", async () => {
    const state = initialState();
    state.workspace.currentPath = "D:\\quailbot-pi\\.quailbot-pi\\workspace.json";
    const fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          resolved: "D:\\quailbot-pi",
          entries: [{ name: "workspaces", kind: "dir", path: "D:\\quailbot-pi\\workspaces" }],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const { menuRoot, modalRoot, store } = mount(state);

    menuRoot.querySelector<HTMLButtonElement>('button[data-action="file-browser-load"]')?.click();
    await flush();

    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toMatchObject({ path: "D:\\quailbot-pi" });
    expect(store.getState().fileBrowser.currentPath).toBe("D:\\quailbot-pi");
    expect(modalRoot.querySelector(".file-browser-path")?.textContent).toBe("D:\\quailbot-pi");
    expect(store.getState().fileBrowser.entries.map((entry) => entry.name)).toEqual(["workspaces"]);
  });

  it("navigates from a drive child directory to the drive root with Parent", async () => {
    const state = initialState();
    state.workspace.currentPath = "D:\\quailbot-pi\\.quailbot-pi\\workspace.json";
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, resolved: "D:\\quailbot-pi", entries: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, resolved: "D:\\", entries: [{ name: "quailbot", kind: "dir", path: "D:\\quailbot" }] })));
    vi.stubGlobal("fetch", fetch);
    const { menuRoot, modalRoot, store } = mount(state);

    menuRoot.querySelector<HTMLButtonElement>('button[data-action="file-browser-load"]')?.click();
    await flush();
    modalRoot.querySelector<HTMLButtonElement>('button[data-action="file-browser-up"]')?.click();
    await flush();

    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toMatchObject({ path: "D:\\" });
    expect(store.getState().fileBrowser.currentPath).toBe("D:\\");
    expect(store.getState().fileBrowser.entries.map((entry) => entry.name)).toEqual(["quailbot"]);
  });

  it("surfaces no-active-workspace browse failures instead of sending an empty path", async () => {
    const state = initialState();
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: "no active workspace" })));
    vi.stubGlobal("fetch", fetch);
    const { menuRoot, modalRoot, store } = mount(state);

    menuRoot.querySelector<HTMLButtonElement>('button[data-action="file-browser-load"]')?.click();
    await flush();

    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toMatchObject({ path: "." });
    expect(store.getState().fileBrowser.currentPath).toBe("");
    expect(store.getState().fileBrowser.lastError).toBe("no active workspace");
    expect(modalRoot.querySelector(".file-browser-path")?.textContent).toBe("");
    expect(modalRoot.querySelector(".file-browser-error")?.textContent).toBe("no active workspace");
    expect(modalRoot.querySelector<HTMLButtonElement>('button[data-action="file-browser-open"]')?.disabled).toBe(true);
  });
});
