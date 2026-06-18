import { writeNewSkill, type SkillWriteInput } from "../knowledge/skill-writer.js";
import type { QuailbotToolResult } from "./tool-result.js";

export function executeQuailbotSkillWrite(cwd: string, input: SkillWriteInput): QuailbotToolResult {
  const result = writeNewSkill(cwd, input);
  return {
    ok: result.created,
    action: "quailbot_skill_write",
    action_input: input,
    primary_result: result,
  };
}
