import { describe, expect, it } from "vitest";

import { renderedTreeRows } from "../../../src/workspace-ui/client/reducers/tree.js";
import { blur, input, mountForm, selectedState, typeInto } from "./form-test-helpers.js";

describe("right-panel form field editing", () => {
  it("keeps buffers and draft live while typing valid ROI text", () => {
    const { root, store } = mountForm(selectedState("roi", "roi-1"));
    const name = input(root, "name");

    typeInto(name, "roi-renamed");
    expect(store.getState().form.buffers.name).toBe("roi-renamed");
    expect(input(root, "name").value).toBe("roi-renamed");
    expect(store.getState().workspace.rois[0]?.name).toBe("roi-renamed");

    blur(input(root, "name"));
    expect(store.getState().workspace.rois[0]?.name).toBe("roi-renamed");
  });

  it("keeps prior draft values for blank name, invalid integers, and non-positive ROI dimensions", () => {
    const { root, store } = mountForm(selectedState("roi", "roi-1"));

    typeInto(input(root, "name"), "   ");
    blur(input(root, "name"));
    expect(store.getState().workspace.rois[0]?.name).toBe("roi-1");

    typeInto(input(root, "x"), "not-int");
    blur(input(root, "x"));
    expect(store.getState().workspace.rois[0]?.x).toBe(1);

    typeInto(input(root, "w"), "0");
    blur(input(root, "w"));
    expect(store.getState().workspace.rois[0]?.w).toBe(30);

    typeInto(input(root, "h"), "-9");
    blur(input(root, "h"));
    expect(store.getState().workspace.rois[0]?.h).toBe(40);
  });

  it("keeps Tk group collapsed state attached to the group object across rename", () => {
    const state = selectedState("group", "A");
    state.tree.collapsedGroups = new Set(["A"]);
    const { root, store } = mountForm(state);

    typeInto(input(root, "name"), "Renamed");

    expect(store.getState().workspace.groups[0]?.name).toBe("Renamed");
    expect(store.getState().workspace.groups[1]?.group).toBe("Renamed");
    expect([...store.getState().tree.collapsedGroups]).toEqual(["Renamed"]);
    expect(renderedTreeRows(store.getState()).map((row) => `${row.kind}:${row.name}`)).not.toContain("group:B");
  });
});
