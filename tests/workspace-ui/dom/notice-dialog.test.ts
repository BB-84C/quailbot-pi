import { describe, expect, it } from "vitest";

import { noticeOpen, type Action } from "../../../src/workspace-ui/client/actions.js";
import { attachNoticeDialogEvents } from "../../../src/workspace-ui/client/events/notice-dialog.js";
import { renderNoticeDialog } from "../../../src/workspace-ui/client/render/notice-dialog.js";
import { createStore } from "../../../src/workspace-ui/client/store.js";
import { initialState } from "../../../src/workspace-ui/client/state.js";

function mount() {
  const root = document.createElement("section");
  document.body.replaceChildren(root);
  const store = createStore(initialState());
  const dispatch = (action: Action): void => {
    store.dispatch(action);
    renderNoticeDialog(root, store.getState());
  };
  renderNoticeDialog(root, store.getState());
  const off = attachNoticeDialogEvents({ root, dispatch, getState: store.getState });
  return { root, store, dispatch, off };
}

describe("notice dialog", () => {
  it("renders a DOM-readable alertdialog and closes through OK", () => {
    const { root, store, dispatch, off } = mount();

    dispatch(noticeOpen("Saved to D:\\quailbot\\workspace.json"));

    expect(root.querySelector(".notice-dialog")?.getAttribute("role")).toBe("alertdialog");
    expect(root.querySelector(".notice-dialog")?.getAttribute("aria-modal")).toBe("true");
    expect(root.querySelector(".notice-dialog-message")?.textContent).toBe("Saved to D:\\quailbot\\workspace.json");
    expect(document.activeElement).toBe(root.querySelector('button[data-action="notice-close"]'));

    root.querySelector<HTMLButtonElement>('button[data-action="notice-close"]')?.click();

    expect(store.getState().noticeDialog.open).toBe(false);
    expect(root.querySelector(".notice-dialog")).toBeNull();
    off();
  });

  it("closes through Escape without native browser dialog handling", () => {
    const { root, store, dispatch, off } = mount();
    dispatch(noticeOpen("Import cancelled. Existing workspace entries were left unchanged."));

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(store.getState().noticeDialog.open).toBe(false);
    expect(root.querySelector(".notice-dialog")).toBeNull();
    off();
  });
});
