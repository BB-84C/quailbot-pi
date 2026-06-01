import type { ToolContext } from "./tool-context.js";
import { cliRef } from "./tool-context.js";
import type { QuailbotToolResult } from "./tool-result.js";

export type CliActionInput = {
  cli_name?: string;
  action_name: string;
  args?: Record<string, unknown>;
  timeout_ms?: number;
};

export async function executeCliAction(ctx: ToolContext, input: CliActionInput): Promise<QuailbotToolResult> {
  const cliName = input.cli_name ?? ctx.workspace.cli.defaultCliName;
  const action = requireAction(ctx, cliName, input.action_name);
  const cliArgs = ["act", input.action_name, ...formatArgs(input.args)];
  const run = await ctx.runCli(cliName, cliArgs, { timeoutMs: input.timeout_ms });

  return {
    ok: run.ok,
    action: "cli_action",
    action_input: input,
    primary_result: {
      action_name: input.action_name,
      args: input.args,
      ok: run.ok,
      exit_code: run.exitCode,
      stdout: run.stdout,
      stderr: run.stderr,
      payload: run.payload,
      argv: run.argv,
    },
    linked_observation: linkedObservation(action.linkedObservables),
  };
}

function requireAction(ctx: ToolContext, cliName: string, name: string) {
  if (!ctx.workspace.cli.enabled) {
    throw new Error("workspace CLI is not enabled");
  }

  const ref = cliRef(cliName, name);
  const action = ctx.workspace.cli.actions.get(ref);
  if (!action) {
    throw new Error(`unknown CLI action: ${ref}`);
  }

  if (!action.enabled) {
    throw new Error(`CLI action is disabled: ${ref}`);
  }

  if (action.safetyMode === "blocked") {
    throw new Error(`CLI action is blocked: ${ref}`);
  }

  return action;
}

function formatArgs(args: Record<string, unknown> | undefined): string[] {
  if (args === undefined) {
    return [];
  }

  return Object.entries(args).flatMap(([key, value]) => ["--arg", `${key}=${String(value)}`]);
}

function linkedObservation(refs: string[]): unknown {
  return refs.length > 0 ? { refs } : undefined;
}
