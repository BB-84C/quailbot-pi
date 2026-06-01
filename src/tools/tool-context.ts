import { runCli, type RunCli } from "../cli/cli-driver.js";
import type { Workspace } from "../workspace/types.js";

export type ToolContext = {
  workspace: Workspace;
  runCli: RunCli;
};

export function createToolContext({ workspace, runCli: runner = runCli }: { workspace: Workspace; runCli?: RunCli }): ToolContext {
  return { workspace, runCli: runner };
}

export function cliRef(cliName: string | undefined, name: string): string {
  return `${cliName || "cli"}:${name}`;
}
