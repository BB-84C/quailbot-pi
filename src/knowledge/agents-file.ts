import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export type AgentsFile = { path: string; content: string };

export type AgentsFileCache = { signature?: string; value?: AgentsFile };

export function createAgentsFileCache(): AgentsFileCache {
  return {};
}

export function readDeployedAgentsFile(cwd: string, cache: AgentsFileCache): AgentsFile | undefined {
  const path = join(cwd, "AGENTS.md");
  if (!existsSync(path)) {
    cache.signature = undefined;
    cache.value = undefined;
    return undefined;
  }
  const stats = statSync(path);
  const signature = `${stats.mtimeMs}:${stats.size}`;
  if (cache.signature === signature && cache.value) {
    return cache.value;
  }
  const value: AgentsFile = { path, content: readFileSync(path, "utf8").trimEnd() };
  cache.signature = signature;
  cache.value = value;
  return value;
}
