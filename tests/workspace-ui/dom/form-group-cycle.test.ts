import { describe, expect, it } from "vitest";

import { mountForm, select, selectedState } from "./form-test-helpers.js";

describe("right-panel group cycle rejection", () => {
  it("rejects a selected group parent edit that would create a cycle and renders a warning", () => {
    const { root, store } = mountForm(selectedState("group", "A"));
    const groupSelect = select(root);
    const staleDescendantOption = document.createElement("option");
    staleDescendantOption.value = "B";
    staleDescendantOption.textContent = "B";
    groupSelect.append(staleDescendantOption);

    groupSelect.value = "B";
    groupSelect.dispatchEvent(new Event("change", { bubbles: true }));

    expect(store.getState().workspace.groups.find((group) => group.name === "A")?.group).toBe("");
    expect(store.getState().form.lastCycleRejection).toEqual({ selectedGroup: "A", attemptedParent: "B" });
    expect(root.querySelector(".form-notice--warning")?.textContent).toContain("A group cannot be its own parent.");
  });
});
