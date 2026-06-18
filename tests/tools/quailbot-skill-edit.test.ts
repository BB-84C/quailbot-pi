import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { contentHash } from "../../src/knowledge/consolidation.js";
import { skillFilePath, writeNewSkill } from "../../src/knowledge/skill-writer.js";
import { executeQuailbotSkillEdit } from "../../src/tools/quailbot_skill_edit.js";

function tempCwd(): string {
  return mkdtempSync(join(tmpdir(), "qb-edit-"));
}

describe("executeQuailbotSkillEdit", () => {
  it("rejects a stale hash and returns the current hash for retry", () => {
    const cwd = tempCwd();
    writeNewSkill(cwd, { name: "a", description: "d", drivers: ["nqctl"], body: "old" });
    const result = executeQuailbotSkillEdit(cwd, { name: "a", expected_old_hash: "bad", description: "d", drivers: ["nqctl"], body: "new" });
    expect(result.ok).toBe(false);
    expect(result.primary_result).toMatchObject({ error: "stale_hash" });
  });

  it("consolidates when the hash matches", () => {
    const cwd = tempCwd();
    writeNewSkill(cwd, { name: "a", description: "d", drivers: ["nqctl"], body: "old" });
    const hash = contentHash(readFileSync(skillFilePath(cwd, "a"), "utf8"));
    const result = executeQuailbotSkillEdit(cwd, { name: "a", expected_old_hash: hash, description: "d", drivers: ["nqctl"], body: "consolidated" });
    expect(result.ok).toBe(true);
    expect(readFileSync(skillFilePath(cwd, "a"), "utf8")).toContain("consolidated");
  });
});
