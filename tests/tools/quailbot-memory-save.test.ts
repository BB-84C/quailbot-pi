import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { readMemoryDomain } from "../../src/knowledge/memory.js";
import { executeQuailbotMemorySave } from "../../src/tools/quailbot_memory_save.js";

function tempCwd(): string {
  return mkdtempSync(join(tmpdir(), "qb-memsave-"));
}

describe("executeQuailbotMemorySave", () => {
  it("creates a new topic", () => {
    const cwd = tempCwd();
    const result = executeQuailbotMemorySave(cwd, { domain: "tip", topic: "shake", body: "Ramp gain." });
    expect(result).toMatchObject({ ok: true, action: "quailbot_memory_save" });
    expect(result.primary_result).toMatchObject({ status: "created", domain: "tip", topic: "shake" });
  });

  it("requires expected_old_hash to overwrite an existing topic", () => {
    const cwd = tempCwd();
    executeQuailbotMemorySave(cwd, { domain: "tip", topic: "shake", body: "v1" });
    const stale = executeQuailbotMemorySave(cwd, { domain: "tip", topic: "shake", body: "v2" });
    expect(stale.ok).toBe(false);
    expect(stale.primary_result).toMatchObject({ status: "missing_hash" });
    const hash = readMemoryDomain(cwd, "tip")!.sections[0].hash;
    const ok = executeQuailbotMemorySave(cwd, { domain: "tip", topic: "shake", body: "v2", expected_old_hash: hash });
    expect(ok.ok).toBe(true);
    expect(ok.primary_result).toMatchObject({ status: "updated" });
  });
});
