import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createKnowledgeRuntime, hydrateKnowledgeRuntime, renderKnowledgePrefixFromRuntime } from "../../src/knowledge/knowledge-runtime.js";
import { saveKnowledgeState } from "../../src/knowledge/knowledge-state.js";

function tempCwd(): string {
  return mkdtempSync(join(tmpdir(), "qb-kr-"));
}

function writeSkill(cwd: string, name: string): void {
  const dir = join(cwd, ".quailbot-pi", "skills", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${name} desc\ndrivers: [nqctl]\n---\nbody of ${name}`, "utf8");
}

describe("knowledge-runtime", () => {
  it("hydrates loaded domains + window from disk", () => {
    const cwd = tempCwd();
    saveKnowledgeState({ loadedDomains: ["tip"], skillBodyWindow: 7 }, cwd);
    const knowledge = createKnowledgeRuntime();
    hydrateKnowledgeRuntime(knowledge, cwd);
    expect([...knowledge.loadedDomains]).toEqual(["tip"]);
    expect(knowledge.skillBodyWindow).toBe(7);
    expect(knowledge.cwd).toBe(cwd);
  });

  it("renders the prefix from disk and is byte-identical across two turns (cache stability)", () => {
    const cwd = tempCwd();
    writeSkill(cwd, "change-tip");
    const knowledge = createKnowledgeRuntime();
    hydrateKnowledgeRuntime(knowledge, cwd);
    const first = renderKnowledgePrefixFromRuntime(knowledge, undefined);
    const second = renderKnowledgePrefixFromRuntime(knowledge, undefined);
    expect(first).toBe(second);
    expect(first).toContain("- change-tip: change-tip desc [drivers: nqctl MISSING]");
  });
});
