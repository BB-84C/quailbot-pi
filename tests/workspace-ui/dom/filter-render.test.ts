import { describe, expect, it } from "vitest";

import { renderFilter } from "../../../src/workspace-ui/client/render/filter.js";
import { collectTagCounts } from "../../../src/workspace-ui/shared/filter.js";
import { initialState, type AppState } from "../../../src/workspace-ui/client/state.js";

function fixtureState(): AppState {
  return {
    ...initialState(),
    workspace: {
      cliName: "nqctl",
      cliEnabled: true,
      groups: [{ name: "grp", description: "group", tags: "common, beta", active: true, group: "", collapsed: false }],
      rois: [
        { name: "roi-a", x: 0, y: 0, w: 1, h: 1, description: "alpha roi", tags: "common, alpha", active: true, group: "grp" },
        { name: "roi-b", x: 0, y: 0, w: 1, h: 1, description: "gamma roi", tags: "common, Gamma", active: true, group: "" },
      ],
      anchors: [{ name: "anchor-a", x: 0, y: 0, description: "anchor", tags: "beta", linked_rois: ["roi-a"], active: true, group: "" }],
      cliParams: [
        { cli_name: "nqctl", name: "bias", label: "Bias", description: "bias", tags: "alpha", enabled: true, group: "", allow_get: true, allow_set: true, allow_ramp: false, readable: true, writable: true, has_ramp: false, safety: null, get_cmd: {}, set_cmd: {}, safety_mode: "guarded", action_cmd: null, linked_observables: [], raw_item: {} },
      ],
    },
    filter: {
      selectedTags: ["gamma"],
      keywordRaw: "roi, linked",
      terms: ["roi", "linked"],
      logic: "AND",
    },
  };
}

describe("filter panel render", () => {
  it("renders tags in shared count order with raw labels and selected checkboxes", () => {
    const root = document.createElement("div");
    const state = fixtureState();

    renderFilter(root, state);
    const firstMarkup = root.innerHTML;
    renderFilter(root, state);

    expect(root.innerHTML).toBe(firstMarkup);
    expect([...root.querySelectorAll<HTMLInputElement>('input[data-action="toggle-tag"]')].map((input) => input.dataset.tag)).toEqual(
      collectTagCounts(state.workspace).map((entry) => entry.tag),
    );
    expect([...root.querySelectorAll<HTMLLabelElement>(".filter-tag")].map((label) => label.textContent?.trim())).toEqual(
      collectTagCounts(state.workspace).map((entry) => entry.tag),
    );
    for (const label of root.querySelectorAll<HTMLLabelElement>(".filter-tag")) {
      expect(label.textContent).not.toMatch(/\(\d+\)/);
    }
    expect(root.querySelector<HTMLInputElement>('input[data-tag="Gamma"]')?.checked).toBe(true);
  });

  it("renders empty tag state, keywordRaw, and default AND logic", () => {
    const root = document.createElement("div");
    const state = initialState();
    state.filter.keywordRaw = "anchor, roi";

    renderFilter(root, state);

    expect(root.querySelector(".filter-empty")?.textContent).toBe("(no tags)");
    expect(root.querySelector<HTMLInputElement>(".filter-keyword")?.value).toBe("anchor, roi");
    expect(root.querySelector<HTMLButtonElement>(".filter-logic-toggle")?.textContent).toBe("AND");
  });

  it("does not rewrite an unchanged focused keyword input value", () => {
    const root = document.createElement("div");
    const state = fixtureState();
    renderFilter(root, state);
    const input = root.querySelector<HTMLInputElement>(".filter-keyword");
    expect(input).not.toBeNull();
    input?.focus();
    input?.setSelectionRange(2, 2);

    renderFilter(root, state);

    expect(root.querySelector<HTMLInputElement>(".filter-keyword")?.selectionStart).toBe(2);
  });
});
