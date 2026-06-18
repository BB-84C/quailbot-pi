import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { renderMemorySection } from "../../src/knowledge/knowledge-render.js";
import { createKnowledgeRuntime, hydrateKnowledgeRuntime, renderKnowledgePrefixFromRuntime } from "../../src/knowledge/knowledge-runtime.js";
import { saveKnowledgeState } from "../../src/knowledge/knowledge-state.js";
import { saveMemoryTopic } from "../../src/knowledge/memory.js";

function tempCwd(): string {
  return mkdtempSync(join(tmpdir(), "qb-memrender-"));
}

describe("renderMemorySection", () => {
  it("returns undefined when there are no domains", () => {
    expect(renderMemorySection(tempCwd(), new Set())).toBeUndefined();
  });

  it("lists all domains, marks loaded, and inlines loaded bodies", () => {
    const cwd = tempCwd();
    saveMemoryTopic(cwd, "tip", "shake", "Ramp gain to max.");
    saveMemoryTopic(cwd, "approach", "coarse", "Coarse then fine.");
    const section = renderMemorySection(cwd, new Set(["tip"]))!;
    expect(section).toContain("Available domains: approach, tip");
    expect(section).toContain("Loaded: tip");
    expect(section).toContain("### memory: tip");
    expect(section).toContain("Ramp gain to max.");
    expect(section).not.toContain("Coarse then fine.");
  });
});

describe("renderKnowledgePrefixFromRuntime with memory", () => {
  it("includes loaded memory and is byte-identical across turns", () => {
    const cwd = tempCwd();
    saveMemoryTopic(cwd, "tip", "shake", "Ramp gain to max.");
    saveKnowledgeState({ loadedDomains: ["tip"], skillBodyWindow: 3 }, cwd);
    const knowledge = createKnowledgeRuntime();
    hydrateKnowledgeRuntime(knowledge, cwd);
    const first = renderKnowledgePrefixFromRuntime(knowledge, undefined);
    expect(first).toBe(renderKnowledgePrefixFromRuntime(knowledge, undefined));
    expect(first).toContain("### memory: tip");
  });
});
