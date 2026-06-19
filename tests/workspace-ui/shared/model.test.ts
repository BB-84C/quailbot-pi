import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  anchorToJson,
  cliParamToJson,
  editableLinkedObservables,
  groupToJson,
  implicitSelfObservable,
  roiToJson,
  runtimeLinkedObservables,
  syncActionsFromMetadata,
  type AnchorDraft,
  type CliParamDraft,
  type GroupDraft,
  type RoiDraft,
} from "../../../src/workspace-ui/shared/model.js";
import { stringifyWorkspaceJson } from "../../../src/workspace-ui/shared/serialize.js";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures", "python-golden");

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixtureDir, name), "utf8")) as unknown;
}

function expectKeyOrder(actual: unknown, expected: unknown): void {
  if (Array.isArray(actual) || Array.isArray(expected)) {
    expect(Array.isArray(actual)).toBe(true);
    expect(Array.isArray(expected)).toBe(true);
    const actualArray = actual as unknown[];
    const expectedArray = expected as unknown[];
    expect(actualArray).toHaveLength(expectedArray.length);
    for (let i = 0; i < expectedArray.length; i += 1) {
      expectKeyOrder(actualArray[i], expectedArray[i]);
    }
    return;
  }
  if (actual && expected && typeof actual === "object" && typeof expected === "object") {
    expect(Object.keys(actual)).toEqual(Object.keys(expected));
    for (const key of Object.keys(expected)) {
      expectKeyOrder((actual as Record<string, unknown>)[key], (expected as Record<string, unknown>)[key]);
    }
  }
}

function expectMatchesFixture(actual: Record<string, unknown>, fixtureName: string): void {
  const expected = fixture(fixtureName);
  expect(JSON.parse(stringifyWorkspaceJson(actual))).toEqual(expected);
  expectKeyOrder(actual, expected);
}

