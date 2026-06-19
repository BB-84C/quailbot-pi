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

describe("filter panel events", () => {
  it("dispatches tag checkbox changes through the reducer to add and remove lowercase selected tags", () => {
    const { root, store, off } = mount();
    const checkbox = root.querySelector<HTMLInputElement>('input[data-action="toggle-tag"][data-tag="Alpha"]');
    expect(checkbox).not.toBeNull();

    checkbox?.dispatchEvent(new Event("change", { bubbles: true }));
    expect(store.getState().filter.selectedTags).toEqual(["alpha"]);

    root.querySelector<HTMLInputElement>('input[data-action="toggle-tag"][data-tag="Alpha"]')?.dispatchEvent(new Event("change", { bubbles: true }));
    expect(store.getState().filter.selectedTags).toEqual([]);
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

  it("clears selected tags and keyword state while preserving current logic", () => {
    const state = fixtureState();
    state.filter = { selectedTags: ["alpha"], keywordRaw: "Alpha", terms: ["alpha"], logic: "OR" };
    const { root, store } = mount(state);

    root.querySelector<HTMLButtonElement>('.filter-clear[data-action="filter-clear"]')?.click();

    expect(store.getState().filter).toEqual({ selectedTags: [], keywordRaw: "", terms: [], logic: "OR" });
  });
});
