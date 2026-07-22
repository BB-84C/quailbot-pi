import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type SessionExperimentIndexEntry = {
  experiment_id: string;
  events_path: string;
  updated_at: string;
};

export type SessionExperimentIndex = Record<string, SessionExperimentIndexEntry>;

type SessionExperimentIndexOptions = {
  warn?: (message: string) => void;
};

export function sessionExperimentIndexPath(experimentsRoot: string): string {
  return join(experimentsRoot, "session-index.json");
}

export function loadSessionExperimentIndex(
  experimentsRoot: string,
  options: SessionExperimentIndexOptions = {},
): SessionExperimentIndex {
  const path = sessionExperimentIndexPath(experimentsRoot);
  try {
    if (!existsSync(path)) return {};
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!isIndex(value)) throw new Error("expected a session-id-to-experiment mapping");
    return value;
  } catch (error) {
    warn(options, `experiment session index load failed: ${errorMessage(error)}`);
    return {};
  }
}

export function saveSessionExperimentIndex(
  experimentsRoot: string,
  index: SessionExperimentIndex,
  options: SessionExperimentIndexOptions = {},
): void {
  try {
    const pruned = Object.fromEntries(Object.entries(index).filter(([, entry]) => existsSync(entry.events_path)));
    mkdirSync(experimentsRoot, { recursive: true });
    writeFileSync(sessionExperimentIndexPath(experimentsRoot), `${JSON.stringify(pruned, null, 2)}\n`, "utf8");
  } catch (error) {
    warn(options, `experiment session index save failed: ${errorMessage(error)}`);
  }
}

function isIndex(value: unknown): value is SessionExperimentIndex {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every(isEntry);
}

function isEntry(value: unknown): value is SessionExperimentIndexEntry {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Partial<SessionExperimentIndexEntry>;
  return typeof entry.experiment_id === "string" && typeof entry.events_path === "string" && typeof entry.updated_at === "string";
}

function warn(options: SessionExperimentIndexOptions, message: string): void {
  try {
    options.warn?.(message);
  } catch {
    // Indexing is observability only; diagnostics must never block the agent loop.
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