function cli(overrides: Partial<CliParamDraft>): CliParamDraft {
  return {
    cli_name: "cli",
    name: "",
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

describe("workspace shared model serialization", () => {
  it("matches Python RoiDraft.to_json fixtures", () => {
    const cases: Array<[string, RoiDraft]> = [
      ["model_roi_normal.json", { name: "roi-main", x: 10, y: 20, w: 30, h: 40, description: "normal roi", tags: "alpha, beta", active: true, group: "" }],
      ["model_roi_negative_xy_empty_tags.json", { name: "roi-negative", x: -1920, y: -12, w: 5, h: 6, description: "negative origin", tags: " , ", active: false, group: "" }],
      ["model_roi_with_group.json", { name: "roi-grouped", x: 1, y: 2, w: 3, h: 4, description: "grouped", tags: "tag", active: true, group: "geometry" }],
    ];

    for (const [fixtureName, draft] of cases) {
      expectMatchesFixture(roiToJson(draft), fixtureName);
    }
  });

  it("matches Python AnchorDraft.to_json fixtures", () => {
    const cases: Array<[string, AnchorDraft]> = [
      ["model_anchor_no_links.json", { name: "anchor-plain", x: 7, y: 8, description: "plain", tags: "", linked_rois: [], active: true, group: "" }],
      [
        "model_anchor_with_links_tags_group.json",
        {
          name: "anchor-linked",
          x: -2,
          y: 44,
          description: "linked",
          tags: "nav, ref",
          linked_rois: ["roi-main", "roi-negative"],
          active: false,
          group: "geometry",
        },
      ],
    ];

    for (const [fixtureName, draft] of cases) {
      expectMatchesFixture(anchorToJson(draft), fixtureName);
    }
  });

  it("matches Python GroupDraft.to_json and omits collapsed", () => {
    const draft: GroupDraft = {
      name: "geometry",
      description: "spatial things",
      tags: "alpha, nested",
      active: false,
      group: "root",
      collapsed: true,
    };

    const actual = groupToJson(draft);

    expectMatchesFixture(actual, "model_group.json");
    expect(actual).not.toHaveProperty("collapsed");
  });

  it("matches Python CliParamDraft.to_json parameter fixtures", () => {
    const cases: Array<[string, CliParamDraft]> = [
      [
        "cli_param_readable_only.json",
        cli({
          cli_name: "fixturectl",
          name: "readback",
          label: "Readback",
          description: "readable only",
          enabled: true,
          allow_get: true,
          readable: true,
          writable: false,
          has_ramp: false,
          safety: null,
          get_cmd: { argv: ["fixturectl", "get", "readback"], description: "read readback" },
        }),
      ],
      [
        "cli_param_writable_set_cmd_cleanup_raw.json",
        cli({
          cli_name: "fixturectl",
          name: "bias",
          label: "Bias Voltage",
          description: "writable parameter",
          tags: "control, voltage",
          enabled: true,
          group: "controls",
          allow_get: true,
          allow_set: true,
          allow_ramp: false,
          readable: true,
          writable: true,
          has_ramp: false,
          safety: null,
          get_cmd: { argv: ["fixturectl", "get", "bias"], description: "get bias" },
          set_cmd: { argv: ["fixturectl", "set", "bias"], value_arg: "--value", description: "set bias" },
          raw_item: { legacy: "kept", unit: "V", value_type: "float", snapshot_value: 0.25, vals: [0.1, 0.2], linked_ROIs: ["old-linked"] },
        }),
      ],
      [
        "cli_param_ramp_safety_enabled.json",
        cli({
          cli_name: "fixturectl",
          name: "height",
          label: "Height",
          description: "rampable parameter",
          enabled: true,
          allow_get: true,
          allow_set: true,
          allow_ramp: true,
          readable: true,
          writable: true,
          has_ramp: true,
          safety: { ramp_enabled: true, max_step: 0.5, cooldown_s: 1 },
          get_cmd: { argv: ["fixturectl", "get", "height"] },
          set_cmd: { argv: ["fixturectl", "set", "height"], value_arg: "value" },
        }),
      ],
      [
        "cli_param_linked_observables.json",
        cli({
          cli_name: "fixturectl",
          name: "drive",
          label: "Drive",
          description: "linked parameter",
          enabled: false,
          allow_get: true,
          allow_set: true,
          readable: true,
          writable: true,
          has_ramp: false,
          safety: {},
          get_cmd: { argv: ["fixturectl", "get", "drive"] },
          set_cmd: { argv: ["fixturectl", "set", "drive"] },
          linked_observables: ["readback", "height", "readback"],
        }),
      ],
    ];

    for (const [fixtureName, draft] of cases) {
      expectMatchesFixture(cliParamToJson(draft), fixtureName);
    }
  });

  it("matches Python CliParamDraft.to_json action fixtures", () => {
    const cases: Array<[string, string, string, string]> = [
      ["cli_action_alwaysallowed.json", "alwaysallowed", "do-alwaysallowed", "action"],
      ["cli_action_blocked.json", "blocked", "do-blocked", ""],
      ["cli_action_guarded_default.json", "unexpected", "do-guarded_default", ""],
    ];

    for (const [fixtureName, safetyMode, name, tags] of cases) {
      expectMatchesFixture(
        cliParamToJson(
          cli({
            cli_name: "fixturectl",
            name,
            label: "",
            description: "run action",
            tags,
            enabled: true,
            group: safetyMode === "alwaysallowed" ? "actions" : "",
            safety_mode: safetyMode,
            action_cmd: { argv: ["fixturectl", "do", safetyMode === "unexpected" ? "guarded_default" : safetyMode], description: "action fallback not used" },
            linked_observables: ["roi-main", "readback"],
            raw_item: { raw_action: "kept", linked_ROIs: ["remove-me"] },
          }),
        ),
        fixtureName,
      );
    }
  });

  it("ports CLI linked-observable helpers and mutating sync behavior", () => {
    const draft = cli({
      name: "drive",
      allow_get: true,
      allow_set: true,
      linked_observables: ["drive", "height", "height"],
      safety: { ramp_enabled: false },
      set_cmd: { argv: ["fixturectl", "set", "drive"] },
      writable: true,
      readable: true,
      has_ramp: true,
    });

    expect(implicitSelfObservable(draft)).toBe("drive");
    expect(runtimeLinkedObservables(draft)).toEqual([
      { name: "drive", editable: false },
      { name: "height", editable: true },
    ]);
    expect(editableLinkedObservables(draft)).toEqual(["height"]);
    syncActionsFromMetadata(draft);
    expect(draft.allow_get).toBe(true);
    expect(draft.allow_set).toBe(true);
    expect(draft.allow_ramp).toBe(false);

    draft.action_cmd = { argv: ["fixturectl", "do"] };
    syncActionsFromMetadata(draft);
    expect(draft).toMatchObject({ readable: false, writable: false, has_ramp: false, allow_get: false, allow_set: false, allow_ramp: false, safety: null });
  });
});
