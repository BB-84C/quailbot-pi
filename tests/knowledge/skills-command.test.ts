import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { createKnowledgeRuntime, hydrateKnowledgeRuntime } from "../../src/knowledge/knowledge-runtime.js";
import { loadKnowledgeState } from "../../src/knowledge/knowledge-state.js";
import { handleSkillsCommand } from "../../src/knowledge/register-knowledge-commands.js";
import { quailbotStateRoot } from "../../src/workspace/workspace-state.js";

function tempCwd(): string {
  return mkdtempSync(join(tmpdir(), "qb-cmd-"));
}
function writeSkill(_cwd: string, name: string): void {
  const dir = join(quailbotStateRoot(), "skills", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: d\ndrivers: [nqctl]\n---\nbody`, "utf8");
}
function fakeCtx() {
  return { ui: { notify: vi.fn() }, reload: vi.fn() } as never;
}
function runtimeFor(cwd: string) {
  const knowledge = createKnowledgeRuntime();
  hydrateKnowledgeRuntime(knowledge, cwd);
  return { knowledge, workspace: undefined } as never;
}

describe("handleSkillsCommand", () => {
  it("lists the catalog", async () => {
    const cwd = tempCwd();
    writeSkill(cwd, "change-tip");
    const runtime = runtimeFor(cwd);
    const ctx = fakeCtx();
    await handleSkillsCommand("list", ctx, runtime);
    expect((ctx as { ui: { notify: ReturnType<typeof vi.fn> } }).ui.notify).toHaveBeenCalledWith(expect.stringContaining("change-tip"), "info");
  });

  it("sets and persists the skill-body window", async () => {
    const cwd = tempCwd();
    const runtime = runtimeFor(cwd);
    await handleSkillsCommand("window 5", fakeCtx(), runtime);
    expect((runtime as { knowledge: { skillBodyWindow: number } }).knowledge.skillBodyWindow).toBe(5);
    expect(loadKnowledgeState(cwd).skillBodyWindow).toBe(5);
  });

  it("rejects a non-positive window", async () => {
    const cwd = tempCwd();
    const runtime = runtimeFor(cwd);
    const ctx = fakeCtx();
    await handleSkillsCommand("window 0", ctx, runtime);
    expect((ctx as { ui: { notify: ReturnType<typeof vi.fn> } }).ui.notify).toHaveBeenCalledWith(expect.stringContaining("positive"), "warning");
  });
});
