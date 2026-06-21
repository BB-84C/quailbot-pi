import { describe, expect, it, vi } from "vitest";

import { formSelectionChanged, type Action } from "../../../src/workspace-ui/client/actions.js";
import { attachToolbarEvents } from "../../../src/workspace-ui/client/events/toolbar.js";
import { renderToolbar } from "../../../src/workspace-ui/client/render/toolbar.js";
import { selectionSummary } from "../../../src/workspace-ui/client/selectors/form.js";
import { createStore } from "../../../src/workspace-ui/client/store.js";
import type { AppState } from "../../../src/workspace-ui/client/state.js";
import { fixtureState } from "./form-test-helpers.js";

function mount(state: AppState = fixtureState()) {
  document.head.innerHTML = '<meta name="quailbot-workspace-ui-token" content="toolbar-token">';
  const root = document.createElement("section");
  const store = createStore(state);
  const dispatch = (action: Action): void => {
    store.dispatch(action);
    if (action.type.startsWith("TREE_")) {
      store.dispatch(formSelectionChanged(selectionSummary(store.getState())));
    }
    renderToolbar(root, store.getState());
  };
  renderToolbar(root, store.getState());
  const off = attachToolbarEvents({ root, dispatch, getState: store.getState });
  return { root, store, off };
}

function click(root: HTMLElement, label: string): void {
  const button = [...root.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === label);
  if (!button) throw new Error(`missing button ${label}`);
  button.click();
}

function pointerActivate(root: HTMLElement, label: string): HTMLButtonElement {
  const button = [...root.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === label);
  if (!button) throw new Error(`missing button ${label}`);
  button.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, button: 0 }));
  return button;
}

function pointerClickElement(el: HTMLElement): boolean {
  el.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, button: 0, cancelable: true }));
  return el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

