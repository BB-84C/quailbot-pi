import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { contentHash } from "../../src/knowledge/consolidation.js";
import { editSkill, renderSkillFile, skillFilePath, writeNewSkill } from "../../src/knowledge/skill-writer.js";
import { parseSkillFile } from "../../src/knowledge/skills.js";

function tempCwd(): string {
  return mkdtempSync(join(tmpdir(), "qb-writer-"));
}

function pointStateAtFile(): string {
  const stateAsFile = mkdtempSync(join(tmpdir(), "qb-skill-fs-")) + ".lock";
  writeFileSync(stateAsFile, "this is a file, not a directory", "utf8");
  process.env.QUAILBOT_PI_STATE_DIR = stateAsFile;
  return stateAsFile;
}

describe("skill-writer", () => {
  it("renders a parseable SKILL.md", () => {
    const text = renderSkillFile({ name: "change-tip", description: "d", drivers: ["nqctl"], domain: "tip", body: "Procedure." });
    expect(parseSkillFile(text)).toEqual({ name: "change-tip", description: "d", drivers: ["nqctl"], domain: "tip", body: "Procedure." });
  });

  it("creates a new skill, refuses to overwrite, validates input", () => {
    const cwd = tempCwd();
    expect(writeNewSkill(cwd, { name: "a", description: "d", drivers: ["nqctl"], body: "x" })).toMatchObject({ created: true });
    expect(parseSkillFile(readFileSync(skillFilePath(cwd, "a"), "utf8"))?.name).toBe("a");
    expect(writeNewSkill(cwd, { name: "a", description: "d", drivers: ["nqctl"], body: "y" })).toMatchObject({ created: false, error: "skill_exists" });
    expect(writeNewSkill(cwd, { name: "b", description: "", drivers: ["nqctl"], body: "x" })).toMatchObject({ created: false, error: "invalid_input" });
    expect(writeNewSkill(cwd, { name: "c", description: "d", drivers: [], body: "x" })).toMatchObject({ created: false, error: "invalid_input" });
  });

  it("rejects unsafe skill names", () => {
    const cwd = tempCwd();
    expect(writeNewSkill(cwd, { name: "../../x", description: "d", drivers: ["nqctl"], body: "x" })).toMatchObject({
      created: false,
      error: "invalid_input",
    });
  });

  it("rejects unsafe editSkill target names", () => {
    const cwd = tempCwd();
    expect(editSkill(cwd, "../../x", "anyhash", { name: "x", description: "d", drivers: ["nqctl"], body: "x" })).toEqual({
      updated: false,
      path: "",
      error: "invalid_input",
    });
  });

  it("edits only when expectedOldHash matches (consolidation, anti-clobber)", () => {
    const cwd = tempCwd();
    writeNewSkill(cwd, { name: "a", description: "d", drivers: ["nqctl"], body: "old" });
    const current = readFileSync(skillFilePath(cwd, "a"), "utf8");
    expect(editSkill(cwd, "a", "deadbeef", { name: "a", description: "d", drivers: ["nqctl"], body: "new" })).toMatchObject({ updated: false, error: "stale_hash" });
    const ok = editSkill(cwd, "a", contentHash(current), { name: "a", description: "d2", drivers: ["nqctl"], body: "consolidated" });
    expect(ok).toMatchObject({ updated: true });
    expect(parseSkillFile(readFileSync(skillFilePath(cwd, "a"), "utf8"))).toMatchObject({ description: "d2", body: "consolidated" });
  });

  it("returns a structured filesystem_error result instead of throwing when the skills directory cannot be created", () => {
    // Point the state root at a regular file so mkdirSync on skills/ fails.
    // writeNewSkill must surface the typed filesystem_error result, not
    // throw a raw Node exception.
    const cwd = tempCwd();
    const priorEnv = process.env.QUAILBOT_PI_STATE_DIR;
    pointStateAtFile();
    try {
      const result = writeNewSkill(cwd, { name: "change-tip", description: "d", drivers: ["nqctl"], body: "x" });
      expect(result.created).toBe(false);
      expect(result.error).toBe("filesystem_error");
      expect(result.errorMessage).toBeDefined();
      if (result.errorCode !== undefined) {
        expect(typeof result.errorCode).toBe("string");
      }
    } finally {
      if (priorEnv === undefined) {
        delete process.env.QUAILBOT_PI_STATE_DIR;
      } else {
        process.env.QUAILBOT_PI_STATE_DIR = priorEnv;
      }
    }
  });
});
