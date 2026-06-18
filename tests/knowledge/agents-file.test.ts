import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createAgentsFileCache, readDeployedAgentsFile } from "../../src/knowledge/agents-file.js";

function tempCwd(): string {
  return mkdtempSync(join(tmpdir(), "qb-agents-"));
}

describe("agents-file", () => {
  it("returns undefined when no AGENTS.md exists", () => {
    const cwd = tempCwd();
    expect(readDeployedAgentsFile(cwd, createAgentsFileCache())).toBeUndefined();
  });

  it("reads AGENTS.md content and caches by mtime", () => {
    const cwd = tempCwd();
    const cache = createAgentsFileCache();
    writeFileSync(join(cwd, "AGENTS.md"), "hello constitution", "utf8");
    const first = readDeployedAgentsFile(cwd, cache);
    expect(first?.content).toBe("hello constitution");
    const second = readDeployedAgentsFile(cwd, cache);
    expect(second).toBe(first);
  });

  it("re-reads when the file changes", () => {
    const cwd = tempCwd();
    const cache = createAgentsFileCache();
    const path = join(cwd, "AGENTS.md");
    writeFileSync(path, "v1", "utf8");
    expect(readDeployedAgentsFile(cwd, cache)?.content).toBe("v1");
    rmSync(path);
    writeFileSync(path, "v2-much-longer-content", "utf8");
    expect(readDeployedAgentsFile(cwd, cache)?.content).toBe("v2-much-longer-content");
  });
});
