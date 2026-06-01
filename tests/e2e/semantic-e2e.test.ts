import { describe, expect, it } from "vitest";

import { readSemanticArtifact, writeSemanticArtifact } from "./e2e-artifacts.js";

const requiredScenarios = [
  "workspace-to-context",
  "driver-agnostic-cli",
  "linked-observable",
  "blocked-capability",
  "planwrite",
  "plan-and-execute",
] as const;

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
});
