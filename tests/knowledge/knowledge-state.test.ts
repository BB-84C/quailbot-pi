import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_SKILL_BODY_WINDOW,
  knowledgeStatePath,
  loadKnowledgeState,
  saveKnowledgeState,
} from "../../src/knowledge/knowledge-state.js";

function tempCwd(): string {
  return mkdtempSync(join(tmpdir(), "qb-knowledge-"));
}

describe("knowledge-state", () => {
  it("returns defaults when no state file exists", () => {
    const cwd = tempCwd();
    expect(loadKnowledgeState(cwd)).toEqual({ loadedDomains: [], skillBodyWindow: DEFAULT_SKILL_BODY_WINDOW });
  });

  it("round-trips state, sorting and de-duplicating loaded domains", () => {
    const cwd = tempCwd();
    saveKnowledgeState({ loadedDomains: ["b", "a", "a"], skillBodyWindow: 5 }, cwd);
    expect(loadKnowledgeState(cwd)).toEqual({ loadedDomains: ["a", "b"], skillBodyWindow: 5 });
    expect(knowledgeStatePath(cwd)).toContain(".quailbot-pi");
  });

  it("falls back to defaults on malformed json or bad window", () => {
    const cwd = tempCwd();
    mkdirSync(join(cwd, ".quailbot-pi"), { recursive: true });
    writeFileSync(knowledgeStatePath(cwd), "{not json", "utf8");
    expect(loadKnowledgeState(cwd)).toEqual({ loadedDomains: [], skillBodyWindow: DEFAULT_SKILL_BODY_WINDOW });

    saveKnowledgeState({ loadedDomains: [], skillBodyWindow: 0 }, cwd);
    expect(loadKnowledgeState(cwd).skillBodyWindow).toBe(DEFAULT_SKILL_BODY_WINDOW);
    expect(readFileSync(knowledgeStatePath(cwd), "utf8").endsWith("\n")).toBe(true);
  });
});
