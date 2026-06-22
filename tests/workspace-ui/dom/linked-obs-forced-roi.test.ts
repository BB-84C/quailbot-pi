import { describe, expect, it } from "vitest";

import { linkedAdd, linkedPickerChanged } from "../../../src/workspace-ui/client/actions.js";
import { renderItemsTree } from "../../../src/workspace-ui/client/render/items-tree.js";
import { selectedState, mountForm } from "./form-test-helpers.js";

describe("linked observables forced ROI readback", () => {
  it("re-derives the forced ROI tree flag after adding a link to an active anchor", () => {
    const state = selectedState("anchor", "anchor-1");
    state.workspace.rois[1]!.active = false;
    state.workspace.anchors[0]!.active = true;
    const { store, dispatch } = mountForm(state);

    dispatch(linkedPickerChanged("roi-2"));
    dispatch(linkedAdd());

    const treeRoot = document.createElement("div");
    renderItemsTree(treeRoot, store.getState());
    const linkedRoi = treeRoot.querySelector<HTMLElement>('[data-kind="roi"][data-name="roi-2"]');
    expect(linkedRoi?.classList.contains("tree-row--forced-active")).toBe(true);
    expect(linkedRoi?.querySelector<HTMLButtonElement>(".tree-toggle")?.disabled).toBe(true);
  });

  it("re-derives the forced ROI tree flag after adding a ROI link to an active mutating CLI parameter", () => {
    const state = selectedState("cli", "bias");
    state.workspace.rois[1]!.active = false;
    state.workspace.cliParams[0]!.enabled = true;
    const { store, dispatch } = mountForm(state);

    dispatch(linkedPickerChanged("roi-2"));
    dispatch(linkedAdd());

    const treeRoot = document.createElement("div");
    renderItemsTree(treeRoot, store.getState());
    const linkedRoi = treeRoot.querySelector<HTMLElement>('[data-kind="roi"][data-name="roi-2"]');
    expect(linkedRoi?.classList.contains("tree-row--forced-active")).toBe(true);
    expect(linkedRoi?.querySelector<HTMLButtonElement>(".tree-toggle")?.disabled).toBe(true);
  });
});
