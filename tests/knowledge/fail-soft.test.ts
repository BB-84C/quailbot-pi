import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createAgentsFileCache, readDeployedAgentsFile } from "../../src/knowledge/agents-file.js";
import { createKnowledgeRuntime, hydrateKnowledgeRuntime, renderKnowledgePrefixFromRuntime } from "../../src/knowledge/knowledge-runtime.js";
import { listMemoryDomains } from "../../src/knowledge/memory.js";
import { createSkillCache, discoverSkills } from "../../src/knowledge/skills.js";

function tempCwd(): string {
  return mkdtempSync(join(tmpdir(), "qb-failsoft-"));
}

describe("fail-soft knowledge reads", () => {
  it("treats a file at .quailbot-pi/skills as no skills", () => {
    const cwd = tempCwd();
    mkdirSync(join(cwd, ".quailbot-pi"), { recursive: true });
    writeFileSync(join(cwd, ".quailbot-pi", "skills"), "not a directory", "utf8");

    expect(discoverSkills(cwd, createSkillCache())).toEqual([]);
    const knowledge = createKnowledgeRuntime();
    hydrateKnowledgeRuntime(knowledge, cwd);
    expect(() => renderKnowledgePrefixFromRuntime(knowledge, undefined)).not.toThrow();
  });

  it("treats a file at .quailbot-pi/memory as no memory domains", () => {
    const cwd = tempCwd();
    mkdirSync(join(cwd, ".quailbot-pi"), { recursive: true });
    writeFileSync(join(cwd, ".quailbot-pi", "memory"), "not a directory", "utf8");

    expect(listMemoryDomains(cwd)).toEqual([]);
  });

  it("treats unreadable AGENTS.md content as absent", () => {
    const cwd = tempCwd();
    mkdirSync(join(cwd, "AGENTS.md"));

    expect(readDeployedAgentsFile(cwd, createAgentsFileCache())).toBeUndefined();
  });
});
