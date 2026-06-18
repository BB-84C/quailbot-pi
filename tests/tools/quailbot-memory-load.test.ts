import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createKnowledgeRuntime, hydrateKnowledgeRuntime } from "../../src/knowledge/knowledge-runtime.js";
import { loadKnowledgeState } from "../../src/knowledge/knowledge-state.js";
import { saveMemoryTopic } from "../../src/knowledge/memory.js";
import { executeQuailbotMemoryLoad, executeQuailbotMemoryUnload } from "../../src/tools/quailbot_memory_load.js";

function runtimeFor(cwd: string) {
  const knowledge = createKnowledgeRuntime();
  hydrateKnowledgeRuntime(knowledge, cwd);
  return knowledge;
}

function tempCwd(): string {
  return mkdtempSync(join(tmpdir(), "qb-memload-"));
}

describe("memory load/unload", () => {
  it("loads a known domain and persists the set", () => {
    const cwd = tempCwd();
    saveMemoryTopic(cwd, "tip", "shake", "Ramp gain.");
    const knowledge = runtimeFor(cwd);
    const result = executeQuailbotMemoryLoad(knowledge, "tip");
    expect(result.primary_result).toMatchObject({ domain: "tip", loaded: ["tip"], known: true });
    expect(loadKnowledgeState(cwd).loadedDomains).toEqual(["tip"]);
  });

  it("warns when loading a domain with no file yet, and unloads", () => {
    const cwd = tempCwd();
    const knowledge = runtimeFor(cwd);
    const loaded = executeQuailbotMemoryLoad(knowledge, "ghost");
    expect((loaded.primary_result as { warning?: string }).warning).toContain("No memory file");
    const unloaded = executeQuailbotMemoryUnload(knowledge, "ghost");
    expect(unloaded.primary_result).toMatchObject({ domain: "ghost", loaded: [] });
    expect(loadKnowledgeState(cwd).loadedDomains).toEqual([]);
  });

  it("rejects unsafe domains without persisting them", () => {
    const cwd = tempCwd();
    const knowledge = runtimeFor(cwd);
    const loaded = executeQuailbotMemoryLoad(knowledge, "../../escape");
    expect(loaded).toMatchObject({
      ok: false,
      primary_result: { domain: "../../escape", error: "invalid_name" },
    });
    expect(loadKnowledgeState(cwd).loadedDomains).toEqual([]);
    const unloaded = executeQuailbotMemoryUnload(knowledge, "../../escape");
    expect(unloaded).toMatchObject({
      ok: false,
      primary_result: { domain: "../../escape", error: "invalid_name" },
    });
  });
});
