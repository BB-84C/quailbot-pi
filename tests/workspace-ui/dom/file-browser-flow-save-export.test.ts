import { beforeEach, describe, expect, it, vi } from "vitest";

import { fileBrowserOpen } from "../../../src/workspace-ui/client/actions.js";
import { attachFileBrowserEvents } from "../../../src/workspace-ui/client/events/file-browser.js";
import { renderFileBrowserModal } from "../../../src/workspace-ui/client/render/file-browser.js";
import { renderForm } from "../../../src/workspace-ui/client/render/form.js";
import { renderMenu } from "../../../src/workspace-ui/client/render/menu.js";
import { renderNoticeDialog } from "../../../src/workspace-ui/client/render/notice-dialog.js";
import { renderToolbar } from "../../../src/workspace-ui/client/render/toolbar.js";
import { createStore } from "../../../src/workspace-ui/client/store.js";
import { initialState, type AppState } from "../../../src/workspace-ui/client/state.js";
import type { Action } from "../../../src/workspace-ui/client/actions.js";
import { buildWorkspaceJson, stringifyWorkspaceJson } from "../../../src/workspace-ui/shared/serialize.js";

function flush(): Promise<void> {
  return Promise.resolve().then(() => Promise.resolve()).then(() => Promise.resolve()).then(() => Promise.resolve());
}

