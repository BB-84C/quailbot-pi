import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  listMemoryDomains,
  parseMemorySections,
  readMemoryDomain,
  saveMemoryTopic,
  searchMemory,
} from "../../src/knowledge/memory.js";

function tempCwd(): string {
  return mkdtempSync(join(tmpdir(), "qb-mem-"));
}

describe("memory store", () => {
  it("creates a topic, lists the domain, and parses sections", () => {
    const cwd = tempCwd();
    const created = saveMemoryTopic(cwd, "tip-conditioning", "shake gains", "Ramp integral gain to max over ~1s.");
    expect(created.status).toBe("created");
    expect(listMemoryDomains(cwd)).toEqual(["tip-conditioning"]);
    const doc = readMemoryDomain(cwd, "tip-conditioning");
    expect(doc?.sections).toHaveLength(1);
    expect(doc?.sections[0]).toMatchObject({ topic: "shake gains" });
  });

  it("consolidates an existing topic only when expected_old_hash matches", () => {
    const cwd = tempCwd();
    saveMemoryTopic(cwd, "d", "t", "old body");
    const hash = readMemoryDomain(cwd, "d")!.sections[0].hash;
    expect(saveMemoryTopic(cwd, "d", "t", "new", "wrong").status).toBe("stale_hash");
    expect(saveMemoryTopic(cwd, "d", "t", "consolidated body").status).toBe("missing_hash");
    expect(saveMemoryTopic(cwd, "d", "t", "consolidated body", hash).status).toBe("updated");
    expect(readMemoryDomain(cwd, "d")!.sections[0].body).toBe("consolidated body");
  });

  it("flags a date-like topic with an advisory warning", () => {
    const cwd = tempCwd();
    const result = saveMemoryTopic(cwd, "d", "2026-06-18", "a dated note");
    expect(result.status).toBe("created");
    expect(result.warning).toContain("topical heading");
  });

  it("searches across domains by topic and body", () => {
    const cwd = tempCwd();
    saveMemoryTopic(cwd, "approach", "fast approach", "Use coarse steps then fine.");
    saveMemoryTopic(cwd, "tip", "shake", "Ramp gain to maximum.");
    const matches = searchMemory(cwd, "ramp");
    expect(matches).toEqual([{ domain: "tip", topic: "shake", snippet: "Ramp gain to maximum." }]);
    expect(parseMemorySections("## a\n\nbody a\n\n## b\n\nbody b").map((s) => s.topic)).toEqual(["a", "b"]);
    expect(readFileSync(join(cwd, ".quailbot-pi", "memory", "tip.md"), "utf8")).toContain("## shake");
  });
});
