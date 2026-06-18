import type { KnowledgeRuntime } from "../knowledge/knowledge-runtime.js";
import { saveKnowledgeState } from "../knowledge/knowledge-state.js";
import { listMemoryDomains } from "../knowledge/memory.js";
import { isSafeKnowledgeName } from "../knowledge/safe-name.js";
import type { QuailbotToolResult } from "./tool-result.js";

function persist(knowledge: KnowledgeRuntime): void {
  saveKnowledgeState(
    { loadedDomains: [...knowledge.loadedDomains], skillBodyWindow: knowledge.skillBodyWindow },
    knowledge.cwd,
  );
}

export function executeQuailbotMemoryLoad(knowledge: KnowledgeRuntime, domain: string): QuailbotToolResult {
  if (!isSafeKnowledgeName(domain)) {
    return {
      ok: false,
      action: "quailbot_memory_load",
      action_input: { domain },
      primary_result: { domain, error: "invalid_name" },
    };
  }
  knowledge.loadedDomains.add(domain);
  persist(knowledge);
  const known = listMemoryDomains(knowledge.cwd).includes(domain);
  return {
    ok: true,
    action: "quailbot_memory_load",
    action_input: { domain },
    primary_result: {
      domain,
      loaded: [...knowledge.loadedDomains].sort(),
      known,
      warning: known ? undefined : "No memory file for this domain yet; it will render once content is saved.",
    },
  };
}

export function executeQuailbotMemoryUnload(knowledge: KnowledgeRuntime, domain: string): QuailbotToolResult {
  if (!isSafeKnowledgeName(domain)) {
    return {
      ok: false,
      action: "quailbot_memory_unload",
      action_input: { domain },
      primary_result: { domain, error: "invalid_name" },
    };
  }
  knowledge.loadedDomains.delete(domain);
  persist(knowledge);
  return {
    ok: true,
    action: "quailbot_memory_unload",
    action_input: { domain },
    primary_result: { domain, loaded: [...knowledge.loadedDomains].sort() },
  };
}
