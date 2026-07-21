import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { anchorToJson, cliParamToJson, groupToJson, roiToJson } from "../../../src/workspace-ui/shared/model.js";
import {
  deriveActionsFromItem,
  draftFromParameterItem,
  loadWorkspaceData,
  loadWorkspaceRaw,
  normalizeSafetyMode,
  parseActive,
  parseBool,
  parseCliParameterDrafts,
  parseCliParamsBlock,
  parseLinkedValues,
  safeFloat,
} from "../../../src/workspace-ui/shared/parse.js";

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

function parsedPayload(raw: Record<string, unknown>): Record<string, unknown> {
  const data = loadWorkspaceData(raw);
  return {
    rois: data.rois.map(roiToJson),
    anchors: data.anchors.map(anchorToJson),
    groups: data.groups.map(groupToJson),
    cli_name: data.cliName,
    cli_enabled: data.cliEnabled,
    cli_params: data.cliParams.map(cliParamToJson),
  };
}

function expectParsed(raw: Record<string, unknown>, fixtureName: string): void {
  const actual = parsedPayload(raw);
  const expected = fixture(fixtureName);
  expect(actual).toEqual(expected);
  expectKeyOrder(actual, expected);
}

describe("workspace shared parse logic", () => {
  it("matches Python bool coercion asymmetries", () => {
    const expected = fixture("parse_bool_coercions.json") as Record<string, Array<Record<string, unknown>>>;
    const actual = {
      parse_active: expected.parse_active.map((item) => ({ ...item, result: parseActive(item.value) })),
      parse_bool_default_true: expected.parse_bool_default_true.map((item) => ({ ...item, result: parseBool(item.value, true) })),
      parse_bool_default_false: expected.parse_bool_default_false.map((item) => ({ ...item, result: parseBool(item.value, false) })),
    };

    expect(actual).toEqual(expected);
    expect(parseActive("off")).toBe(true);
    expect(parseBool("off", true)).toBe(false);
  });

  it("ports small parse helpers", () => {
    expect(parseLinkedValues(null)).toEqual([]);
    expect(parseLinkedValues([" a ", 3, ""])).toEqual(["a", "3"]);
    expect(parseLinkedValues(" roi-one ")).toEqual(["roi-one"]);
    expect(normalizeSafetyMode("alwaysallowed")).toBe("alwaysAllowed");
    expect(normalizeSafetyMode("blocked")).toBe("blocked");
    expect(normalizeSafetyMode("surprise")).toBe("guarded");
    expect(deriveActionsFromItem({ actions: { get: "yes", set: "on", ramp: "off" } })).toEqual({ readable: true, allowSet: true, allowRamp: false });
    expect(deriveActionsFromItem({ readable: true, writable: true, has_ramp: true, safety: { ramp_enabled: false }, set_cmd: {} })).toEqual({ readable: true, allowSet: true, allowRamp: false });
  });

  it("safeFloat matches Python fallback and integer-preservation behavior", () => {
    expect(safeFloat("", 7)).toBe(7);
    expect(safeFloat(" not-a-number ", 7.5)).toBe(7.5);
    expect(safeFloat(" 4.0 ", 7)).toBe(4);
    expect(safeFloat(" 4.25 ", 7)).toBe(4.25);
    expect(safeFloat(" 4.0 ", 7.5)).toBe(4);
  });

  it("loads a missing workspace as Python raw data without groups", () => {
    const actual = loadWorkspaceRaw(null);
    const expected = fixture("load_missing_file.json");

    expect(actual).toEqual(expected);
    expect(Object.keys(actual)).toEqual(Object.keys(expected as Record<string, unknown>));
    expect(actual).not.toHaveProperty("groups");
  });

  it("throws Python load errors for malformed workspace containers", () => {
    expect(() => loadWorkspaceRaw("[]")).toThrow("workspace must be a JSON object");
    expect(() => loadWorkspaceRaw(JSON.stringify({ rois: {}, anchors: [], groups: [], tools: {} }))).toThrow("workspace fields must be {rois:list, anchors:list, groups:list, tools:object}");
    expect(() => loadWorkspaceRaw(JSON.stringify({ rois: [], anchors: {}, groups: [], tools: {} }))).toThrow("workspace fields must be {rois:list, anchors:list, groups:list, tools:object}");
    expect(() => loadWorkspaceRaw(JSON.stringify({ rois: [], anchors: [], groups: {}, tools: {} }))).toThrow("workspace fields must be {rois:list, anchors:list, groups:list, tools:object}");
    expect(() => loadWorkspaceRaw(JSON.stringify({ rois: [], anchors: [], groups: [], tools: [] }))).toThrow("workspace fields must be {rois:list, anchors:list, groups:list, tools:object}");
  });

  it("parses GUI-wrapped visual drafts with Python defaults", () => {
    expectParsed(
      {
        GUI: {
          rois: [{ name: "gui-roi", x: "-10", y: "20", w: "30", h: "40", description: "from GUI", tags: ["a", 2], active: "no", group: "gui-group" }],
          anchors: [{ name: "gui-anchor", x: 5, y: 6, description: "anchor", tags: ["b"], linked_ROIs: ["gui-roi"], active: 1 }],
          groups: [{ name: "gui-group", description: "group", tags: ["g"], active: "yes" }],
        },
        tools: {},
      },
      "load_gui_wrapped.json",
    );
  });

  it("parses legacy tools.cli branches", () => {
    const raw = {
      tools: {
        cli: {
          enabled: "on",
          cli_name: "fixturectl",
          parameters: {
            beta: { name: "beta", label: "B", readable: true, get_cmd: { argv: ["fixturectl", "get", "beta"] } },
            alpha: { name: "alpha", label: "A", writable: true, set_cmd: { argv: ["fixturectl", "set", "alpha"] } },
          },
          actions: { zap: { name: "zap", label: "Z", action_cmd: { argv: ["fixturectl", "zap"], description: "Zap fallback" }, description: "" } },
          action_commands: {
            count: 99,
            items: [{ name: "ignored-items-list", action_cmd: { argv: ["fixturectl", "ignored"] } }],
            open: { name: "open", label: "O", action_cmd: { argv: ["fixturectl", "open"] } },
          },
        },
      },
    };

    expectParsed(raw, "parse_legacy_tools_cli.json");
    const parsed = parseCliParameterDrafts(raw.tools);
    expect(parsed.enabled).toBe(true);
    expect(parsed.params.map((item) => item.name)).toEqual(["alpha", "beta", "open", "zap"]);
  });

  it("parses cli_params items lists with item default-enabled false", () => {
    expectParsed(
      {
        cli_params: {
          cli_name: "fixturectl",
          enabled: "false",
          parameters: {
            count: 2,
            items: [
              { name: "list-param", label: "List Param", readable: true, get_cmd: { argv: ["fixturectl", "get", "list-param"] } },
              { name: "list-set", label: "List Set", writable: true, set_cmd: { argv: ["fixturectl", "set", "list-set"] } },
            ],
          },
          action_commands: { count: 1, items: [{ name: "list-action", label: "List Action", action_cmd: { argv: ["fixturectl", "act"], description: "act fallback" } }] },
        },
      },
      "parse_cli_params_items.json",
    );
  });

  it("parses cli_params dict fallbacks and legacy actions", () => {
    expectParsed(
      {
        cli_params: {
          cli_name: "fixturectl",
          enabled: 1,
          parameters: {
            count: 2,
            items: "not-a-list",
            "dict-param": { name: "dict-param", label: "Dict Param", readable: "yes", get_cmd: { argv: ["fixturectl", "get", "dict-param"] } },
          },
          action_commands: {
            count: 1,
            items: "not-a-list",
            "dict-action": { name: "dict-action", label: "Dict Action", action_cmd: { argv: ["fixturectl", "dict-action"] } },
          },
          actions: { "legacy-action": { name: "legacy-action", label: "Legacy Action", action_cmd: { argv: ["fixturectl", "legacy-action"] } } },
        },
      },
      "parse_cli_params_dict_fallback.json",
    );
  });

  it("parses linked values, tags, action overrides, and action description fallback", () => {
    const raw = {
      cli_params: {
        cli_name: "fixturectl",
        enabled: true,
        parameters: {
          items: [
            {
              name: "preferred-links",
              label: "Preferred Links",
              tags: ["one", 2],
              readable: false,
              writable: false,
              has_ramp: false,
              actions: { get: "yes", set: "on", ramp: "true" },
              linked_observables: ["obs-a"],
              linked_ROIs: ["roi-fallback-not-used"],
              set_cmd: { argv: ["fixturectl", "set", "preferred-links"] },
            },
            {
              name: "fallback-scalar-link",
              label: "Fallback Scalar",
              tags: "scalar-tag",
              readable: true,
              linked_ROIs: "roi-one",
              get_cmd: { argv: ["fixturectl", "get", "fallback-scalar-link"] },
            },
          ],
        },
        action_commands: {
          items: [
            { name: "blank-description-action", label: "Blank Desc", description: "", action_cmd: { argv: ["fixturectl", "blank"], description: "fallback description" } },
            { name: "explicit-description-action", label: "Explicit Desc", description: "explicit wins", action_cmd: { argv: ["fixturectl", "explicit"], description: "ignored fallback" } },
          ],
        },
      },
    };

    expectParsed(raw, "parse_links_tags_actions_description.json");
    const { params } = parseCliParamsBlock(raw);
    expect(params.find((item) => item.name === "preferred-links")?.linked_observables).toEqual(["obs-a"]);
    expect(params.find((item) => item.name === "preferred-links")).toMatchObject({
      allow_get: true,
      allow_set: true,
      allow_ramp: true,
      actions_overridden: true,
    });
    expect(params.find((item) => item.name === "fallback-scalar-link")?.linked_observables).toEqual(["roi-one"]);
    expect(params.find((item) => item.name === "blank-description-action")?.description).toBe("fallback description");
    expect(params.find((item) => item.name === "explicit-description-action")?.description).toBe("explicit wins");
  });

  it("returns null for malformed parameter items", () => {
    expect(draftFromParameterItem({ nameHint: "x", value: "bad", defaultEnabled: true, defaultCliName: "fixturectl" })).toBeNull();
    expect(draftFromParameterItem({ nameHint: "", value: { label: "missing" }, defaultEnabled: true, defaultCliName: "fixturectl" })).toBeNull();
  });
});
