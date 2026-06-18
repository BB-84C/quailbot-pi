import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { quailbotStateRoot } from "../workspace/workspace-state.js";

export type KnowledgeState = {
  loadedDomains: string[];
  skillBodyWindow: number;
};

export const DEFAULT_SKILL_BODY_WINDOW = 3;

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

export function saveKnowledgeState(state: KnowledgeState, cwd = process.cwd()): void {
  mkdirSync(quailbotStateRoot(cwd), { recursive: true });
  const normalized = normalizeKnowledgeState(state);
  writeFileSync(knowledgeStatePath(cwd), `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
}

function defaultState(): KnowledgeState {
  return { loadedDomains: [], skillBodyWindow: DEFAULT_SKILL_BODY_WINDOW };
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
  return { loadedDomains, skillBodyWindow: windowValue };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
