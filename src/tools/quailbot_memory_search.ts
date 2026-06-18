import { searchMemory } from "../knowledge/memory.js";
import type { QuailbotToolResult } from "./tool-result.js";

export type QuailbotMemorySearchParams = { query: string };

export function executeQuailbotMemorySearch(cwd: string, params: QuailbotMemorySearchParams): QuailbotToolResult {
  const matches = searchMemory(cwd, params.query);
  return {
    ok: true,
    action: "quailbot_memory_search",
    action_input: params,
    primary_result: { query: params.query, count: matches.length, matches },
  };
}
