import { describe, expect, it } from "vitest";

import { attachFilterEvents } from "../../../src/workspace-ui/client/events/filter.js";
import { renderFilter } from "../../../src/workspace-ui/client/render/filter.js";
import { createStore } from "../../../src/workspace-ui/client/store.js";
import { filterTerms } from "../../../src/workspace-ui/shared/filter.js";
import { initialState, type AppState } from "../../../src/workspace-ui/client/state.js";

function fixtureState(): AppState {
  return {
    ...initialState(),
    workspace: {
      ...initialState().workspace,
      rois: [{ name: "roi-a", x: 0, y: 0, w: 1, h: 1, description: "alpha", tags: "Alpha", active: true, group: "" }],
    },
  };
}

function mount(state = fixtureState()) {
  const root = document.createElement("div");
  const store = createStore(state);
  store.subscribe(() => renderFilter(root, store.getState()));
  renderFilter(root, store.getState());
  const off = attachFilterEvents(root, store.dispatch);
  return { root, store, off };
}

function pointerClick(el: HTMLElement): boolean {
  el.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, button: 0, cancelable: true }));
  return el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

function pointerClickCheckbox(el: HTMLInputElement): void {
  const checkedBefore = el.checked;
  if (!pointerClick(el)) return;
  if (el.checked === checkedBefore) {
    el.checked = !checkedBefore;
  }
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("filter panel events", () => {
  it("dispatches tag checkbox changes through the reducer to add and remove lowercase selected tags", () => {
    const { root, store, off } = mount();
    const checkbox = root.querySelector<HTMLInputElement>('input[data-action="toggle-tag"][data-tag="Alpha"]');
    expect(checkbox).not.toBeNull();

    checkbox!.checked = true;
    checkbox?.dispatchEvent(new Event("change", { bubbles: true }));
    expect(store.getState().filter.selectedTags).toEqual(["alpha"]);

    const nextCheckbox = root.querySelector<HTMLInputElement>('input[data-action="toggle-tag"][data-tag="Alpha"]');
    nextCheckbox!.checked = false;
    nextCheckbox?.dispatchEvent(new Event("change", { bubbles: true }));
    expect(store.getState().filter.selectedTags).toEqual([]);
    off();
  });

  it("keeps native checkbox clicks working after pointer activation", () => {
    const { root, store, off } = mount();
    const checkbox = root.querySelector<HTMLInputElement>('input[data-action="toggle-tag"][data-tag="Alpha"]');
    expect(checkbox).not.toBeNull();

    pointerClickCheckbox(checkbox!);

    expect(store.getState().filter.selectedTags).toEqual(["alpha"]);
    expect(root.querySelector<HTMLInputElement>('input[data-action="toggle-tag"][data-tag="Alpha"]')?.checked).toBe(true);
    off();
  });

  it("stores raw keyword text and derives shared filter terms on input", () => {
    const { root, store } = mount();
    const input = root.querySelector<HTMLInputElement>(".filter-keyword");
    expect(input).not.toBeNull();

    input!.value = "Alpha,  linked ROI";
    input?.dispatchEvent(new Event("input", { bubbles: true }));

    expect(store.getState().filter.keywordRaw).toBe("Alpha,  linked ROI");
    expect(store.getState().filter.terms).toEqual(filterTerms("Alpha,  linked ROI"));
  });

  it("toggles AND/OR logic", () => {
    const { root, store } = mount();

    root.querySelector<HTMLButtonElement>('.filter-logic-toggle[data-action="toggle-logic"]')?.click();
    expect(store.getState().filter.logic).toBe("OR");
    root.querySelector<HTMLButtonElement>('.filter-logic-toggle[data-action="toggle-logic"]')?.click();
    expect(store.getState().filter.logic).toBe("AND");
  });

  it("does not double-toggle AND/OR when pointerup is followed by click", () => {
    const { root, store } = mount();
    const logic = root.querySelector<HTMLButtonElement>('.filter-logic-toggle[data-action="toggle-logic"]');
    expect(logic).not.toBeNull();

    pointerClick(logic!);

    expect(store.getState().filter.logic).toBe("OR");
  });

  it("clears selected tags and keyword state while preserving current logic", () => {
    const state = fixtureState();
    state.filter = { selectedTags: ["alpha"], keywordRaw: "Alpha", terms: ["alpha"], logic: "OR" };
    const { root, store } = mount(state);

    root.querySelector<HTMLButtonElement>('.filter-clear[data-action="filter-clear"]')?.click();

    expect(store.getState().filter).toEqual({ selectedTags: [], keywordRaw: "", terms: [], logic: "OR" });
  });
});
