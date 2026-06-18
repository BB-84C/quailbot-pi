import { describe, expect, it } from "vitest";
import { join } from "node:path";

import { readSemanticArtifact, semanticArtifactRoot, type SemanticE2EArtifact } from "./e2e-artifacts.js";

const requiredScenarios = [
  "skill-catalog-ok",
  "skill-load-body",
  "skill-gate-missing",
  "memory-load-unload",
  "memory-consolidation",
  "skill-write-propagation",
  "reload-persistence",
  "cache-byte-stability",
  "projection-window",
  "fail-soft",
] as const;

const scenarioAssertions: Record<(typeof requiredScenarios)[number], string[]> = {
  "skill-catalog-ok": ["catalog-ok-rendered"],
  "skill-load-body": ["skill-body-visible-to-model", "no-warning-when-present"],
  "skill-gate-missing": ["catalog-missing-rendered", "warning-verbatim", "cli-execution-blocked", "driver-not-invoked"],
  "memory-load-unload": ["unloaded-body-absent", "loaded-body-rendered", "unload-removes-body", "loaded-set-persisted"],
  "memory-consolidation": ["nohash-rejected", "search-exposes-hash", "consolidated-single-section"],
  "skill-write-propagation": ["new-skill-absent-before", "new-skill-present-after-no-reload", "skill-file-on-disk"],
  "reload-persistence": ["loaded-domain-survives-reload", "window-survives-reload", "domain-rendered-post-reload"],
  "cache-byte-stability": ["prompt-stable-across-nochange", "prompt-changes-once-after-load"],
  "projection-window": ["newest-n-full", "older-stub"],
  "fail-soft": ["before-agent-start-no-throw", "empty-catalog-on-bad-skills-dir"],
};

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

describe("knowledge semantic E2E scenarios", () => {
  it("names every knowledge semantic scenario from the design spec", () => {
    expect(requiredScenarios).toEqual([
      "skill-catalog-ok",
      "skill-load-body",
      "skill-gate-missing",
      "memory-load-unload",
      "memory-consolidation",
      "skill-write-propagation",
      "reload-persistence",
      "cache-byte-stability",
      "projection-window",
      "fail-soft",
    ]);
  });

  for (const scenario of requiredScenarios) {
    it(`passes ${scenario}`, () => {
      const artifact = readScenarioArtifact(scenario);
      expectPiSdkProvenance(artifact);
      for (const assertion of scenarioAssertions[scenario]) {
        expectSemanticPass(artifact, assertion);
      }
    });
  }

  it("captures the load-bearing knowledge strings in real readback", () => {
    const catalogOk = readScenarioArtifact("skill-catalog-ok");
    expect(textOf(evidence(catalogOk))).toContain("[drivers: nqctl OK]");

    const missing = readScenarioArtifact("skill-gate-missing");
    expect(textOf(evidence(missing))).toContain("[drivers: nqctl MISSING]");
    expect(textOf(evidence(missing))).toContain("[QUAILBOT WORKSPACE WARNING]");

    const loaded = readScenarioArtifact("memory-load-unload");
    expect(textOf(evidence(loaded))).toContain("### memory: tip-conditioning");

    const projected = readScenarioArtifact("skill-load-body");
    expect(textOf(evidence(projected))).toContain("<skill_content");
    expect(textOf(evidence(projected))).toContain("SHAKE-AND-PULSE-BODY");
  });
});
