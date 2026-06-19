import { describe, expect, it } from "vitest";

import type { AnchorDraft, CliParamDraft, GroupDraft, RoiDraft } from "../../../src/workspace-ui/shared/model.js";
import { validateAndNormalizeForSave } from "../../../src/workspace-ui/shared/validate.js";

function roi(overrides: Partial<RoiDraft>): RoiDraft {
  return { name: "roi", x: 0, y: 0, w: 1, h: 1, description: "", tags: "", active: true, group: "", ...overrides };
}

function anchor(overrides: Partial<AnchorDraft>): AnchorDraft {
  return { name: "anchor", x: 0, y: 0, description: "", tags: "", linked_rois: [], active: true, group: "", ...overrides };
}

function group(overrides: Partial<GroupDraft>): GroupDraft {
  return { name: "group", description: "", tags: "", active: true, group: "", collapsed: false, ...overrides };
}

function cli(overrides: Partial<CliParamDraft>): CliParamDraft {
  return {
    cli_name: "fixturectl",
    name: "param",
    label: "",
    description: "",
    tags: "",
    enabled: true,
    group: "",
    allow_get: false,
    allow_set: false,
    allow_ramp: false,
    readable: true,
    writable: true,
    has_ramp: false,
    safety: null,
    get_cmd: null,
    set_cmd: null,
    safety_mode: "guarded",
    action_cmd: null,
    linked_observables: [],
    raw_item: {},
    ...overrides,
  };
}

describe("workspace shared save validation", () => {
  it("applies forced ROI activation before validation", () => {
    const rois = [roi({ name: "linked", active: false })];
    const anchors = [anchor({ name: "a", active: true, linked_rois: ["linked"] })];

    const result = validateAndNormalizeForSave({ rois, anchors, groups: [], cliParams: [] });

    expect(result).toEqual({ ok: true });
    expect(rois[0].active).toBe(true);
  });

  it("reports duplicate names across kinds", () => {
    const result = validateAndNormalizeForSave({ rois: [roi({ name: "same" })], anchors: [], groups: [group({ name: "same" })], cliParams: [] });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatchObject({ code: "duplicate_name", name: "same" });
  });

  it("reports empty names", () => {
    const result = validateAndNormalizeForSave({ rois: [roi({ name: " " })], anchors: [], groups: [], cliParams: [] });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatchObject({ code: "empty_name", itemKind: "roi" });
  });

  it("reports non-positive ROI dimensions", () => {
    const result = validateAndNormalizeForSave({ rois: [roi({ name: "bad", w: 0, h: -1 })], anchors: [], groups: [], cliParams: [] });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((error) => error.code === "roi_nonpositive_dim" && error.name === "bad")).toBe(true);
  });

  it("filters anchor links, dedupes CLI links, and resets orphan groups", () => {
    const rois = [roi({ name: "keep", group: "missing" })];
    const anchors = [anchor({ name: "a", linked_rois: ["keep", "drop"], group: "missing" })];
    const cliParams = [cli({ name: "p", linked_observables: [" a ", "a", "", "b"], group: "missing" })];

    const result = validateAndNormalizeForSave({ rois, anchors, groups: [group({ name: "real" })], cliParams });

    expect(result).toEqual({ ok: true });
    expect(anchors[0].linked_rois).toEqual(["keep"]);
    expect(cliParams[0].linked_observables).toEqual(["a", "b"]);
    expect(rois[0].group).toBe("");
    expect(anchors[0].group).toBe("");
    expect(cliParams[0].group).toBe("");
  });

  it("detects group cycles", () => {
    const groups = [group({ name: "a", group: "b" }), group({ name: "b", group: "a" })];

    const result = validateAndNormalizeForSave({ rois: [], anchors: [], groups, cliParams: [] });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatchObject({ code: "group_cycle" });
  });
});
