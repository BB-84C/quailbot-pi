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
    expectSemanticPass(artifact, "workspace-summary-visible");
    const messages = textOf(artifact.messages);
    expect(messages).toContain("WORKSPACE (Quailbot active workspace)");
    expect(messages).toContain("nqctl:zctrl_setpnt");
  });

  it("runs CLI tools through the driver-agnostic seam", () => {
    const artifact = readScenarioArtifact("driver-agnostic-cli");
    expectSemanticPass(artifact, "driver-from-tool-args");
    expect(textOf(artifact.finalToolResult)).toContain("nqctl");
  });

  it("records linked observable readback with the primary result", () => {
    const artifact = readScenarioArtifact("linked-observable");
    expectSemanticPass(artifact, "primary-result-present");
    expectSemanticPass(artifact, "linked-observation-present");
    expect(artifact.linkedObservations.length).toBeGreaterThan(0);
  });

  it("blocks unsupported capability before invoking a driver", () => {
    const artifact = readScenarioArtifact("blocked-capability");
    expectSemanticPass(artifact, "validation-failed-before-driver");
    expect(textOf(artifact.finalToolResult)).toContain("unknown CLI parameter");
  });

  it("persists and cleans system plans while excluding ephemeral plans", () => {
    const artifact = readScenarioArtifact("planwrite");
    expectSemanticPass(artifact, "system-plan-persisted");
    expectSemanticPass(artifact, "ephemeral-plan-not-persisted");
    expectSemanticPass(artifact, "clean-removes-system-plan");
  });

  it("plans ordered steps and records mutating observations", () => {
    const artifact = readScenarioArtifact("plan-and-execute");
    expectSemanticPass(artifact, "single-final-tool-result");
    expectSemanticPass(artifact, "ordered-step-list-present");
    expectSemanticPass(artifact, "mutating-step-has-linked-observation");
  });
});
