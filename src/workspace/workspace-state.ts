import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type WorkspaceSelection = {
  path: string;
  source: "explicit" | "settings" | "starter";
};

/**
 * Resolve the Quailbot Pi state root.
 *
 * Default: `~/.quailbot-pi/` -- per-user state lives here, including the
 * workspaces directory, screen captures, experiments, memory, skills, the
 * knowledge-state file, settings, and the debug provider payload log.
 *
 * Override: set the `QUAILBOT_PI_STATE_DIR` environment variable to relocate
 * state. Intended for development checkouts that prefer repo-local state
 * (the dev npm scripts set this to `<repo>/.quailbot-pi`) and for power users
 * sharding state per rig. The override is checked at every call, so tests
 * and per-process overrides work without module state pollution.
 *
 * The optional `cwd` argument is accepted for source-compatibility with the
 * pre-0.1.0 cwd-coupled resolver. It is no longer load-bearing for state
 * location; the location is independent of the user's working directory.
 * The argument may be removed in a future major release.
 */
export function quailbotStateRoot(_cwd?: string): string {
  const override = process.env.QUAILBOT_PI_STATE_DIR?.trim();
  if (override !== undefined && override.length > 0) {
    return override;
  }
  return join(homedir(), ".quailbot-pi");
}

export function settingsPath(cwd?: string): string {
  return join(quailbotStateRoot(cwd), "settings.json");
}

export function starterWorkspacePath(cwd?: string): string {
  return join(quailbotStateRoot(cwd), "workspace.json");
}

export function saveLastWorkspace(path: string, cwd = process.cwd()): void {
  mkdirSync(quailbotStateRoot(cwd), { recursive: true });
  writeFileSync(settingsPath(cwd), `${JSON.stringify({ workspace: resolve(cwd, path) }, null, 2)}\n`, "utf8");
}

export function loadLastWorkspace(cwd = process.cwd()): string | undefined {
  const path = settingsPath(cwd);
  if (!existsSync(path)) {
    return undefined;
  }

  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!isRecord(parsed) || typeof parsed.workspace !== "string") {
    return undefined;
  }

  return resolve(cwd, parsed.workspace);
}

export function resolveWorkspaceSelection(options: { explicitPath?: string; cwd?: string } = {}): WorkspaceSelection {
  const cwd = options.cwd ?? process.cwd();

  if (options.explicitPath) {
    return { path: resolve(cwd, options.explicitPath), source: "explicit" };
  }

  const settingsWorkspace = loadLastWorkspace(cwd);
  if (settingsWorkspace) {
    return { path: settingsWorkspace, source: "settings" };
  }

  return { path: starterWorkspacePath(cwd), source: "starter" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
