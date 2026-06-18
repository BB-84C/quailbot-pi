import type { Workspace } from "../workspace/types.js";
import { createAgentsFileCache, readDeployedAgentsFile, type AgentsFileCache } from "./agents-file.js";
import { renderKnowledgePrefix, renderMemorySection } from "./knowledge-render.js";
import { DEFAULT_SKILL_BODY_WINDOW, loadKnowledgeState } from "./knowledge-state.js";
import { createSkillCache, discoverSkills, type SkillCache } from "./skills.js";

export type KnowledgeRuntime = {
  cwd: string;
  loadedDomains: Set<string>;
  skillBodyWindow: number;
  skillCache: SkillCache;
  agentsCache: AgentsFileCache;
};

export function createKnowledgeRuntime(): KnowledgeRuntime {
  return {
    cwd: process.cwd(),
    loadedDomains: new Set(),
    skillBodyWindow: DEFAULT_SKILL_BODY_WINDOW,
    skillCache: createSkillCache(),
    agentsCache: createAgentsFileCache(),
  };
}

export function hydrateKnowledgeRuntime(knowledge: KnowledgeRuntime, cwd: string): void {
  knowledge.cwd = cwd;
  const state = loadKnowledgeState(cwd);
  knowledge.loadedDomains = new Set(state.loadedDomains);
  knowledge.skillBodyWindow = state.skillBodyWindow;
}

export function renderKnowledgePrefixFromRuntime(
  knowledge: KnowledgeRuntime,
  workspace: Workspace | undefined,
): string {
  try {
    const skills = discoverSkills(knowledge.cwd, knowledge.skillCache);
    const agentsFile = readDeployedAgentsFile(knowledge.cwd, knowledge.agentsCache);
    const memorySection = renderMemorySection(knowledge.cwd, knowledge.loadedDomains);
    return renderKnowledgePrefix({ agentsFile, skills, workspace, memorySection });
  } catch {
    return "";
  }
}
