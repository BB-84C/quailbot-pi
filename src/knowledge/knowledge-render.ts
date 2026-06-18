import type { Workspace } from "../workspace/types.js";
import type { AgentsFile } from "./agents-file.js";
import { evaluateSkillGate } from "./driver-gate.js";
import { listMemoryDomains, readMemoryDomain } from "./memory.js";
import type { SkillInfo } from "./skills.js";

export function renderSkillCatalog(skills: SkillInfo[], workspace: Workspace | undefined): string {
  if (skills.length === 0) {
    return "QUAILBOT SKILLS\nNo skills are currently registered.";
  }
  const lines = ["QUAILBOT SKILLS", "Use the quailbot_skill tool to load a skill by name."];
  for (const skill of [...skills].sort((a, b) => a.name.localeCompare(b.name))) {
    const gate = evaluateSkillGate(workspace, skill);
    const status = gate.missing.length === 0 ? "OK" : "MISSING";
    lines.push(`- ${skill.name}: ${skill.description} [drivers: ${gate.required.join(", ")} ${status}]`);
  }
  return lines.join("\n");
}

export function renderAgentsSection(agentsFile: AgentsFile | undefined): string | undefined {
  if (!agentsFile) {
    return undefined;
  }
  return `QUAILBOT AGENTS GUIDANCE (${agentsFile.path})\n${agentsFile.content}`;
}

export function renderMemorySection(cwd: string, loadedDomains: Set<string>): string | undefined {
  const domains = listMemoryDomains(cwd);
  if (domains.length === 0) {
    return undefined;
  }
  const loaded = [...loadedDomains].filter((domain) => domains.includes(domain)).sort();
  const lines = [
    "QUAILBOT MEMORY",
    `Available domains: ${domains.join(", ")}`,
    `Loaded: ${loaded.length > 0 ? loaded.join(", ") : "(none)"}`,
    "Load a domain with /quailbot-memory or quailbot_memory_load; search all with quailbot_memory_search.",
  ];
  for (const domain of loaded) {
    const doc = readMemoryDomain(cwd, domain);
    if (doc && doc.content.trim().length > 0) {
      lines.push("", `### memory: ${domain}`, doc.content.trim());
    }
  }
  return lines.join("\n");
}

export function renderKnowledgePrefix(input: {
  agentsFile: AgentsFile | undefined;
  skills: SkillInfo[];
  workspace: Workspace | undefined;
  memorySection?: string;
}): string {
  return [
    renderAgentsSection(input.agentsFile),
    renderSkillCatalog(input.skills, input.workspace),
    input.memorySection,
  ]
    .filter((section): section is string => typeof section === "string" && section.length > 0)
    .join("\n\n");
}
