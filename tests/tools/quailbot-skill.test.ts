import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createSkillCache } from "../../src/knowledge/skills.js";
import { executeQuailbotSkill } from "../../src/tools/quailbot_skill.js";
import type { CliParameter, Workspace } from "../../src/workspace/types.js";

function tempCwd(): string {
  return mkdtempSync(join(tmpdir(), "qb-skilltool-"));
}

function writeSkill(cwd: string, name: string, drivers: string): void {
  const dir = join(cwd, ".quailbot-pi", "skills", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: d\ndrivers: ${drivers}\n---\nBODY-${name}`, "utf8");
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
