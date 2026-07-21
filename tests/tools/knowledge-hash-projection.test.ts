import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createKnowledgeRuntime, hydrateKnowledgeRuntime } from "../../src/knowledge/knowledge-runtime.js";
import { writeNewSkill } from "../../src/knowledge/skill-writer.js";
import { createSkillCache } from "../../src/knowledge/skills.js";
import { executeQuailbotMemoryLoad } from "../../src/tools/quailbot_memory_load.js";
import { executeQuailbotMemorySave } from "../../src/tools/quailbot_memory_save.js";
import { executeQuailbotMemorySearch } from "../../src/tools/quailbot_memory_search.js";
import { executeQuailbotSkill } from "../../src/tools/quailbot_skill.js";
import { executeQuailbotSkillEdit } from "../../src/tools/quailbot_skill_edit.js";
import { buildQuailbotToolContent } from "../../src/tools/tool-result-projection.js";

function tempCwd(): string {
  return mkdtempSync(join(tmpdir(), "qb-knowledge-hash-"));
}

function runtimeFor(cwd: string) {
  const knowledge = createKnowledgeRuntime();
  hydrateKnowledgeRuntime(knowledge, cwd);
  return knowledge;
}

function renderedHash(content: string, field: "content_hash" | "hash"): string {
  const match = content.match(new RegExp(`${field}: ([a-f0-9]{16})`));
  expect(match).not.toBeNull();
  return match![1];
}

describe("knowledge hash projections", () => {
  it("renders a skill content hash that supports an edit and reports a stale retry", () => {
    const cwd = tempCwd();
    writeNewSkill(cwd, { name: "approach", description: "d", drivers: ["nqctl"], body: "initial body" });

    const loaded = executeQuailbotSkill(undefined, cwd, createSkillCache(), { name: "approach" });
    const loadedText = buildQuailbotToolContent(loaded, { mode: "recent-full" });
    const expectedOldHash = renderedHash(loadedText, "content_hash");

    const updated = executeQuailbotSkillEdit(cwd, {
      name: "approach",
      expected_old_hash: expectedOldHash,
      description: "d",
      drivers: ["nqctl"],
      body: "updated body",
    });
    expect(updated.ok).toBe(true);

    const stale = executeQuailbotSkillEdit(cwd, {
      name: "approach",
      expected_old_hash: expectedOldHash,
      description: "d",
      drivers: ["nqctl"],
      body: "stale retry",
    });
    const staleText = buildQuailbotToolContent(stale);

    expect(staleText).toContain("error: stale_hash");
    expect(staleText).toMatch(/currentHash: [a-f0-9]{16}/);
    expect(staleText).toContain("name: approach");
    expect(staleText).toContain("path:");
    expect(staleText).not.toContain("stdout_preview: <empty>");
  });

  it("renders memory hashes from load and search for conflict-safe saves", () => {
    const cwd = tempCwd();
    const created = executeQuailbotMemorySave(cwd, { domain: "tip", topic: "shake", body: "v1" });
    expect(created.ok).toBe(true);

    const loaded = executeQuailbotMemoryLoad(runtimeFor(cwd), "tip");
    const loadedText = buildQuailbotToolContent(loaded);
    expect(loadedText).toContain("topic: shake");
    const loadedHash = renderedHash(loadedText, "hash");

    const searched = executeQuailbotMemorySearch(cwd, { query: "shake" });
    const searchedText = buildQuailbotToolContent(searched);
    const expectedOldHash = renderedHash(searchedText, "hash");
    expect(loadedHash).toBe(expectedOldHash);
    expect(searchedText).toContain("domain: tip");
    expect(searchedText).toContain("topic: shake");

    const missing = executeQuailbotMemorySave(cwd, { domain: "tip", topic: "shake", body: "v2" });
    const missingText = buildQuailbotToolContent(missing);
    expect(missingText).toContain("status: missing_hash");
    expect(missingText).toMatch(/currentHash: [a-f0-9]{16}/);
    expect(missingText).toContain("domain: tip");
    expect(missingText).toContain("topic: shake");
    expect(missingText).not.toContain("stdout_preview: <empty>");

    const updated = executeQuailbotMemorySave(cwd, {
      domain: "tip",
      topic: "shake",
      body: "v2",
      expected_old_hash: expectedOldHash,
    });
    expect(updated.ok).toBe(true);

    const stale = executeQuailbotMemorySave(cwd, {
      domain: "tip",
      topic: "shake",
      body: "stale retry",
      expected_old_hash: expectedOldHash,
    });
    const staleText = buildQuailbotToolContent(stale);
    expect(staleText).toContain("status: stale_hash");
    expect(staleText).toMatch(/currentHash: [a-f0-9]{16}/);
    expect(staleText).toContain("domain: tip");
    expect(staleText).toContain("topic: shake");
    expect(staleText).not.toContain("stdout_preview: <empty>");
  });
});
