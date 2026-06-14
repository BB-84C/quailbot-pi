import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  mergeCliCapabilities,
  parseCapabilityPayload,
  type ConflictResolution,
} from "../../src/workspace-ui/cli-import.js";
import type { JsonRecord } from "../../src/workspace-ui/json.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, name), "utf8")) as unknown;
}

describe("CLI capability import", () => {
  it("adds new parameters and actions as disabled entries", () => {
    const payload = parseCapabilityPayload("qctl", fixture("capabilities-qctl.json"));

    const result = mergeCliCapabilities({ vendor_cli_field: "keep" }, payload, {});

    expect(result.added).toEqual(["qctl:bias_v", "qctl:current", "qctl:Approach"]);
    expect(result.conflicts).toEqual([]);
    expect(result.cliParams.vendor_cli_field).toBe("keep");
    expect(result.cliParams.parameters.items).toContainEqual(
      expect.objectContaining({ name: "bias_v", CLI_Name: "qctl", enabled: false }),
    );
    expect(result.cliParams.action_commands.items).toContainEqual(
      expect.objectContaining({ name: "Approach", CLI_Name: "qctl", enabled: false }),
    );
  });

  it("skips identical re-imports", () => {
    const payload = parseCapabilityPayload("qctl", fixture("capabilities-qctl.json"));
    const first = mergeCliCapabilities({}, payload, {});

    const second = mergeCliCapabilities(first.cliParams, payload, {});

    expect(second.added).toEqual([]);
    expect(second.conflicts).toEqual([]);
    expect(second.skipped).toEqual(["qctl:bias_v", "qctl:current", "qctl:Approach"]);
    expect(second.cliParams.parameters.items).toHaveLength(2);
    expect(second.cliParams.action_commands.items).toHaveLength(1);
  });

  it("returns conflict rows for changed imports with the same CLI/name key", () => {
    const imported = parseCapabilityPayload("qctl", fixture("capabilities-qctl.json"));
    const existing = mergeCliCapabilities({}, imported, {}).cliParams;
    const changed = parseCapabilityPayload("qctl", fixture("capabilities-qctl-conflict.json"));

    const conflicted = mergeCliCapabilities(existing, changed, {});

    expect(conflicted.conflicts).toEqual([expect.objectContaining({ ref: "qctl:bias_v" })]);
    expect(conflicted.added).toEqual([]);
    expect(conflicted.skipped).toEqual([]);
    expect(conflicted.conflicts[0].existing).toMatchObject({ label: "Bias" });
    expect(conflicted.conflicts[0].imported).toMatchObject({ label: "Bias Updated", enabled: false });
    expect(conflicted.cliParams.parameters.items[0]).toMatchObject({ label: "Bias", enabled: false });
  });

  it("resolves conflicts by replacing existing entries with imported disabled entries", () => {
    const imported = parseCapabilityPayload("qctl", fixture("capabilities-qctl.json"));
    const existing = mergeCliCapabilities({}, imported, {}).cliParams;
    const changed = parseCapabilityPayload("qctl", fixture("capabilities-qctl-conflict.json"));
    const resolutions: Record<string, ConflictResolution> = { "qctl:bias_v": "imported" };

    const resolved = mergeCliCapabilities(existing, changed, resolutions);

    expect(resolved.conflicts).toEqual([]);
    expect(resolved.added).toEqual([]);
    expect(resolved.skipped).toEqual([]);
    expect(resolved.cliParams.parameters.items[0]).toMatchObject({ label: "Bias Updated", enabled: false });
    expect((resolved.cliParams.parameters.items[0] as JsonRecord).set_cmd).toEqual({ command: "Bias_Set_Updated" });
  });
});
