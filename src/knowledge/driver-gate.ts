import type { Workspace } from "../workspace/types.js";
import type { SkillInfo } from "./skills.js";

export function driverPresent(workspace: Workspace | undefined, driver: string): boolean {
  if (!workspace || !workspace.cli.enabled) {
    return false;
  }
  for (const param of workspace.cli.parameters.values()) {
    if (param.enabled && param.cliName === driver) {
      return true;
    }
  }
  for (const action of workspace.cli.actions.values()) {
    if (action.enabled && action.cliName === driver) {
      return true;
    }
  }
  return false;
}

export type SkillGate = { required: string[]; missing: string[] };

export function evaluateSkillGate(workspace: Workspace | undefined, skill: SkillInfo): SkillGate {
  const required = [...skill.drivers].sort();
  const missing = required.filter((driver) => !driverPresent(workspace, driver));
  return { required, missing };
}

export function buildMissingDriverWarning(skillName: string, required: string[], missing: string[]): string {
  const requiredList = [...required].sort().join(", ");
  const missingList = [...missing].sort().join(", ");
  return [
    "[QUAILBOT WORKSPACE WARNING]",
    `Skill "${skillName}" requires CLI driver(s): ${requiredList}.`,
    `The active workspace does NOT register: ${missingList}.`,
    "These procedures cannot run against the instrument until the workspace provides",
    "the driver. Verify and re-select/reset your workspace before relying on this skill.",
  ].join("\n");
}
