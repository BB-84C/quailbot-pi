import { editSkill } from "../knowledge/skill-writer.js";
import type { QuailbotToolResult } from "./tool-result.js";

export type QuailbotSkillEditParams = {
  name: string;
  expected_old_hash: string;
  description: string;
  drivers: string[];
  domain?: string;
  body: string;
};

export function executeQuailbotSkillEdit(cwd: string, params: QuailbotSkillEditParams): QuailbotToolResult {
  const result = editSkill(cwd, params.name, params.expected_old_hash, {
    name: params.name,
    description: params.description,
    drivers: params.drivers,
    domain: params.domain,
    body: params.body,
  });
  return {
    ok: result.updated,
    action: "quailbot_skill_edit",
    action_input: params,
    primary_result: result,
  };
}
