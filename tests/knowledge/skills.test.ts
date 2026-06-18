import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createSkillCache, discoverSkills, parseSkillFile } from "../../src/knowledge/skills.js";

function tempCwd(): string {
  return mkdtempSync(join(tmpdir(), "qb-skills-"));
}

function writeSkill(cwd: string, name: string, body: string): void {
  const dir = join(cwd, ".quailbot-pi", "skills", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), body, "utf8");
}

describe("parseSkillFile", () => {
  it("parses frontmatter and body", () => {
    const parsed = parseSkillFile(
      "---\nname: change-tip\ndescription: Change the STM tip\ndrivers: [nqctl, other]\ndomain: tip-conditioning\n---\nThe procedure.",
    );
    expect(parsed).toEqual({
      name: "change-tip",
      description: "Change the STM tip",
      drivers: ["nqctl", "other"],
      domain: "tip-conditioning",
      body: "The procedure.",
    });
  });

  it("rejects missing name or empty drivers", () => {
    expect(parseSkillFile("---\ndescription: x\ndrivers: [a]\n---\nbody")).toBeUndefined();
    expect(parseSkillFile("---\nname: x\ndescription: y\ndrivers: []\n---\nbody")).toBeUndefined();
  });
});

describe("discoverSkills", () => {
  it("discovers and sorts skills by name, skipping invalid ones", () => {
    const cwd = tempCwd();
    writeSkill(cwd, "zeta", "---\nname: zeta\ndescription: Z\ndrivers: [nqctl]\n---\nz");
    writeSkill(cwd, "alpha", "---\nname: alpha\ndescription: A\ndrivers: [nqctl]\n---\na");
    writeSkill(cwd, "broken", "no frontmatter");
    const skills = discoverSkills(cwd, createSkillCache());
    expect(skills.map((s) => s.name)).toEqual(["alpha", "zeta"]);
  });

  it("returns [] when the skills dir is absent", () => {
    expect(discoverSkills(tempCwd(), createSkillCache())).toEqual([]);
  });
});
