import type { ToolContext } from "./tool-context.js";
import { cliRef } from "./tool-context.js";
import { attachModelContent, type QuailbotToolResult } from "./tool-result.js";
import { mutationPolicyDisabledResult } from "./mutation-policy.js";
import { readLinkedObservablesWithContent } from "../linked-observables/read-linked-observables.js";
import { resolveLinkedObservables } from "../linked-observables/resolve-linked-observables.js";

export type CliRampInput = {
  cli_name?: string;
  parameter: string;
  start: number;
  end: number;
  step: number;
  interval_s: number;
  linked_observables?: string[];
  timeout_ms?: number;
};

export async function executeCliRamp(ctx: ToolContext, input: CliRampInput): Promise<QuailbotToolResult> {
  if (!ctx.mutationPolicy.mutatingToolsEnabled) {
    return mutationPolicyDisabledResult("cli_ramp", input);
  }

  const target = cliTarget(input.parameter, input.cli_name ?? ctx.workspace.cli.defaultCliName);
  const parameter = requireParameter(ctx, target);

  if (!parameter.actions.ramp) {
    throw new Error(`CLI parameter does not allow ramp: ${parameter.ref}`);
  }

  const cliArgs = [
    "ramp",
    target.name,
    String(input.start),
    String(input.end),
    String(input.step),
    "--interval-s",
    String(input.interval_s),
  ];
  const run = await ctx.runCli(target.cliName, cliArgs, { timeoutMs: input.timeout_ms });
  const { observation: linkedObservation, content } = await readLinkedObservablesWithContent(
    ctx,
    resolveLinkedObservables(ctx.workspace, {
      kind: "cli_ramp",
      cli_name: target.cliName,
      parameter: input.parameter,
      linked_observables: input.linked_observables,
    }),
  );

  return attachModelContent({
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
      ...(run.error_type === undefined ? {} : { error_type: run.error_type }),
      ...(run.error_message === undefined ? {} : { error_message: run.error_message }),
    },
    linked_observation: linkedObservation,
  }, content);
}

type CliTarget = {
  cliName: string;
  name: string;
  ref: string;
};

function requireParameter(ctx: ToolContext, target: CliTarget) {
  if (!ctx.workspace.cli.enabled) {
    throw new Error("workspace CLI is not enabled");
  }

  const parameter = ctx.workspace.cli.parameters.get(target.ref);
  if (!parameter) {
    throw new Error(`unknown CLI parameter: ${target.ref}`);
  }

  if (!parameter.enabled) {
    throw new Error(`CLI parameter is disabled: ${target.ref}`);
  }

  return parameter;
}

function cliTarget(name: string, defaultCliName: string): CliTarget {
  const separator = name.indexOf(":");
  const cliName = separator === -1 ? defaultCliName : name.slice(0, separator);
  const targetName = separator === -1 ? name : name.slice(separator + 1);
  return { cliName, name: targetName, ref: cliRef(cliName, targetName) };
}
