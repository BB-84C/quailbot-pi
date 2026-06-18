import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { createKnowledgeRuntime, hydrateKnowledgeRuntime } from "../../src/knowledge/knowledge-runtime.js";
import { loadKnowledgeState } from "../../src/knowledge/knowledge-state.js";
import { saveMemoryTopic } from "../../src/knowledge/memory.js";
import { handleMemoryCommand } from "../../src/knowledge/register-memory-commands.js";

function tempCwd(): string {
  return mkdtempSync(join(tmpdir(), "qb-memcmd-"));
}
function fakeCtx() {
  return { ui: { notify: vi.fn(), custom: vi.fn() } } as never;
}
function runtimeFor(cwd: string) {
  const knowledge = createKnowledgeRuntime();
  hydrateKnowledgeRuntime(knowledge, cwd);
  return { knowledge, workspace: undefined } as never;
}

describe("handleMemoryCommand", () => {
  it("lists domains and loaded set", async () => {
    const cwd = tempCwd();
    saveMemoryTopic(cwd, "tip", "shake", "x");
    const ctx = fakeCtx();
    await handleMemoryCommand("list", ctx, runtimeFor(cwd));
    expect((ctx as { ui: { notify: ReturnType<typeof vi.fn> } }).ui.notify).toHaveBeenCalledWith(expect.stringContaining("tip"), "info");
  });

  it("loads and unloads a domain, persisting each time", async () => {
    const cwd = tempCwd();
    const runtime = runtimeFor(cwd);
    await handleMemoryCommand("load tip", fakeCtx(), runtime);
    expect(loadKnowledgeState(cwd).loadedDomains).toEqual(["tip"]);
    await handleMemoryCommand("unload tip", fakeCtx(), runtime);
    expect(loadKnowledgeState(cwd).loadedDomains).toEqual([]);
  });

  it("warns on a missing domain argument", async () => {
    const ctx = fakeCtx();
    await handleMemoryCommand("load", ctx, runtimeFor(tempCwd()));
    expect((ctx as { ui: { notify: ReturnType<typeof vi.fn> } }).ui.notify).toHaveBeenCalledWith(expect.stringContaining("Usage"), "warning");
  });

  it("rejects unsafe load domain names without persisting", async () => {
    const cwd = tempCwd();
    const ctx = fakeCtx();

    await handleMemoryCommand("load ../../x", ctx, runtimeFor(cwd));

    expect((ctx as { ui: { notify: ReturnType<typeof vi.fn> } }).ui.notify).toHaveBeenCalledWith('Invalid memory domain name: "../../x"', "warning");
    expect(loadKnowledgeState(cwd).loadedDomains).toEqual([]);
  });
});
