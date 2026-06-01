import type { ToolContext } from "./tool-context.js";
import { cliRef } from "./tool-context.js";
import type { QuailbotToolResult } from "./tool-result.js";
import { readLinkedObservables } from "../linked-observables/read-linked-observables.js";
import { resolveLinkedObservables } from "../linked-observables/resolve-linked-observables.js";

export type CliRampInput = {
  cli_name?: string;
  parameter: string;
  start: number;
  end: number;
  step: number;
  interval_s: number;
  timeout_ms?: number;
};

export async function executeCliRamp(ctx: ToolContext, input: CliRampInput): Promise<QuailbotToolResult> {
  const cliName = input.cli_name ?? ctx.workspace.cli.defaultCliName;
  const parameter = requireParameter(ctx, cliName, input.parameter);

  if (!parameter.actions.ramp) {
    throw new Error(`CLI parameter does not allow ramp: ${parameter.ref}`);
  }

  const cliArgs = [
    "ramp",
    input.parameter,
    String(input.start),
    String(input.end),
    String(input.step),
    "--interval-s",
    String(input.interval_s),
  ];
  const run = await ctx.runCli(cliName, cliArgs, { timeoutMs: input.timeout_ms });
  const linkedObservation = await readLinkedObservables(
    ctx,
    resolveLinkedObservables(ctx.workspace, {
      kind: "cli_ramp",
      cli_name: cliName,
      parameter: input.parameter,
    }),
  );

  return {
    ok: run.ok,
    action: "cli_ramp",
    action_input: input,
    primary_result: {
      parameter: input.parameter,
      start: input.start,
      end: input.end,
      step: input.step,
      interval_s: input.interval_s,
      ok: run.ok,
      exit_code: run.exitCode,
      stdout: run.stdout,
      stderr: run.stderr,
      payload: run.payload,
      argv: run.argv,
    },
    linked_observation: linkedObservation,
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
