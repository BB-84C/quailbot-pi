import { knowledgeStateFromRuntime, type KnowledgeRuntime } from "../knowledge/knowledge-runtime.js";
import { trySaveKnowledgeState } from "../knowledge/knowledge-state.js";
import { listMemoryDomains, readMemoryDomain } from "../knowledge/memory.js";
import { isSafeKnowledgeName } from "../knowledge/safe-name.js";
import type { QuailbotToolResult } from "./tool-result.js";

function persist(knowledge: KnowledgeRuntime): { ok: true } | { ok: false; errorCode?: string; errorMessage: string } {
  return trySaveKnowledgeState(knowledgeStateFromRuntime(knowledge), knowledge.cwd);
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
  const persisted = persist(knowledge);
  if (!persisted.ok) {
    // Roll back the in-memory mutation so the runtime state matches disk.
    knowledge.loadedDomains.delete(domain);
    return {
      ok: false,
      action: "quailbot_memory_load",
      action_input: { domain },
      primary_result: {
        domain,
        error: "filesystem_error",
        ...(persisted.errorCode === undefined ? {} : { error_code: persisted.errorCode }),
        error_message: persisted.errorMessage,
      },
    };
  }
  const memory = readMemoryDomain(knowledge.cwd, domain);
  const known = listMemoryDomains(knowledge.cwd).includes(domain);
  return {
    ok: true,
    action: "quailbot_memory_load",
    action_input: { domain },
    primary_result: {
      domain,
      loaded: [...knowledge.loadedDomains].sort(),
      known,
      topics: memory?.sections.map(({ topic, hash }) => ({ topic, hash })) ?? [],
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
  const wasLoaded = knowledge.loadedDomains.has(domain);
  knowledge.loadedDomains.delete(domain);
  const persisted = persist(knowledge);
  if (!persisted.ok) {
    if (wasLoaded) {
      knowledge.loadedDomains.add(domain);
    }
    return {
      ok: false,
      action: "quailbot_memory_unload",
      action_input: { domain },
      primary_result: {
        domain,
        error: "filesystem_error",
        ...(persisted.errorCode === undefined ? {} : { error_code: persisted.errorCode }),
        error_message: persisted.errorMessage,
      },
    };
  }
  return {
    ok: true,
    action: "quailbot_memory_unload",
    action_input: { domain },
    primary_result: { domain, loaded: [...knowledge.loadedDomains].sort() },
  };
}
