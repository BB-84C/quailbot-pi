import type { ToolContext } from "./tool-context.js";
import { cliRef } from "./tool-context.js";
import type { QuailbotToolResult } from "./tool-result.js";

export type CliSetInput = {
  cli_name?: string;
  parameter: string;
  value?: unknown;
  args?: Record<string, unknown>;
  timeout_ms?: number;
};

export async function executeCliSet(ctx: ToolContext, input: CliSetInput): Promise<QuailbotToolResult> {
  const cliName = input.cli_name ?? ctx.workspace.cli.defaultCliName;
  const parameter = requireParameter(ctx, cliName, input.parameter);

  if (!parameter.actions.set) {
    throw new Error(`CLI parameter does not allow set: ${parameter.ref}`);
  }

  if (input.value === undefined && argEntries(input.args).length === 0) {
    throw new Error("cli_set requires either value or args");
  }

  const cliArgs = input.args !== undefined ? ["set", input.parameter, ...formatArgs(input.args)] : ["set", input.parameter, String(input.value)];
  const run = await ctx.runCli(cliName, cliArgs, { timeoutMs: input.timeout_ms });

  return {
    ok: run.ok,
    action: "cli_set",
    action_input: input,
    primary_result: {
      parameter: input.parameter,
      value: input.value,
      args: input.args,
      ok: run.ok,
      exit_code: run.exitCode,
      stdout: run.stdout,
      stderr: run.stderr,
      payload: run.payload,
      argv: run.argv,
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

function formatArgs(args: Record<string, unknown>): string[] {
  return argEntries(args).flatMap(([key, value]) => ["--arg", `${key}=${String(value)}`]);
}

function argEntries(args: Record<string, unknown> | undefined): [string, unknown][] {
  return args === undefined ? [] : Object.entries(args);
}

function linkedObservation(refs: string[]): unknown {
  return refs.length > 0 ? { refs } : undefined;
}
