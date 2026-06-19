import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { cliParamToJson, type CliParamDraft } from "../../../src/workspace-ui/shared/model.js";
import { buildWorkspaceJson, serializeCliParamsBlock, serializeCliTools, stringifyWorkspaceJson } from "../../../src/workspace-ui/shared/serialize.js";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures", "python-golden");

function fixtureText(name: string): string {
  return readFileSync(join(fixtureDir, name), "utf8");
}

function fixture(name: string): unknown {
  return JSON.parse(fixtureText(name)) as unknown;
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

function saveFixtureInput(): Parameters<typeof buildWorkspaceJson>[0] {
  const cliParams = [
    cli({
      cli_name: "fixturectl",
      name: "zeta",
      label: "Zeta",
      description: "sort second",
      enabled: true,
      allow_get: true,
      readable: true,
      get_cmd: { argv: ["fixturectl", "get", "zeta"] },
    }),
    cli({
      cli_name: "fixturectl",
      name: "alpha-action",
      label: "Alpha Action",
      description: "sort first action",
      enabled: true,
      safety_mode: "alwaysallowed",
      action_cmd: { argv: ["fixturectl", "alpha-action"] },
    }),
  ];
  return {
    raw: {
      notes: "x",
      GUI: { stale: "preserve me" },
      tools: { cli: { legacy_field: "preserved in cli_out" }, other: { kept: true } },
      cli_params: { legacy_cli_params_field: "preserved in cli_out" },
    },
    rois: [{ name: "roi-save", x: -1, y: 2, w: 3, h: 4, description: "saved", tags: "", active: true, group: "" }],
    anchors: [{ name: "anchor-save", x: 5, y: 6, description: "saved", tags: "", linked_rois: ["roi-save"], active: true, group: "" }],
    groups: [{ name: "save-group", description: "saved group", tags: "", active: true, group: "", collapsed: false }],
    cliName: "fixturectl",
    cliEnabled: true,
    cliParams,
  };
}

describe("workspace shared serialization", () => {
  it("serializes legacy tools.cli while preserving existing tool keys", () => {
    const args = saveFixtureInput();
    const actual = serializeCliTools({ existingTools: args.raw.tools, enabled: args.cliEnabled, params: args.cliParams });

    expect(actual).toMatchObject({ other: { kept: true }, cli: { legacy_field: "preserved in cli_out", enabled: true } });
    expect((actual.cli as Record<string, unknown>).parameters).toHaveProperty("zeta");
    expect((actual.cli as Record<string, unknown>).actions).toHaveProperty("alpha-action");
  });

  it("serializes cli_params item/count form sorted by Python label order", () => {
    const args = saveFixtureInput();
    const actual = serializeCliParamsBlock({ existingRaw: args.raw, cliName: args.cliName, enabled: args.cliEnabled, params: args.cliParams });

    expect(actual.cli_params).toMatchObject({ legacy_cli_params_field: "preserved in cli_out", cli_name: "fixturectl", enabled: true });
    expect(((actual.cli_params as Record<string, Record<string, unknown>>).parameters.items as Array<Record<string, unknown>>).map((item) => item.name)).toEqual(["zeta"]);
    expect(((actual.cli_params as Record<string, Record<string, unknown>>).action_commands.items as Array<Record<string, unknown>>).map((item) => item.name)).toEqual(["alpha-action"]);
  });

  it("matches Python save round-trip fixture and preserves unknown top-level keys plus stale GUI", () => {
    const actual = buildWorkspaceJson(saveFixtureInput());
    const expected = fixture("save_round_trip_preserves_unknown_gui.json");

    expect(actual).toEqual(expected);
    expectKeyOrder(actual, expected);
    expect(actual).toMatchObject({ notes: "x", GUI: { stale: "preserve me" } });
    expect(actual).toHaveProperty("tools.cli");
    expect(actual).toHaveProperty("cli_params");
    const firstParam = (((actual.cli_params as Record<string, Record<string, unknown>>).parameters.items as Array<Record<string, unknown>>)[0]);
    expect(Object.keys(firstParam)[0]).toBe("label");
  });

  it("stringifies with Python json.dumps-compatible indentation and trailing newline", () => {
    const actual = buildWorkspaceJson(saveFixtureInput());

    expect(stringifyWorkspaceJson(actual)).toBe(fixtureText("save_round_trip_preserves_unknown_gui.json"));
  });

  it("spot-checks writable cleanup fixture key order and removed fields", () => {
    const actual = cliParamToJson(
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
    );

    expect(Object.keys(actual)).toEqual(["label", "legacy", "name", "CLI_Name", "readable", "writable", "has_ramp", "enabled", "description", "get_cmd", "set_cmd", "safety", "actions", "tags", "group"]);
    expect(actual).toMatchObject({ legacy: "kept" });
    expect(actual).not.toHaveProperty("unit");
    expect(actual).not.toHaveProperty("value_type");
    expect(actual).not.toHaveProperty("snapshot_value");
    expect(actual).not.toHaveProperty("vals");
    expect((actual.set_cmd as Record<string, unknown>)).not.toHaveProperty("value_arg");
  });
});
