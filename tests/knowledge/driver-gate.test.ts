import { describe, expect, it } from "vitest";

import type { Workspace, CliParameter } from "../../src/workspace/types.js";
import { buildMissingDriverWarning, driverPresent, evaluateSkillGate } from "../../src/knowledge/driver-gate.js";

function workspace(params: Array<Partial<CliParameter> & { cliName: string; name: string; enabled: boolean }>, opts?: { enabled?: boolean; defaultCliName?: string }): Workspace {
  const parameters = new Map<string, CliParameter>();
  for (const p of params) {
    const ref = `${p.cliName}:${p.name}`;
    parameters.set(ref, {
      ref, cliName: p.cliName, name: p.name, enabled: p.enabled,
      actions: { get: true, set: false, ramp: false }, linkedObservables: [], schema: {},
    } as CliParameter);
  }
  return {
    sourcePath: "x", rois: [], anchors: [],
    cli: { enabled: opts?.enabled ?? true, defaultCliName: opts?.defaultCliName ?? "nqctl", parameters, actions: new Map() },
  };
}

describe("driverPresent", () => {
  it("true when an enabled param uses the driver and cli is enabled", () => {
    expect(driverPresent(workspace([{ cliName: "nqctl", name: "bias", enabled: true }]), "nqctl")).toBe(true);
  });
  it("false when cli is disabled", () => {
    expect(driverPresent(workspace([{ cliName: "nqctl", name: "bias", enabled: true }], { enabled: false }), "nqctl")).toBe(false);
  });
  it("false when all params for the driver are disabled (default-by-name alone is not enough)", () => {
    expect(driverPresent(workspace([{ cliName: "nqctl", name: "bias", enabled: false }]), "nqctl")).toBe(false);
  });
  it("false when no workspace", () => {
    expect(driverPresent(undefined, "nqctl")).toBe(false);
  });
});

describe("evaluateSkillGate + warning", () => {
  it("reports the missing subset and renders the verbatim warning", () => {
    const ws = workspace([{ cliName: "nqctl", name: "bias", enabled: true }]);
    const gate = evaluateSkillGate(ws, { name: "change-tip", description: "d", drivers: ["nqctl", "awg"], body: "b" });
    expect(gate.missing).toEqual(["awg"]);
    const warning = buildMissingDriverWarning("change-tip", ["nqctl", "awg"], ["awg"]);
    expect(warning).toContain("[QUAILBOT WORKSPACE WARNING]");
    expect(warning).toContain('Skill "change-tip" requires CLI driver(s): awg, nqctl.');
    expect(warning).toContain("does NOT register: awg.");
  });
});
