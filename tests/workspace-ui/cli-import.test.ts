import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

const execFileSyncMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({ execFileSync: execFileSyncMock }));

import {
  loadCliCapabilityPayload,
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
  beforeEach(() => {
    execFileSyncMock.mockReset();
  });

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

  it("skips semantically identical re-imports while preserving local enabled state", () => {
    const payload = parseCapabilityPayload("qctl", fixture("capabilities-qctl.json"));
    const first = mergeCliCapabilities({}, payload, {}).cliParams;
    (first.parameters.items[0] as JsonRecord).enabled = true;

    const result = mergeCliCapabilities(first, parseCapabilityPayload("qctl", fixture("capabilities-qctl.json")), {});

    expect(result.conflicts).toEqual([]);
    expect(result.added).toEqual([]);
    expect(result.skipped).toContain("qctl:bias_v");
    expect(result.cliParams.parameters.items[0]).toMatchObject({ name: "bias_v", enabled: true });
  });

  it("uses top-level cli_name as the existing effective CLI without conflicting on normalized CLI_Name", () => {
    const payload = parseCapabilityPayload("qctl", fixture("capabilities-qctl.json"));
    const existing = {
      cli_name: "qctl",
      parameters: {
        items: [
          {
            name: "bias_v",
            label: "Bias",
            description: "Sample bias voltage.",
            readable: true,
            writable: true,
            enabled: false,
            set_cmd: { command: "Bias_Set" },
          },
        ],
      },
      action_commands: { items: [] },
    };

    const result = mergeCliCapabilities(existing, { ...payload, parameters: [payload.parameters[0]], actions: [] }, {});

    expect(result.conflicts).toEqual([]);
    expect(result.added).toEqual([]);
    expect(result.skipped).toEqual(["qctl:bias_v"]);
    expect(result.cliParams.parameters.items[0]).not.toHaveProperty("CLI_Name");
  });

  it("preserves malformed existing parameter containers instead of sanitizing draft data", () => {
    const payload = parseCapabilityPayload("qctl", fixture("capabilities-qctl.json"));
    const existing = {
      parameters: { items: { vendor_raw: "not-an-array" }, vendor_parameters_field: true },
      action_commands: { items: [] },
    };

    const result = mergeCliCapabilities(existing, payload, {});

    expect(result.cliParams.parameters).toEqual({
      items: { vendor_raw: "not-an-array" },
      vendor_parameters_field: true,
    });
    expect(result.cliParams.action_commands.items).toContainEqual(
      expect.objectContaining({ name: "Approach", CLI_Name: "qctl", enabled: false }),
    );
    expect(result.added).toEqual(["qctl:Approach"]);
  });

  it("fails loudly instead of silently dropping malformed imported items", () => {
    expect(() =>
      parseCapabilityPayload("qctl", {
        parameters: { items: [{ name: "bias_v" }, "not-a-record"] },
        action_commands: { items: [] },
      }),
    ).toThrow(/parameters\.items\[1\]/);
  });

  it("rejects non-object top-level capability payloads", () => {
    expect(() => parseCapabilityPayload("qctl", null)).toThrow(/payload root/);
    expect(() => parseCapabilityPayload("qctl", "not-an-object")).toThrow(/payload root/);
  });

  it("rejects parameter items missing a name with an exact path", () => {
    expect(() =>
      parseCapabilityPayload("qctl", {
        parameters: { items: [{ label: "Missing Name" }] },
        action_commands: { items: [] },
      }),
    ).toThrow(/parameters\.items\[0\]\.name/);
  });

  it("rejects parameter items with empty, blank, or non-string names", () => {
    for (const name of ["", "   ", 42]) {
      expect(() =>
        parseCapabilityPayload("qctl", {
          parameters: { items: [{ name }] },
          action_commands: { items: [] },
        }),
      ).toThrow(/parameters\.items\[0\]\.name/);
    }
  });

  it("rejects action items missing or using invalid names with an exact path", () => {
    for (const action of [{ action_cmd: { command: "Approach" } }, { name: "\t" }]) {
      expect(() =>
        parseCapabilityPayload("qctl", {
          parameters: { items: [] },
          action_commands: { items: [action] },
        }),
      ).toThrow(/action_commands\.items\[0\]\.name/);
    }
  });

  it("falls back from capabilities to capacities and reports both commands when discovery fails", () => {
    execFileSyncMock
      .mockImplementationOnce(() => {
        throw new Error("missing capabilities");
      })
      .mockReturnValueOnce(JSON.stringify(fixture("capabilities-qctl.json")));

    const payload = loadCliCapabilityPayload("qctl");

    expect(execFileSyncMock).toHaveBeenNthCalledWith(1, "qctl", ["capabilities"], expect.any(Object));
    expect(execFileSyncMock).toHaveBeenNthCalledWith(2, "qctl", ["capacities"], expect.any(Object));
    expect(payload.parameters.map((item) => item.name)).toEqual(["bias_v", "current"]);

    execFileSyncMock.mockReset();
    execFileSyncMock.mockImplementation(() => {
      throw new Error("no such command");
    });

    expect(() => loadCliCapabilityPayload("qctl")).toThrow(/qctl capabilities.*qctl capacities/s);
  });

  it("does not fall back when capabilities returns malformed JSON shape", async () => {
    vi.doUnmock("node:child_process");
    vi.resetModules();
    const { loadCliCapabilityPayload: loadWithRealExec } = await import("../../src/workspace-ui/cli-import.js");
    const tempDir = mkdtempSync(join(tmpdir(), "qctl-capabilities-"));
    const originalCwd = process.cwd();
    const capabilitiesPath = join(tempDir, "capabilities");
    const capacitiesPath = join(tempDir, "capacities");
    const malformed = JSON.stringify({ parameters: { items: [{ label: "Missing Name" }] }, action_commands: { items: [] } });
    const valid = JSON.stringify({ parameters: { items: [{ name: "current" }] }, action_commands: { items: [] } });
    writeFileSync(capabilitiesPath, `console.log(${JSON.stringify(malformed)});\n`, "utf8");
    writeFileSync(capacitiesPath, `console.log(${JSON.stringify(valid)});\n`, "utf8");

    try {
      process.chdir(tempDir);
      expect(() => loadWithRealExec(process.execPath)).toThrow(/capabilities.*parameters\.items\[0\]\.name/s);
    } finally {
      process.chdir(originalCwd);
      rmSync(tempDir, { recursive: true, force: true });
      vi.doMock("node:child_process", () => ({ execFileSync: execFileSyncMock }));
      vi.resetModules();
    }
  });
});