function pointerClickCheckbox(el: HTMLInputElement): void {
  const checkedBefore = el.checked;
  if (!pointerClickElement(el)) return;
  if (el.checked === checkedBefore) {
    el.checked = !checkedBefore;
  }
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("workspace toolbar events", () => {
  it("clicking Add ROI dispatches the tree add action and appends/selects a deduped ROI", () => {
    const { root, store, off } = mount();
    const before = store.getState().workspace.rois.length;

    click(root, "Add ROI");

    expect(store.getState().workspace.rois).toHaveLength(before + 1);
    expect(store.getState().workspace.rois.at(-1)?.name).toBe("new_roi");
    expect(store.getState().tree.selected).toEqual([{ kind: "roi", name: "new_roi" }]);
    off();
  });

  it("enables Draw ROI box only when a single ROI is selected", () => {
    const state = fixtureState();
    state.tree.selected = [];
    const { root, store } = mount(state);

    expect([...root.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === "Draw ROI box")?.disabled).toBe(true);

    store.dispatch({ type: "TREE_CLICK_ITEM", payload: { kind: "roi", name: "roi-1", modifiers: { ctrl: false, shift: false }, region: "body" } });
    renderToolbar(root, store.getState());

    expect([...root.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === "Draw ROI box")?.disabled).toBe(false);
  });

  it("Refresh screenshot posts capture and dispatches CANVAS_FRAME_LOADED", async () => {
    const frame = { imageWidth: 10, imageHeight: 20, originX: -1, originY: 2, captureId: "refresh" };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true, frame }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { root, store } = mount();

    click(root, "Refresh screenshot");
    await vi.waitFor(() => expect(store.getState().canvas.frame).toEqual(frame));

    expect(fetchMock).toHaveBeenCalledWith("/api/capture", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "x-quailbot-workspace-ui-token": "toolbar-token" }) }));
    vi.unstubAllGlobals();
  });

  it("Refresh screenshot surfaces capture failures as a short user-facing status", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: "Screen capture unavailable. Check desktop capture permissions and try Refresh screenshot again." }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { root, store } = mount();

    click(root, "Refresh screenshot");
    await vi.waitFor(() => expect(store.getState().startup.error).toBe("Screen capture unavailable. Check desktop capture permissions and try Refresh screenshot again."));

    expect(store.getState().startup.error).not.toContain("EncodedCommand");
    vi.unstubAllGlobals();
  });

  it("Delete confirms and deletes a multi-select through shared deleteItems semantics", () => {
    const state = fixtureState();
    state.tree.selected = [{ kind: "roi", name: "roi-1" }, { kind: "anchor", name: "anchor-1" }];
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { root, store } = mount(state);

    click(root, "Delete");

    expect(confirm).toHaveBeenCalledWith("Delete 2 selected items?");
    expect(store.getState().workspace.rois.map((item) => item.name)).toEqual(["roi-2"]);
    expect(store.getState().workspace.anchors).toHaveLength(0);
    expect(store.getState().tree.selected).toEqual([]);
    confirm.mockRestore();
  });

  it("Delete uses the Tk single-item prompt and leaves state untouched when cancelled", () => {
    const state = fixtureState();
    state.tree.selected = [{ kind: "roi", name: "roi-1" }];
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { root, store } = mount(state);

    click(root, "Delete");

    expect(confirm).toHaveBeenCalledWith("Delete selected item?");
    expect(store.getState().workspace.rois.map((item) => item.name)).toEqual(["roi-1", "roi-2"]);
    expect(store.getState().tree.selected).toEqual([{ kind: "roi", name: "roi-1" }]);
    confirm.mockRestore();
  });

  it("Delete clears collapsed state for deleted groups like Tk object deletion", () => {
    const state = fixtureState();
    state.tree.selected = [{ kind: "group", name: "A" }];
    state.tree.collapsedGroups = new Set(["A", "B"]);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { root, store } = mount(state);

    click(root, "Delete");

    expect(confirm).toHaveBeenCalledWith("Delete selected item?");
    expect(store.getState().workspace.groups.map((item) => item.name)).toEqual(["B", "C"]);
    expect([...store.getState().tree.collapsedGroups]).toEqual(["B"]);
    confirm.mockRestore();
  });

  it("clicking Add Anchor appends and selects a deduped anchor", () => {
    const { root, store, off } = mount();
    const before = store.getState().workspace.anchors.length;

    click(root, "Add Anchor");

    expect(store.getState().workspace.anchors).toHaveLength(before + 1);
    expect(store.getState().workspace.anchors.at(-1)?.name).toBe("new_anchor");
    expect(store.getState().tree.selected).toEqual([{ kind: "anchor", name: "new_anchor" }]);
    off();
  });

  it("handles pointer activation without duplicating the following click", () => {
    const { root, store } = mount();
    const before = store.getState().workspace.rois.length;

    const button = pointerActivate(root, "Add ROI");
    button.click();

    expect(store.getState().workspace.rois).toHaveLength(before + 1);
    expect(store.getState().workspace.rois.at(-1)?.name).toBe("new_roi");
  });

  it("clicking Add Group appends and selects a deduped group", () => {
    const { root, store, off } = mount();
    const before = store.getState().workspace.groups.length;

    click(root, "Add Group");

    expect(store.getState().workspace.groups).toHaveLength(before + 1);
    expect(store.getState().workspace.groups.at(-1)?.name).toBe("new_group");
    expect(store.getState().tree.selected).toEqual([{ kind: "group", name: "new_group" }]);
    off();
  });

  it("Draw ROI box dispatches CANVAS_BEGIN_DRAW_ROI when a single ROI is selected", () => {
    const state = fixtureState();
    state.tree.selected = [{ kind: "roi", name: "roi-1" }];
    state.canvas.frame = { imageWidth: 100, imageHeight: 100, originX: 0, originY: 0, captureId: "x" };
    const { root, store, off } = mount(state);

    click(root, "Draw ROI box");

    expect(store.getState().canvas.mode).toBe("draw_roi");
    expect(store.getState().canvas.drawingItemName).toBe("roi-1");
    off();
  });

  it("Pick anchor point dispatches CANVAS_BEGIN_PICK_ANCHOR when a single Anchor is selected", () => {
    const state = fixtureState();
    state.tree.selected = [{ kind: "anchor", name: "anchor-1" }];
    state.canvas.frame = { imageWidth: 100, imageHeight: 100, originX: 0, originY: 0, captureId: "x" };
    const { root, store, off } = mount(state);

    click(root, "Pick anchor point");

    expect(store.getState().canvas.mode).toBe("pick_anchor");
    expect(store.getState().canvas.drawingItemName).toBe("anchor-1");
    off();
  });

  it("Pick anchor point is disabled when no single Anchor is selected", () => {
    const state = fixtureState();
    state.tree.selected = [];
    const { root } = mount(state);

    const button = [...root.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === "Pick anchor point");
    expect(button?.disabled).toBe(true);
  });

  it("renders Tk-style workspace controls and toggles CLI tools enabled", () => {
    const state = fixtureState();
    state.workspace.cliEnabled = false;
    state.workspace.currentPath = "D:\\quailbot\\workspaces\\active.json";
    const { root, store } = mount(state);

    expect([...root.querySelectorAll<HTMLButtonElement>("button")].map((button) => button.textContent)).toEqual(
      expect.arrayContaining(["Add ROI", "Add Anchor", "Add Group", "Load Param From CLI", "Delete", "Save", "Draw ROI box", "Pick anchor point", "Refresh screenshot"]),
    );
    expect([...root.querySelectorAll<HTMLButtonElement>("button")].map((button) => button.textContent)).not.toEqual(expect.arrayContaining(["Load workspace...", "Export..."]));
    const cliEnabled = root.querySelector<HTMLInputElement>('input[data-action="cli-tools-enabled"]');
    expect(cliEnabled?.checked).toBe(false);

    if (!cliEnabled) throw new Error("missing CLI tools enabled checkbox");
    pointerClickCheckbox(cliEnabled);

    expect(store.getState().workspace.cliEnabled).toBe(true);
  });
});
