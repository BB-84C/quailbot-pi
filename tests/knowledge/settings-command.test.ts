import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { createKnowledgeRuntime, hydrateKnowledgeRuntime } from "../../src/knowledge/knowledge-runtime.js";
import { loadKnowledgeState } from "../../src/knowledge/knowledge-state.js";
import { handleSettingsCommand } from "../../src/knowledge/register-settings-commands.js";

function tempCwd(): string {
  return mkdtempSync(join(tmpdir(), "qb-settingscmd-"));
}

function fakeCtx() {
  return { ui: { notify: vi.fn(), custom: vi.fn(), editor: vi.fn() } } as never;
}

function runtimeFor(cwd: string) {
  const knowledge = createKnowledgeRuntime();
  hydrateKnowledgeRuntime(knowledge, cwd);
  return { knowledge, workspace: undefined } as never;
}

describe("handleSettingsCommand", () => {
  it("sets and persists context pruning windows", async () => {
    const cwd = tempCwd();
    const runtime = runtimeFor(cwd);

    await handleSettingsCommand("cli-window 12", fakeCtx(), runtime);
    await handleSettingsCommand("image-window 6", fakeCtx(), runtime);

    expect((runtime as { knowledge: { recentFullCliResultWindow: number; recentImageResultWindow: number } }).knowledge.recentFullCliResultWindow).toBe(12);
    expect((runtime as { knowledge: { recentFullCliResultWindow: number; recentImageResultWindow: number } }).knowledge.recentImageResultWindow).toBe(6);
    expect(loadKnowledgeState(cwd)).toMatchObject({
      recentFullCliResultWindow: 12,
      recentImageResultWindow: 6,
    });
  });

  it("reports current settings", async () => {
    const ctx = fakeCtx();
    await handleSettingsCommand("show", ctx, runtimeFor(tempCwd()));
    expect((ctx as { ui: { notify: ReturnType<typeof vi.fn> } }).ui.notify).toHaveBeenCalledWith(expect.stringContaining("direct CLI result window"), "info");
  });

  it("rejects invalid window values", async () => {
    const ctx = fakeCtx();
    await handleSettingsCommand("cli-window 0", ctx, runtimeFor(tempCwd()));
    expect((ctx as { ui: { notify: ReturnType<typeof vi.fn> } }).ui.notify).toHaveBeenCalledWith(expect.stringContaining("usage"), "warning");
  });
});
