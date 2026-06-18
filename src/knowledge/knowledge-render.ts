import type { Workspace } from "../workspace/types.js";
import type { AgentsFile } from "./agents-file.js";
import { evaluateSkillGate } from "./driver-gate.js";
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
