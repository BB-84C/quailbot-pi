import { beforeEach, describe, expect, it, vi } from "vitest";

import { attachFileBrowserEvents } from "../../../src/workspace-ui/client/events/file-browser.js";
import { renderFileBrowserModal } from "../../../src/workspace-ui/client/render/file-browser.js";
import { renderForm } from "../../../src/workspace-ui/client/render/form.js";
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
  const modalRoot = document.createElement("section");
  document.body.replaceChildren(formRoot, modalRoot);
  const store = createStore(state);
  const dispatch = (action: Action): void => {
    store.dispatch(action);
    renderForm(formRoot, store.getState());
    renderFileBrowserModal(modalRoot, store.getState());
  };
  renderForm(formRoot, store.getState());
  renderFileBrowserModal(modalRoot, store.getState());
  const off = attachFileBrowserEvents({ formRoot, modalRoot, dispatch, getState: store.getState });
  return { formRoot, modalRoot, store, off };
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
    const { formRoot, store } = mount(fixtureState());
    const expected = buildWorkspaceJson(store.getState().workspace);

    formRoot.querySelector<HTMLButtonElement>('button[data-action="file-browser-save"]')?.click();
    await flush();

    const body = postedJson(fetch, 0);
    expect(body.updateCurrent).toBe(true);
    expect(stringifyWorkspaceJson(body.workspaceJson as Record<string, unknown>)).toBe(stringifyWorkspaceJson(expected));
    expect(store.getState().workspace.currentPath).toBe("D:\\quailbot\\workspaces\\active.json");
  });

  it("Export posts updateCurrent false and does not update currentPath on success", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, resolved: "D:\\quailbot\\workspaces", entries: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, path: "D:\\quailbot\\workspaces\\exported.json", hash: "abcd1234abcd1234" })));
    vi.stubGlobal("fetch", fetch);
    const { formRoot, modalRoot, store } = mount(fixtureState());
    const before = store.getState().workspace.currentPath;

    formRoot.querySelector<HTMLButtonElement>('button[data-action="file-browser-export"]')?.click();
    await flush();
    const input = modalRoot.querySelector<HTMLInputElement>('input[data-file-browser-filename="true"]');
    if (!input) throw new Error("missing export filename input");
    input.value = "exported.json";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    modalRoot.querySelector<HTMLButtonElement>('button[data-action="file-browser-save"]')?.click();
    await flush();

    const body = postedJson(fetch, 1);
    expect(body.path).toBe("D:\\quailbot\\workspaces\\exported.json");
    expect(body.updateCurrent).toBe(false);
    expect(store.getState().workspace.currentPath).toBe(before);
  });
});
