import type { ToolContext } from "./tool-context.js";
import { cliRef } from "./tool-context.js";
import type { QuailbotToolResult } from "./tool-result.js";

export type CliGetInput = {
  cli_name?: string;
  parameter: string;
  timeout_ms?: number;
};

export async function executeCliGet(ctx: ToolContext, input: CliGetInput): Promise<QuailbotToolResult> {
  const cliName = input.cli_name ?? ctx.workspace.cli.defaultCliName;
  const parameter = requireParameter(ctx, cliName, input.parameter);

  if (!parameter.actions.get) {
    throw new Error(`CLI parameter does not allow get: ${parameter.ref}`);
  }

  const run = await ctx.runCli(cliName, ["get", input.parameter], { timeoutMs: input.timeout_ms });

  return {
    ok: run.ok,
    action: "cli_get",
    action_input: input,
    primary_result: {
      parameter: input.parameter,
      ok: run.ok,
      exit_code: run.exitCode,
      stdout: run.stdout,
      stderr: run.stderr,
      payload: run.payload,
      argv: run.argv,
      ...(run.error_type === undefined ? {} : { error_type: run.error_type }),
      ...(run.error_message === undefined ? {} : { error_message: run.error_message }),
    },
    linked_observation: linkedObservation(parameter.linkedObservables),
  };
}

function requireParameter(ctx: ToolContext, cliName: string, name: string) {
  if (!ctx.workspace.cli.enabled) {
    throw new Error("workspace CLI is not enabled");
  }

  const ref = cliRef(cliName, name);
  const parameter = ctx.workspace.cli.parameters.get(ref);
  if (!parameter) {
    throw new Error(`unknown CLI parameter: ${ref}`);
  }

  if (!parameter.enabled) {
    throw new Error(`CLI parameter is disabled: ${ref}`);
  }

  return parameter;
}

function linkedObservation(refs: string[]): unknown {
  return refs.length > 0 ? { refs } : undefined;
}
