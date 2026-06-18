import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { contentHash } from "./consolidation.js";
import { isSafeKnowledgeName } from "./safe-name.js";
import { skillsRoot } from "./skills.js";

export type SkillWriteInput = {
  name: string;
  description: string;
  drivers: string[];
  domain?: string;
  body: string;
};

export function skillFilePath(cwd: string, name: string): string {
  return join(skillsRoot(cwd), name, "SKILL.md");
}

export function renderSkillFile(input: SkillWriteInput): string {
  const lines = ["---", `name: ${input.name}`, `description: ${input.description}`, `drivers: [${[...input.drivers].sort().join(", ")}]`];
  if (input.domain) {
    lines.push(`domain: ${input.domain}`);
  }
  lines.push("---", input.body.trim(), "");
  return lines.join("\n");
}

function invalid(input: SkillWriteInput): boolean {
  return (
    !input.name ||
    !isSafeKnowledgeName(input.name) ||
    !input.description ||
    !Array.isArray(input.drivers) ||
    input.drivers.length === 0 ||
    input.drivers.some((driver) => typeof driver !== "string" || driver.length === 0)
  );
}

export function writeNewSkill(cwd: string, input: SkillWriteInput): { created: boolean; path: string; error?: string } {
  const path = skillFilePath(cwd, input.name);
  if (invalid(input)) {
    return { created: false, path, error: "invalid_input" };
  }
  if (existsSync(path)) {
    return { created: false, path, error: "skill_exists" };
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, renderSkillFile(input), "utf8");
  return { created: true, path };
}

export function editSkill(
  cwd: string,
  name: string,
  expectedOldHash: string,
  input: SkillWriteInput,
): { updated: boolean; path: string; error?: string; currentHash?: string } {
  const path = skillFilePath(cwd, name);
  if (invalid(input)) {
    return { updated: false, path, error: "invalid_input" };
  }
  if (!existsSync(path)) {
    return { updated: false, path, error: "skill_not_found" };
  }
  const current = readFileSync(path, "utf8");
  const currentHash = contentHash(current);
  if (currentHash !== expectedOldHash) {
    return { updated: false, path, error: "stale_hash", currentHash };
  }
  writeFileSync(path, renderSkillFile(input), "utf8");
  return { updated: true, path };
}
