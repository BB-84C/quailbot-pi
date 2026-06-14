import { describe, expect, it } from "vitest";

import {
  addAnchor,
  addGroup,
  addRoi,
  assignItemGroup,
  createWorkspaceDraft,
  serializeWorkspaceDraft,
  setGroupActive,
  updateAnchorGeometry,
  updateRoiGeometry,
} from "../../src/workspace-ui/draft.js";
import type { JsonRecord } from "../../src/workspace-ui/json.js";

type SerializedWorkspace = JsonRecord & { groups?: JsonRecord[]; rois?: JsonRecord[]; anchors?: JsonRecord[] };

function serialize(draft: ReturnType<typeof createWorkspaceDraft>): SerializedWorkspace {
  return serializeWorkspaceDraft(draft) as SerializedWorkspace;
}

describe("workspace draft editing", () => {
  it("preserves unknown fields while serializing GUI visual fields as canonical top-level fields", () => {
    const draft = createWorkspaceDraft({
      experiment: "surface-map",
      cli_params: { cli_name: "nqctl", vendor_cli: "keep" },
      GUI: {
        groups: [{ name: "spectroscopy", active: true, vendor_group: "keep" }],
        rois: [{ name: "old-roi", vendor_note: "keep-me", x: 1, y: 2, w: 3, h: 4 }],
        anchors: [{ name: "old-anchor", vendor_anchor: "keep", x: 5, y: 6 }],
      },
    });

    updateRoiGeometry(draft, "old-roi", { x: 10, y: 20, w: 100, h: 80 });
    updateAnchorGeometry(draft, "old-anchor", { x: 50, y: 60 });
    const saved = serialize(draft);

    expect(saved.GUI).toBeUndefined();
    expect(saved.experiment).toBe("surface-map");
    expect(saved.cli_params).toMatchObject({ cli_name: "nqctl", vendor_cli: "keep" });
    expect(saved.groups?.[0]).toMatchObject({ name: "spectroscopy", active: true, vendor_group: "keep" });
    expect(saved.rois?.[0]).toMatchObject({ name: "old-roi", vendor_note: "keep-me", x: 10, y: 20, w: 100, h: 80 });
    expect(saved.anchors?.[0]).toMatchObject({ x: 50, y: 60 });
  });

  it("adds groups, ROIs, and anchors while rejecting duplicate names across all visual item kinds", () => {
    const draft = createWorkspaceDraft({});

    addGroup(draft, { name: "spectroscopy", active: true });
    addRoi(draft, { name: "current", group: "spectroscopy", active: true, x: 1, y: 2, w: 3, h: 4 });
    addAnchor(draft, { name: "bias", group: "spectroscopy", active: true, x: 5, y: 6, linked_ROIs: ["current"] });

    expect(serialize(draft)).toMatchObject({
      groups: [{ name: "spectroscopy", active: true }],
      rois: [{ name: "current", group: "spectroscopy", active: true, x: 1, y: 2, w: 3, h: 4 }],
      anchors: [{ name: "bias", group: "spectroscopy", active: true, x: 5, y: 6, linked_ROIs: ["current"] }],
    });
    expect(() => addRoi(draft, { name: "bias" })).toThrow(/duplicate|name conflict/);
  });

  it("cascades inactive state from a group to descendant groups, ROIs, and anchors", () => {
    const draft = createWorkspaceDraft({
      groups: [
        { name: "spectroscopy", active: true },
        { name: "child", parent: "spectroscopy", active: true },
      ],
      rois: [{ name: "old-roi", group: "child", active: true, vendor_note: "keep-me", x: 10, y: 20, w: 100, h: 80 }],
      anchors: [{ name: "old-anchor", group: "child", active: true, x: 50, y: 60 }],
    });

    setGroupActive(draft, "spectroscopy", false);
    const saved = serialize(draft);

    expect(saved.rois?.[0]).toMatchObject({ name: "old-roi", vendor_note: "keep-me", x: 10, y: 20, w: 100, h: 80 });
    expect(saved.groups?.map((group) => [group.name, group.active])).toEqual([["spectroscopy", false], ["child", false]]);
    expect(saved.rois?.[0]).toMatchObject({ active: false });
    expect(saved.anchors?.[0]).toMatchObject({ active: false });
  });

  it("rejects group cycles when assigning group parents", () => {
    const draft = createWorkspaceDraft({
      groups: [
        { name: "a" },
        { name: "b", parent: "a" },
      ],
    });

    expect(() => assignItemGroup(draft, { kind: "group", name: "a" }, "b")).toThrow(/group cycle/);
  });

  it("edits ROI and anchor geometry and rejects non-positive ROI dimensions", () => {
    const draft = createWorkspaceDraft({
      rois: [{ name: "old-roi", x: 1, y: 2, w: 3, h: 4 }],
      anchors: [{ name: "old-anchor", x: 5, y: 6 }],
    });

    updateRoiGeometry(draft, "old-roi", { x: 10, y: 20, w: 100, h: 80 });
    updateAnchorGeometry(draft, "old-anchor", { x: 50, y: 60 });
    const saved = serialize(draft);

    expect(saved.rois?.[0]).toMatchObject({ x: 10, y: 20, w: 100, h: 80 });
    expect(saved.anchors?.[0]).toMatchObject({ x: 50, y: 60 });
    expect(() => updateRoiGeometry(draft, "old-roi", { x: 1, y: 2, w: 0, h: 1 })).toThrow(
      "ROI width and height must be positive",
    );
  });

  it("removes ROI and anchor group associations when assigned to undefined", () => {
    const draft = createWorkspaceDraft({
      groups: [{ name: "spectroscopy" }],
      rois: [{ name: "old-roi", group: "spectroscopy" }],
      anchors: [{ name: "old-anchor", group: "spectroscopy" }],
    });

    assignItemGroup(draft, { kind: "roi", name: "old-roi" }, undefined);
    assignItemGroup(draft, { kind: "anchor", name: "old-anchor" }, undefined);
    const saved = serialize(draft);

    expect(saved.rois?.[0]).not.toHaveProperty("group");
    expect(saved.rois?.[0]).not.toHaveProperty("parent");
    expect(saved.anchors?.[0]).not.toHaveProperty("group");
    expect(saved.anchors?.[0]).not.toHaveProperty("parent");
  });
});
