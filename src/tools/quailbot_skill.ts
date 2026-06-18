import { buildMissingDriverWarning, evaluateSkillGate } from "../knowledge/driver-gate.js";
import { discoverSkills, type SkillCache } from "../knowledge/skills.js";
import type { Workspace } from "../workspace/types.js";
import type { QuailbotToolResult } from "./tool-result.js";

export type QuailbotSkillParams = { name: string };

export function executeQuailbotSkill(
  workspace: Workspace | undefined,
  cwd: string,
  skillCache: SkillCache,
  params: QuailbotSkillParams,
): QuailbotToolResult {
  const skills = discoverSkills(cwd, skillCache);
  const skill = skills.find((entry) => entry.name === params.name);
  if (!skill) {
    return {
      ok: false,
      action: "quailbot_skill",
      action_input: params,
      primary_result: { name: params.name, error: "skill_not_found", available: skills.map((entry) => entry.name) },
    };
  }

  const gate = evaluateSkillGate(workspace, skill);
  const warning = gate.missing.length > 0 ? buildMissingDriverWarning(skill.name, gate.required, gate.missing) : undefined;

  return {
    ok: true,
    action: "quailbot_skill",
    action_input: params,
    primary_result: { name: skill.name, required: gate.required, missing: gate.missing, warning, body: skill.body },
  };
}
