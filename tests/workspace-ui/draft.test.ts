import { describe, expect, it } from "vitest";

import * as draftApi from "../../src/workspace-ui/draft.js";
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

  it("preserves GUI-only non-visual fields while canonicalizing visual arrays to top-level fields", () => {
    const draft = createWorkspaceDraft({
      GUI: {
        cli_params: { cli_name: "gui-cli", vendor_cli: "keep" },
        tools: { vendor_tool: true },
        vendor_gui_extension: { mode: "legacy" },
        groups: [{ name: "spectroscopy" }],
        rois: [{ name: "old-roi" }],
        anchors: [{ name: "old-anchor" }],
      },
    });

    const saved = serialize(draft);

    expect(saved.GUI).toBeUndefined();
    expect(saved.cli_params).toMatchObject({ cli_name: "gui-cli", vendor_cli: "keep" });
    expect(saved.tools).toMatchObject({ vendor_tool: true });
    expect(saved.vendor_gui_extension).toMatchObject({ mode: "legacy" });
    expect(saved.groups?.map((group) => group.name)).toEqual(["spectroscopy"]);
    expect(saved.rois?.map((roi) => roi.name)).toEqual(["old-roi"]);
    expect(saved.anchors?.map((anchor) => anchor.name)).toEqual(["old-anchor"]);
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

  it("serializes nested group parents with Tk-compatible group field instead of parent", () => {
    const draft = createWorkspaceDraft({ groups: [{ name: "root" }] });

    addGroup(draft, { name: "child", parent: "root", active: true });
    const saved = serialize(draft);

    expect(saved.groups?.find((group) => group.name === "child")).toMatchObject({ name: "child", group: "root" });
    expect(saved.groups?.find((group) => group.name === "child")).not.toHaveProperty("parent");
  });

  it("rejects empty and blank names for added visual records", () => {
    const draft = createWorkspaceDraft({});

    expect(() => addGroup(draft, { name: "" })).toThrow(/name/);
    expect(() => addRoi(draft, { name: " " })).toThrow(/name/);
    expect(() => addAnchor(draft, { name: "\t" })).toThrow(/name/);
  });

  it("rejects non-positive ROI dimensions on add", () => {
    const draft = createWorkspaceDraft({});

    expect(() => addRoi(draft, { name: "zero-width", w: 0, h: 1 })).toThrow(
      "ROI width and height must be positive",
    );
    expect(() => addRoi(draft, { name: "negative-height", w: 1, h: -1 })).toThrow(
      "ROI width and height must be positive",
    );
  });

  it("cascades inactive state from a group to descendant groups, ROIs, anchors, and CLI entries", () => {
    const draft = createWorkspaceDraft({
      groups: [
        { name: "spectroscopy", active: true },
        { name: "child", group: "spectroscopy", active: true },
      ],
      rois: [{ name: "old-roi", group: "child", active: true, vendor_note: "keep-me", x: 10, y: 20, w: 100, h: 80 }],
      anchors: [{ name: "old-anchor", group: "child", active: true, x: 50, y: 60 }],
      cli_params: {
        cli_name: "nqctl",
        enabled: true,
        parameters: { items: [{ name: "bias_v", group: "child", enabled: true }] },
        action_commands: { items: [{ name: "Approach", group: "child", enabled: true, action_cmd: { command: "approach" } }] },
      },
    });

    setGroupActive(draft, "spectroscopy", false);
    const saved = serialize(draft);

    expect(saved.rois?.[0]).toMatchObject({ name: "old-roi", vendor_note: "keep-me", x: 10, y: 20, w: 100, h: 80 });
    expect(saved.groups?.map((group) => [group.name, group.active])).toEqual([["spectroscopy", false], ["child", false]]);
    expect(saved.rois?.[0]).toMatchObject({ active: false });
    expect(saved.anchors?.[0]).toMatchObject({ active: false });
    const cliParams = saved.cli_params as { parameters: { items: JsonRecord[] }; action_commands: { items: JsonRecord[] } };
    expect(cliParams.parameters.items[0]).toMatchObject({ enabled: false });
    expect(cliParams.action_commands.items[0]).toMatchObject({ enabled: false });
  });

  it("forces active ROIs linked by active anchors before serialization", () => {
    const draft = createWorkspaceDraft({
      rois: [{ name: "target", active: false, x: 1, y: 2, w: 3, h: 4 }],
      anchors: [{ name: "click", active: true, x: 5, y: 6, linked_ROIs: ["target"] }],
    });

    const saved = serialize(draft);

    expect(saved.rois?.[0]).toMatchObject({ name: "target", active: true });
  });

  it("treats Tk linked_observables as ROI links and saves both link fields", () => {
    const draft = createWorkspaceDraft({
      rois: [{ name: "target", active: false, x: 1, y: 2, w: 3, h: 4 }],
      anchors: [{ name: "click", active: true, x: 5, y: 6, linked_observables: ["target"] }],
    });

    const saved = serialize(draft);

    expect(saved.rois?.[0]).toMatchObject({ name: "target", active: true });
    expect(saved.anchors?.[0]?.linked_ROIs).toEqual(["target"]);
    expect(saved.anchors?.[0]?.linked_observables).toEqual(["target"]);
  });

  it("refreshes CLI section counts from item lengths while preserving section metadata", () => {
    const draft = createWorkspaceDraft({
      cli_params: {
        cli_name: "nqctl",
        parameters: { count: 99, vendor: "keep", items: [{ name: "bias_v" }] },
        action_commands: { count: 99, vendor: "keep-actions", items: [] },
      },
    });

    const saved = serialize(draft);
    const cliParams = saved.cli_params as { parameters: JsonRecord; action_commands: JsonRecord };

    expect(cliParams.parameters).toMatchObject({ count: 1, vendor: "keep" });
    expect(cliParams.action_commands).toMatchObject({ count: 0, vendor: "keep-actions" });
  });

  it("normalizes Tk dict-shaped cli_params entries into saved item arrays", () => {
    const draft = createWorkspaceDraft({
      cli_params: {
        cli_name: "nqctl",
        enabled: false,
        parameters: {
          vendor: "keep-parameter-metadata",
          bias: { description: "Bias", readable: true, linked_observables: ["current"] },
          Sweep: { action_cmd: { command: "Sweep" }, linked_ROIs: ["spectrum"] },
        },
        action_commands: {
          vendor: "keep-action-metadata",
          Approach: { action_cmd: { command: "Approach" } },
        },
        actions: {
          Stop: { action_cmd: { command: "Stop" }, enabled: true },
        },
      },
    });

    const saved = serialize(draft);
    const cliParams = saved.cli_params as { enabled: boolean; parameters: JsonRecord; action_commands: JsonRecord };

    expect(cliParams).toMatchObject({ cli_name: "nqctl", enabled: false });
    expect(cliParams.parameters).toMatchObject({ count: 1, vendor: "keep-parameter-metadata" });
    expect((cliParams.parameters.items as JsonRecord[]).map((item) => item.name)).toEqual(["bias"]);
    expect(cliParams.action_commands).toMatchObject({ count: 3, vendor: "keep-action-metadata" });
    expect((cliParams.action_commands.items as JsonRecord[]).map((item) => item.name)).toEqual(["Sweep", "Approach", "Stop"]);
    expect((cliParams.action_commands.items as JsonRecord[]).find((item) => item.name === "Sweep")).toMatchObject({
      linked_ROIs: ["spectrum"],
    });
  });

  it("promotes legacy tools.cli drafts into Tk cli_params output when cli_params is absent", () => {
    const draft = createWorkspaceDraft({
      tools: {
        cli: {
          enabled: true,
          cli_name: "legacyctl",
          parameters: {
            bias: { description: "Bias", enabled: false, actions: { get: true, set: false, ramp: false } },
          },
          actions: {
            Approach: { action_cmd: { command: "Approach" }, linked_observables: ["current"] },
          },
        },
      },
    });

    const saved = serialize(draft);
    const cliParams = saved.cli_params as { parameters: { items: JsonRecord[] }; action_commands: { items: JsonRecord[] } };

    expect(cliParams).toMatchObject({ cli_name: "legacyctl", enabled: true });
    expect(cliParams.parameters.items[0]).toMatchObject({ name: "bias", enabled: false, description: "Bias" });
    expect(cliParams.action_commands.items[0]).toMatchObject({
      name: "Approach",
      action_cmd: { command: "Approach" },
      linked_observables: ["current"],
    });
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

  it("deletes items with Tk cleanup semantics for links and removed group parents", () => {
    const deleteVisualItem = (draftApi as unknown as {
      deleteVisualItem?: (draft: ReturnType<typeof createWorkspaceDraft>, item: { kind: string; name: string }) => void;
    }).deleteVisualItem;
    expect(typeof deleteVisualItem).toBe("function");
    if (!deleteVisualItem) return;

    const draft = createWorkspaceDraft({
      groups: [
        { name: "root" },
        { name: "child", group: "root" },
        { name: "grandchild", group: "child" },
      ],
      rois: [
        { name: "target", group: "child", active: true, x: 1, y: 2, w: 3, h: 4 },
        { name: "other", group: "child", active: true, x: 5, y: 6, w: 7, h: 8 },
      ],
      anchors: [{ name: "click", group: "grandchild", active: true, linked_ROIs: ["target", "other"], x: 9, y: 10 }],
      cli_params: {
        parameters: { items: [{ name: "bias_v", group: "child", enabled: true }] },
        action_commands: { items: [{ name: "Approach", group: "child", enabled: true }] },
      },
    });

    deleteVisualItem(draft, { kind: "roi", name: "target" });
    deleteVisualItem(draft, { kind: "group", name: "child" });
    const saved = serialize(draft);

    expect(saved.rois?.map((roi) => roi.name)).toEqual(["other"]);
    expect(saved.anchors?.[0]?.linked_ROIs).toEqual(["other"]);
    expect(saved.anchors?.[0]?.linked_observables).toEqual(["other"]);
    expect(saved.groups?.find((group) => group.name === "grandchild")).toMatchObject({ group: "root" });
    expect(saved.rois?.find((roi) => roi.name === "other")).toMatchObject({ group: "root" });
    const cliParams = saved.cli_params as { parameters: { items: JsonRecord[] }; action_commands: { items: JsonRecord[] } };
    expect(cliParams.parameters.items[0]).toMatchObject({ group: "root" });
    expect(cliParams.action_commands.items[0]).toMatchObject({ group: "root" });
  });
});
