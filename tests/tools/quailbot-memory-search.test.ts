import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { saveMemoryTopic } from "../../src/knowledge/memory.js";
import { executeQuailbotMemorySearch } from "../../src/tools/quailbot_memory_search.js";

function tempCwd(): string {
  return mkdtempSync(join(tmpdir(), "qb-memsearch-"));
}

describe("executeQuailbotMemorySearch", () => {
  it("returns matches with domain, topic, and snippet", () => {
    const cwd = tempCwd();
    saveMemoryTopic(cwd, "tip", "shake", "Ramp the integral gain to maximum.");
    const result = executeQuailbotMemorySearch(cwd, { query: "integral gain" });
    expect(result).toMatchObject({ ok: true, action: "quailbot_memory_search" });
    expect(result.primary_result).toMatchObject({ query: "integral gain", count: 1 });
    expect((result.primary_result as { matches: Array<{ domain: string }> }).matches[0]).toMatchObject({
      domain: "tip",
      topic: "shake",
    });
  });
});
