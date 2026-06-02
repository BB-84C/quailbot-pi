import { runCli, type RunCli } from "../cli/cli-driver.js";
import type { Workspace } from "../workspace/types.js";
import { mutationPolicyFromEnvironment, type MutationPolicy } from "./mutation-policy.js";

export type ToolContext = {
  workspace: Workspace;
  runCli: RunCli;
  mutationPolicy: MutationPolicy;
};

export function createToolContext({
  workspace,
  runCli: runner = runCli,
  mutationPolicy = mutationPolicyFromEnvironment(),
}: {
  workspace: Workspace;
  runCli?: RunCli;
  mutationPolicy?: MutationPolicy;
}): ToolContext {
  return { workspace, runCli: runner, mutationPolicy };
}

export function cliRef(cliName: string | undefined, name: string): string {
  return `${cliName || "cli"}:${name}`;
}
