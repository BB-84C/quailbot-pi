import { describe, expect, it } from "vitest";
import { join } from "node:path";

import {
  readSemanticArtifact,
  semanticArtifactRoot,
  type SemanticE2EArtifact,
  writeSemanticArtifact,
} from "./e2e-artifacts.js";

const requiredScenarios = [
  "workspace-to-context",
  "driver-agnostic-cli",
  "linked-observable",
  "blocked-capability",
  "planwrite",
  "plan-and-execute",
] as const;

function expectSemanticPass(
  artifact: { assertions: { name: string; pass: boolean; detail: string }[] },
  name: string,
): void {
  const assertion = artifact.assertions.find((x) => x.name === name);
  expect(assertion, `missing assertion ${name}`).toBeDefined();
  expect(assertion?.pass, assertion?.detail).toBe(true);
}

function readScenarioArtifact(name: (typeof requiredScenarios)[number]): SemanticE2EArtifact {
  return readSemanticArtifact(join(semanticArtifactRoot(), `${name}.json`));
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function expectPiSdkProvenance(artifact: SemanticE2EArtifact): void {
  const provenance = record(record(artifact).provenance);
  expect(provenance.runtimeMode).toBe("pi-sdk-agent-session");
  expect(provenance.externalLlm).toBe(false);
  expect(provenance.sessionId).toEqual(expect.any(String));
  expect(provenance.sessionId).not.toBe("");
  expect(provenance.sessionFile).toEqual(expect.any(String));
  expect(provenance.sessionSnapshotPath).toEqual(expect.any(String));
}

function evidence(artifact: SemanticE2EArtifact): Record<string, unknown> {
  return record(record(artifact).evidence);
}

describe("semantic E2E artifact contract", () => {
  it("preserves the fields required for OpenCode semantic acceptance", () => {
    const path = writeSemanticArtifact("contract-smoke", {
      scenario: "contract-smoke",
      task: "prove artifact contract",
      events: [],
      responses: [],
      messages: [],
      finalToolResult: { ok: true },
      linkedObservations: [{ channels: { cli: { results: {} }, roi: { results: {} } } }],
      assertions: [{ name: "contract", pass: true, detail: "artifact includes semantic fields" }],
    });
    const artifact = readSemanticArtifact(path);
    expect(artifact.linkedObservations).toHaveLength(1);
    expect(artifact.assertions.every((x) => x.pass)).toBe(true);
  });
});

describe("semantic E2E scenarios", () => {
  it("names every semantic scenario from the design spec", () => {
    expect(requiredScenarios).toEqual([
      "workspace-to-context",
      "driver-agnostic-cli",
      "linked-observable",
      "blocked-capability",
      "planwrite",
      "plan-and-execute",
    ]);
  });

  it("surfaces the active workspace summary in context", () => {
    const artifact = readScenarioArtifact("workspace-to-context");
    expectPiSdkProvenance(artifact);
    expect(textOf(artifact.events)).toContain("emitBeforeAgentStart");
    const contextText = `${textOf(evidence(artifact).systemPrompt)}\n${textOf(artifact.messages)}`;
    expect(contextText).toContain("WORKSPACE (Quailbot active workspace)");
    expect(contextText).toContain("nqctl:zctrl_setpnt");
  });

  it("runs CLI tools through the driver-agnostic seam", () => {
    const artifact = readScenarioArtifact("driver-agnostic-cli");
    expectPiSdkProvenance(artifact);
    expectSemanticPass(artifact, "driver-from-tool-args");
    expect(textOf(artifact.finalToolResult)).toContain("dummy_quailbot_pi_driver");
    expect(textOf(evidence(artifact).driverInvocations)).toContain("dummy_quailbot_pi_driver");
    expect(textOf(artifact.finalToolResult)).not.toContain("nqctl");
  });

  it("records linked observable readback with the primary result", () => {
    const artifact = readScenarioArtifact("linked-observable");
    expectPiSdkProvenance(artifact);
    expectSemanticPass(artifact, "primary-result-present");
    expectSemanticPass(artifact, "linked-observation-present");
    expect(artifact.linkedObservations.length).toBeGreaterThan(0);
  });

  it("blocks unsupported capability before invoking a driver", () => {
    const artifact = readScenarioArtifact("blocked-capability");
    expectPiSdkProvenance(artifact);
    expectSemanticPass(artifact, "validation-failed-before-driver");
    expectSemanticPass(artifact, "no-driver-invocations-before-block");
    expectSemanticPass(artifact, "driver-state-unchanged-after-block");
    expect(textOf(artifact.finalToolResult)).toContain("unknown CLI parameter");
    expect(textOf(artifact.finalToolResult)).toContain("validation_failed");
    expect(evidence(artifact).driverInvocations).toEqual([]);
    expect(evidence(artifact).stateAfter).toEqual(evidence(artifact).stateBefore);
  });

  it("persists and cleans system plans while excluding ephemeral plans", () => {
    const artifact = readScenarioArtifact("planwrite");
    expectPiSdkProvenance(artifact);
    expectSemanticPass(artifact, "system-plan-persisted");
    expectSemanticPass(artifact, "ephemeral-plan-not-persisted");
    expectSemanticPass(artifact, "clean-removes-system-plan");
    expect(textOf(evidence(artifact).contextSnapshots)).toContain("emitBeforeAgentStart");
  });

  it("plans ordered steps and records mutating observations", () => {
    const artifact = readScenarioArtifact("plan-and-execute");
    expectPiSdkProvenance(artifact);
    expectSemanticPass(artifact, "single-final-tool-result");
    expectSemanticPass(artifact, "ordered-step-list-present");
    expectSemanticPass(artifact, "mutating-step-has-linked-observation");
    expect(textOf(evidence(artifact).toolResults)).toContain("quailbot_plan_and_execute");
  });
});
