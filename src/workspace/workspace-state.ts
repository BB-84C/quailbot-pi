import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export type WorkspaceSelection = {
  path: string;
  source: "explicit" | "settings" | "starter";
};

export function quailbotStateRoot(cwd = process.cwd()): string {
  return join(cwd, ".quailbot-pi");
}

export function settingsPath(cwd = process.cwd()): string {
  return join(quailbotStateRoot(cwd), "settings.json");
}

export function starterWorkspacePath(cwd = process.cwd()): string {
  return join(quailbotStateRoot(cwd), "starter.workspace.json");
}

export function saveLastWorkspace(path: string, cwd = process.cwd()): void {
  mkdirSync(quailbotStateRoot(cwd), { recursive: true });
  writeFileSync(settingsPath(cwd), `${JSON.stringify({ workspace: resolve(path) }, null, 2)}\n`, "utf8");
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

  return parsed.workspace;
}

export function resolveWorkspaceSelection(options: { explicitPath?: string; cwd?: string } = {}): WorkspaceSelection {
  const cwd = options.cwd ?? process.cwd();

  if (options.explicitPath) {
    return { path: resolve(options.explicitPath), source: "explicit" };
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
