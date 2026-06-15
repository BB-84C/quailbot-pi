import type { ToolContext } from "./tool-context.js";
import { cliRef } from "./tool-context.js";
import type { QuailbotToolResult } from "./tool-result.js";
import { mutationPolicyDisabledResult } from "./mutation-policy.js";
import type { CliAction } from "../workspace/types.js";
import { readLinkedObservables } from "../linked-observables/read-linked-observables.js";
import { resolveLinkedObservables } from "../linked-observables/resolve-linked-observables.js";

export type CliActionInput = {
  cli_name?: string;
  action_name: string;
  args?: Record<string, unknown>;
  linked_observables?: string[];
  timeout_ms?: number;
};

export async function executeCliAction(ctx: ToolContext, input: CliActionInput): Promise<QuailbotToolResult> {
  if (!ctx.mutationPolicy.mutatingToolsEnabled) {
    return mutationPolicyDisabledResult("cli_action", input);
  }

  const target = cliTarget(input.action_name, input.cli_name ?? ctx.workspace.cli.defaultCliName);
  const action = requireAction(ctx, target);
  const cliArgs = ["act", target.name, ...formatArgs(validateDeclaredArgs(action, input.args ?? {}))];
  const run = await ctx.runCli(target.cliName, cliArgs, { timeoutMs: input.timeout_ms });
  const linkedObservation = await readLinkedObservables(
    ctx,
    resolveLinkedObservables(ctx.workspace, {
      kind: "cli_action",
      cli_name: target.cliName,
      action_name: input.action_name,
      linked_observables: input.linked_observables,
    }),
  );

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
      ...(run.error_type === undefined ? {} : { error_type: run.error_type }),
      ...(run.error_message === undefined ? {} : { error_message: run.error_message }),
    },
    linked_observation: linkedObservation,
  };
}

type CliTarget = {
  cliName: string;
  name: string;
  ref: string;
};

function requireAction(ctx: ToolContext, target: CliTarget) {
  if (!ctx.workspace.cli.enabled) {
    throw new Error("workspace CLI is not enabled");
  }

  const action = ctx.workspace.cli.actions.get(target.ref);
  if (!action) {
    throw new Error(`unknown CLI action: ${target.ref}`);
  }

  if (!action.enabled) {
    throw new Error(`CLI action is disabled: ${target.ref}`);
  }

  if (action.safetyMode === "blocked") {
    throw new Error(`CLI action is blocked: ${target.ref}`);
  }

  return action;
}

function cliTarget(name: string, defaultCliName: string): CliTarget {
  const separator = name.indexOf(":");
  const cliName = separator === -1 ? defaultCliName : name.slice(0, separator);
  const targetName = separator === -1 ? name : name.slice(separator + 1);
  return { cliName, name: targetName, ref: cliRef(cliName, targetName) };
}

function formatArgs(args: Record<string, unknown> | undefined): string[] {
  if (args === undefined) {
    return [];
  }

  return Object.entries(args).flatMap(([key, value]) => ["--arg", `${key}=${String(value)}`]);
}

function validateDeclaredArgs(action: CliAction, args: Record<string, unknown>): Record<string, unknown> {
  const fields = actionArgFields(action);
  if (fields.length === 0) {
    return args;
  }

  const knownNames = new Set(fields.map((field) => field.name));
  const missing = fields.filter((field) => field.required && !(field.name in args)).map((field) => field.name);
  if (missing.length > 0) {
    throw new Error(`missing required args for CLI action ${action.ref}: ${missing.join(", ")}`);
  }

  const unknown = Object.keys(args).filter((key) => !knownNames.has(key));
  if (unknown.length > 0) {
    throw new Error(`unknown args for CLI action ${action.ref}: ${unknown.join(", ")}`);
  }

  return args;
}

type ArgField = {
  name: string;
  required: boolean;
};

function actionArgFields(action: CliAction): ArgField[] {
  const actionCmd = record(action.actionCmd);
  return argFields(actionCmd.arg_fields);
}

function argFields(value: unknown): ArgField[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const field = record(item);
    return typeof field.name === "string" ? [{ name: field.name, required: field.required === true }] : [];
  });
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