function fixtureState(): AppState {
  const state = initialState();
  state.workspace.currentPath = "D:\\quailbot\\workspaces\\active.json";
  state.workspace.raw = { unknown: true };
  state.workspace.rois = [{ name: "roi", x: 1, y: 2, w: 3, h: 4, description: "", tags: "", active: true, group: "" }];
  return state;
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

function postedJson(fetchMock: ReturnType<typeof vi.fn>, callIndex: number): Record<string, unknown> {
  return JSON.parse(String(fetchMock.mock.calls[callIndex]?.[1]?.body)) as Record<string, unknown>;
}

describe("file browser save/export flow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("Save posts updateCurrent true and updates currentPath on success", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, path: "D:\\quailbot\\workspaces\\active.json", hash: "abcd1234abcd1234" })));
    vi.stubGlobal("fetch", fetch);
    const { toolbarRoot, formRoot, noticeRoot, store } = mount(fixtureState());
    const expected = buildWorkspaceJson(store.getState().workspace);

    expect(formRoot.querySelector('button[data-action="file-browser-save"]')).toBeNull();
    toolbarRoot.querySelector<HTMLButtonElement>('button[data-action="file-browser-save"]')?.click();
    await flush();

    const body = postedJson(fetch, 0);
    expect(body.updateCurrent).toBe(true);
    expect(stringifyWorkspaceJson(body.workspaceJson as Record<string, unknown>)).toBe(stringifyWorkspaceJson(expected));
    expect(store.getState().workspace.currentPath).toBe("D:\\quailbot\\workspaces\\active.json");
    expect(noticeRoot.querySelector(".notice-dialog-message")?.textContent).toBe("Saved to D:\\quailbot\\workspaces\\active.json");
  });

  it("Export posts updateCurrent false and does not update currentPath on success", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, resolved: "D:\\quailbot\\workspaces", entries: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, path: "D:\\quailbot\\workspaces\\exported.json", hash: "abcd1234abcd1234" })));
    vi.stubGlobal("fetch", fetch);
    const { menuRoot, formRoot, modalRoot, noticeRoot, store } = mount(fixtureState());
    const before = store.getState().workspace.currentPath;

    expect(formRoot.querySelector('button[data-action="file-browser-export"]')).toBeNull();
    menuRoot.querySelector<HTMLButtonElement>('button[data-action="file-browser-export"]')?.click();
    await flush();
    const input = modalRoot.querySelector<HTMLInputElement>('input[data-file-browser-filename="true"]');
    if (!input) throw new Error("missing export filename input");
    expect(input.value).toBe("active.json");
    input.value = "exported.json";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    modalRoot.querySelector<HTMLButtonElement>('button[data-action="file-browser-save"]')?.click();
    await flush();

    const body = postedJson(fetch, 1);
    expect(body.path).toBe("D:\\quailbot\\workspaces\\exported.json");
    expect(body.updateCurrent).toBe(false);
    expect(store.getState().workspace.currentPath).toBe(before);
    expect(noticeRoot.querySelector(".notice-dialog-message")?.textContent).toBe("Exported to D:\\quailbot\\workspaces\\exported.json");
  });

  it("ignores background file controls while the file modal is open", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, resolved: "D:\\quailbot\\workspaces", entries: [] })));
    vi.stubGlobal("fetch", fetch);
    const { menuRoot, toolbarRoot, modalRoot, noticeRoot, store } = mount(fixtureState());

    menuRoot.querySelector<HTMLButtonElement>('button[data-action="file-browser-export"]')?.click();
    await flush();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(store.getState().fileBrowser.open).toBe(true);
    expect(store.getState().fileBrowser.mode).toBe("export");
    expect(modalRoot.querySelector(".file-browser-modal")).not.toBeNull();

    toolbarRoot.querySelector<HTMLButtonElement>('button[data-action="file-browser-save"]')?.click();
    menuRoot.querySelector<HTMLButtonElement>('button[data-action="file-browser-load"]')?.click();
    menuRoot.querySelector<HTMLButtonElement>('button[data-action="file-browser-export"]')?.click();
    await flush();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(store.getState().fileBrowser.open).toBe(true);
    expect(store.getState().fileBrowser.mode).toBe("export");
    expect(modalRoot.querySelector(".file-browser-modal")).not.toBeNull();
    expect(noticeRoot.querySelector(".notice-dialog")).toBeNull();
  });

  it("Save failure shows the concrete validation message even when no file modal is open", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, error: "Duplicate name: 'roi'", errors: [{ code: "duplicate_name", message: "Duplicate name: 'roi'" }] })));
    vi.stubGlobal("fetch", fetch);
    const { toolbarRoot, modalRoot, noticeRoot, store } = mount(fixtureState());

    toolbarRoot.querySelector<HTMLButtonElement>('button[data-action="file-browser-save"]')?.click();
    await flush();

    expect(store.getState().fileBrowser.open).toBe(false);
    expect(store.getState().fileBrowser.lastError).toBe("Duplicate name: 'roi'");
    expect(modalRoot.querySelector(".file-browser-error")).toBeNull();
    expect(noticeRoot.querySelector(".notice-dialog-message")?.textContent).toBe("Duplicate name: 'roi'");
  });

  it("Export failure keeps the modal open and shows the concrete validation message", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, resolved: "D:\\quailbot\\workspaces", entries: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, errors: [{ code: "roi_nonpositive_dim", message: "ROI 'roi' must have positive w/h" }] })));
    vi.stubGlobal("fetch", fetch);
    const { menuRoot, formRoot, modalRoot, noticeRoot, store } = mount(fixtureState());

    expect(formRoot.querySelector('button[data-action="file-browser-export"]')).toBeNull();
    menuRoot.querySelector<HTMLButtonElement>('button[data-action="file-browser-export"]')?.click();
    await flush();
    const input = modalRoot.querySelector<HTMLInputElement>('input[data-file-browser-filename="true"]');
    if (!input) throw new Error("missing export filename input");
    expect(input.value).toBe("active.json");
    input.value = "exported.json";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    modalRoot.querySelector<HTMLButtonElement>('button[data-action="file-browser-save"]')?.click();
    await flush();

    expect(store.getState().fileBrowser.open).toBe(true);
    expect(store.getState().fileBrowser.lastError).toBe("ROI 'roi' must have positive w/h");
    expect(modalRoot.querySelector(".file-browser-error")?.textContent).toBe("ROI 'roi' must have positive w/h");
    expect(noticeRoot.querySelector(".notice-dialog-message")?.textContent).toBe("ROI 'roi' must have positive w/h");
  });

  it("uses the Tk export fallback filename when the current workspace path is empty", () => {
    const state = initialState();
    const { modalRoot, store } = mount(state);

    store.dispatch(fileBrowserOpen("export"));
    renderFileBrowserModal(modalRoot, store.getState());

    expect(modalRoot.querySelector<HTMLInputElement>('input[data-file-browser-filename="true"]')?.value).toBe("workspace.json");
  });

  it("starts export browsing from the project directory when current workspace is in the hidden state directory", async () => {
    const state = fixtureState();
    state.workspace.currentPath = "D:\\quailbot-pi\\.quailbot-pi\\workspace.json";
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, resolved: "D:\\quailbot-pi", entries: [] })));
    vi.stubGlobal("fetch", fetch);
    const { menuRoot, modalRoot, store } = mount(state);

    menuRoot.querySelector<HTMLButtonElement>('button[data-action="file-browser-export"]')?.click();
    await flush();

    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toMatchObject({ path: "D:\\quailbot-pi" });
    expect(store.getState().fileBrowser.currentPath).toBe("D:\\quailbot-pi");
    expect(modalRoot.querySelector(".file-browser-path")?.textContent).toBe("D:\\quailbot-pi");
  });

  it("keeps Export save disabled after a no-active-workspace browse failure", async () => {
    const state = initialState();
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: "no active workspace" })));
    vi.stubGlobal("fetch", fetch);
    const { menuRoot, modalRoot, store } = mount(state);

    menuRoot.querySelector<HTMLButtonElement>('button[data-action="file-browser-export"]')?.click();
    await flush();

    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toMatchObject({ path: "." });
    expect(store.getState().fileBrowser.currentPath).toBe("");
    expect(store.getState().fileBrowser.lastError).toBe("no active workspace");
    expect(modalRoot.querySelector<HTMLInputElement>('input[data-file-browser-filename="true"]')?.value).toBe("workspace.json");
    expect(modalRoot.querySelector(".file-browser-error")?.textContent).toBe("no active workspace");
    expect(modalRoot.querySelector<HTMLButtonElement>('button[data-action="file-browser-save"]')?.disabled).toBe(true);
  });
});
