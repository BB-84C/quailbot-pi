import { saveMemoryTopic } from "../knowledge/memory.js";
import type { QuailbotToolResult } from "./tool-result.js";

export type QuailbotMemorySaveParams = {
  domain: string;
  topic: string;
  body: string;
  expected_old_hash?: string;
};

export function executeQuailbotMemorySave(cwd: string, params: QuailbotMemorySaveParams): QuailbotToolResult {
  const result = saveMemoryTopic(cwd, params.domain, params.topic, params.body, params.expected_old_hash);
  return {
    ok: result.status === "created" || result.status === "updated",
    action: "quailbot_memory_save",
    action_input: params,
    primary_result: result,
  };
}
