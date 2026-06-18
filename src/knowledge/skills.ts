import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { quailbotStateRoot } from "../workspace/workspace-state.js";
import { isSafeKnowledgeName } from "./safe-name.js";

export type SkillInfo = {
  name: string;
  description: string;
  drivers: string[];
  domain?: string;
  body: string;
};

export type SkillCache = { entries: Map<string, { signature: string; skill: SkillInfo }> };

export function createSkillCache(): SkillCache {
  return { entries: new Map() };
}

export function skillsRoot(cwd: string): string {
  return join(quailbotStateRoot(cwd), "skills");
}

export function discoverSkills(cwd: string, cache: SkillCache): SkillInfo[] {
  const root = skillsRoot(cwd);
  if (!existsSync(root)) {
    return [];
  }
  const skills: SkillInfo[] = [];
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const file = join(root, entry.name, "SKILL.md");
    if (!existsSync(file)) {
      continue;
    }
    try {
      const stats = statSync(file);
      const signature = `${stats.mtimeMs}:${stats.size}`;
      const cached = cache.entries.get(file);
      if (cached && cached.signature === signature) {
        skills.push(cached.skill);
        continue;
      }
      const parsed = parseSkillFile(readFileSync(file, "utf8"));
      if (!parsed) {
        cache.entries.delete(file);
        continue;
      }
      cache.entries.set(file, { signature, skill: parsed });
      skills.push(parsed);
    } catch {
      cache.entries.delete(file);
    }
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

export function parseSkillFile(content: string): SkillInfo | undefined {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(content);
  if (!match) {
    return undefined;
  }
  const [, frontmatter, body] = match;
  const fields = parseFrontmatter(frontmatter);
  const name = fields.name;
  const description = fields.description;
  const drivers = fields.drivers;
  if (typeof name !== "string" || !isSafeKnowledgeName(name)) {
    return undefined;
  }
  if (typeof description !== "string" || description.length === 0) {
    return undefined;
  }
  if (!Array.isArray(drivers) || drivers.length === 0) {
    return undefined;
  }
  const skill: SkillInfo = {
    name,
    description,
    drivers: [...drivers].map((d) => String(d)).sort(),
    body: body.trim(),
  };
  if (typeof fields.domain === "string" && fields.domain.length > 0) {
    skill.domain = fields.domain;
  }
  return skill;
}

function parseFrontmatter(text: string): Record<string, string | string[]> {
  const fields: Record<string, string | string[]> = {};
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }
    const colon = line.indexOf(":");
    if (colon === -1) {
      continue;
    }
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (value.startsWith("[") && value.endsWith("]")) {
      fields[key] = value
        .slice(1, -1)
        .split(",")
        .map((item) => item.trim().replace(/^["']|["']$/g, ""))
        .filter((item) => item.length > 0);
    } else {
      fields[key] = value.replace(/^["']|["']$/g, "");
    }
  }
  return fields;
}
