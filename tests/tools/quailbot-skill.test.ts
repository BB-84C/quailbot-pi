import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { contentHash } from "../../src/knowledge/consolidation.js";
import { skillFilePath } from "../../src/knowledge/skill-writer.js";
import { createSkillCache } from "../../src/knowledge/skills.js";
import { executeQuailbotSkill } from "../../src/tools/quailbot_skill.js";
import { quailbotStateRoot } from "../../src/workspace/workspace-state.js";
import type { CliParameter, Workspace } from "../../src/workspace/types.js";

function tempCwd(): string {
  return mkdtempSync(join(tmpdir(), "qb-skilltool-"));
}

function writeSkill(_cwd: string, name: string, drivers: string, frontmatterName = name): string {
  const dir = join(quailbotStateRoot(), "skills", name);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "SKILL.md");
  writeFileSync(file, `---\nname: ${frontmatterName}\ndescription: d\ndrivers: ${drivers}\n---\nBODY-${frontmatterName}`, "utf8");
  return file;
}

function workspaceWith(driver: string): Workspace {
  const ref = `${driver}:bias`;
  return {
    sourcePath: "x",
    rois: [],
    anchors: [],
    cli: {
      enabled: true,
      defaultCliName: driver,
      actions: new Map(),
      parameters: new Map([
        [
          ref,
          {
            ref,
            cliName: driver,
            name: "bias",
            enabled: true,
            actions: { get: true, set: false, ramp: false },
            linkedObservables: [],
            schema: {},
          } as CliParameter,
        ],
      ]),
    },
  };
}

describe("executeQuailbotSkill", () => {
  it("loads the body with no warning when drivers are present", () => {
    const cwd = tempCwd();
    writeSkill(cwd, "change-tip", "[nqctl]");

    const result = executeQuailbotSkill(workspaceWith("nqctl"), cwd, createSkillCache(), { name: "change-tip" });

    expect(result).toMatchObject({ ok: true, action: "quailbot_skill", action_input: { name: "change-tip" } });
    expect(result.primary_result).toMatchObject({
      name: "change-tip",
      missing: [],
      warning: undefined,
      body: "BODY-change-tip",
    });
    expect((result.primary_result as { hash?: string }).hash).toBe(contentHash(readFileSync(skillFilePath(cwd, "change-tip"), "utf8")));
    expect((result.primary_result as { hash?: string }).hash).toMatch(/^[a-f0-9]+$/);
  });

  it("hashes the discovered SKILL.md file when directory and frontmatter names differ", () => {
    const cwd = tempCwd();
    const file = writeSkill(cwd, "directory-name", "[nqctl]", "frontmatter-name");

    const result = executeQuailbotSkill(workspaceWith("nqctl"), cwd, createSkillCache(), { name: "frontmatter-name" });

    expect(result.ok).toBe(true);
    expect((result.primary_result as { hash?: string }).hash).toBe(contentHash(readFileSync(file, "utf8")));
  });

  it("includes the missing-driver warning when a driver is absent", () => {
    const cwd = tempCwd();
    writeSkill(cwd, "change-tip", "[nqctl, awg]");

    const result = executeQuailbotSkill(workspaceWith("nqctl"), cwd, createSkillCache(), { name: "change-tip" });
    const pr = result.primary_result as { missing: string[]; warning?: string };

    expect(pr.missing).toEqual(["awg"]);
    expect(pr.warning).toContain("[QUAILBOT WORKSPACE WARNING]");
  });

  it("reports not-found with the available list", () => {
    const cwd = tempCwd();
    writeSkill(cwd, "alpha", "[nqctl]");

    const result = executeQuailbotSkill(undefined, cwd, createSkillCache(), { name: "missing" });

    expect(result.ok).toBe(false);
    expect(result.primary_result).toMatchObject({ name: "missing", error: "skill_not_found", available: ["alpha"] });
  });
});
