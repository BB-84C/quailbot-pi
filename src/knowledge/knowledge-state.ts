import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { quailbotStateRoot } from "../workspace/workspace-state.js";

export type KnowledgeState = {
  loadedDomains: string[];
  skillBodyWindow: number;
  recentFullCliResultWindow: number;
  recentImageResultWindow: number;
};
export type KnowledgeStateInput = Partial<KnowledgeState>;

export const DEFAULT_SKILL_BODY_WINDOW = 3;
export const DEFAULT_RECENT_FULL_CLI_RESULT_WINDOW = 10;
export const DEFAULT_RECENT_IMAGE_RESULT_WINDOW = 5;

export function knowledgeStatePath(cwd = process.cwd()): string {
  return join(quailbotStateRoot(cwd), "knowledge-state.json");
}

export function loadKnowledgeState(cwd = process.cwd()): KnowledgeState {
  const path = knowledgeStatePath(cwd);
  if (!existsSync(path)) {
    return defaultState();
  }
  try {
    return normalizeKnowledgeState(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return defaultState();
  }
}

export function saveKnowledgeState(state: KnowledgeStateInput, cwd = process.cwd()): void {
  mkdirSync(quailbotStateRoot(cwd), { recursive: true });
  const normalized = normalizeKnowledgeState(state);
  writeFileSync(knowledgeStatePath(cwd), `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
}

export function trySaveKnowledgeState(
  state: KnowledgeStateInput,
  cwd = process.cwd(),
): { ok: true } | { ok: false; errorCode?: string; errorMessage: string } {
  try {
    saveKnowledgeState(state, cwd);
    return { ok: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode =
      error instanceof Error && typeof (error as unknown as { code?: unknown }).code === "string"
        ? ((error as unknown as { code: string }).code)
        : undefined;
    return errorCode === undefined ? { ok: false, errorMessage } : { ok: false, errorCode, errorMessage };
  }
}

function defaultState(): KnowledgeState {
  return {
    loadedDomains: [],
    skillBodyWindow: DEFAULT_SKILL_BODY_WINDOW,
    recentFullCliResultWindow: DEFAULT_RECENT_FULL_CLI_RESULT_WINDOW,
    recentImageResultWindow: DEFAULT_RECENT_IMAGE_RESULT_WINDOW,
  };
}

function normalizeKnowledgeState(value: unknown): KnowledgeState {
  const record = isRecord(value) ? value : {};
  const loadedDomains = Array.isArray(record.loadedDomains)
    ? [...new Set(record.loadedDomains.filter((entry): entry is string => typeof entry === "string"))].sort()
    : [];
  const windowValue =
    typeof record.skillBodyWindow === "number" && Number.isInteger(record.skillBodyWindow) && record.skillBodyWindow > 0
      ? record.skillBodyWindow
      : DEFAULT_SKILL_BODY_WINDOW;
  return {
    loadedDomains,
    skillBodyWindow: windowValue,
    recentFullCliResultWindow: positiveInteger(record.recentFullCliResultWindow, DEFAULT_RECENT_FULL_CLI_RESULT_WINDOW),
    recentImageResultWindow: positiveInteger(record.recentImageResultWindow, DEFAULT_RECENT_IMAGE_RESULT_WINDOW),
  };
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
