import { describe, expect, it } from "vitest";

import { fixtureState, mountForm, select } from "./form-test-helpers.js";

describe("right-panel multi-select group editing", () => {
  it("shows common and mixed groups with only the group combobox enabled", () => {
    const common = fixtureState();
    common.tree.selected = [
      { kind: "roi", name: "roi-2" },
      { kind: "anchor", name: "anchor-1" },
    ];
    const mountedCommon = mountForm(common);
    expect(mountedCommon.root.querySelector(".form-header")?.textContent).toContain("Multiple items (2)");
    expect(select(mountedCommon.root).value).toBe("A");
    expect([...mountedCommon.root.querySelectorAll("input, textarea")]).toHaveLength(0);

    const mixed = fixtureState();
    mixed.tree.selected = [
      { kind: "roi", name: "roi-1" },
      { kind: "anchor", name: "anchor-1" },
    ];
    const mountedMixed = mountForm(mixed);
    expect(select(mountedMixed.root).value).toBe("(mixed)");
  });

  it("applies group changes to every selected item", () => {
    const state = fixtureState();
    state.tree.selected = [
      { kind: "roi", name: "roi-1" },
      { kind: "anchor", name: "anchor-1" },
      { kind: "cli", name: "bias" },
    ];
    const { root, store } = mountForm(state);

    const groupSelect = select(root);
    groupSelect.value = "C";
    groupSelect.dispatchEvent(new Event("change", { bubbles: true }));

    expect(store.getState().workspace.rois.find((roi) => roi.name === "roi-1")?.group).toBe("C");
    expect(store.getState().workspace.anchors.find((anchor) => anchor.name === "anchor-1")?.group).toBe("C");
    expect(store.getState().workspace.cliParams.find((cli) => cli.name === "bias")?.group).toBe("C");
  });

  it("rejects multi-select group reparenting when any selected group would cycle", () => {
    const state = fixtureState();
    state.tree.selected = [
      { kind: "group", name: "A" },
      { kind: "roi", name: "roi-1" },
    ];
    const { root, store } = mountForm(state);

    const groupSelect = select(root);
    groupSelect.value = "B";
    groupSelect.dispatchEvent(new Event("change", { bubbles: true }));

    expect(store.getState().workspace.groups.find((group) => group.name === "A")?.group).toBe("");
    expect(store.getState().workspace.rois.find((roi) => roi.name === "roi-1")?.group).toBe("");
    expect(store.getState().form.lastCycleRejection).toEqual({ selectedGroup: "A", attemptedParent: "B" });
  });
});
