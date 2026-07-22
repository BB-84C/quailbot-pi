import type { ToolContext } from "./tool-context.js";
import { cliRef } from "./tool-context.js";
import { attachModelContent, type QuailbotToolResult } from "./tool-result.js";
import { mutationPolicyDisabledResult } from "./mutation-policy.js";
import { validateCliSetSafety } from "./cli-safety-gate.js";
import type { CliParameter } from "../workspace/types.js";
import { readLinkedObservablesWithContent } from "../linked-observables/read-linked-observables.js";
import { resolveLinkedObservables } from "../linked-observables/resolve-linked-observables.js";

export type CliSetInput = {
  cli_name?: string;
  parameter: string;
  value?: unknown;
  args?: Record<string, unknown>;
  linked_observables?: string[];
  timeout_ms?: number;
};

export async function executeCliSet(ctx: ToolContext, input: CliSetInput): Promise<QuailbotToolResult> {
  if (!ctx.mutationPolicy.mutatingToolsEnabled) {
    return mutationPolicyDisabledResult("cli_set", input);
  }

  const target = cliTarget(input.parameter, input.cli_name ?? ctx.workspace.cli.defaultCliName);
  const parameter = requireParameter(ctx, target);

  if (!parameter.actions.set) {
    throw new Error(`CLI parameter does not allow set: ${parameter.ref}`);
  }

  const hasValue = input.value !== undefined;
  const argEntriesForInput = argEntries(input.args);
  const hasArgs = input.args !== undefined && argEntriesForInput.length > 0;

  if ((hasValue && input.args !== undefined) || (!hasValue && !hasArgs)) {
    throw new Error("cli_set requires exactly one input mode: provide either value or non-empty args");
  }

  const cliArgs = hasArgs
    ? ["set", target.name, ...formatArgs(validateDeclaredArgs(parameter, input.args ?? {}))]
    : ["set", target.name, ...valueModeArgs(parameter, input.value)];
  validateCliSetSafety(parameter, resolvedSetValue(parameter, input, hasArgs));
  const run = await ctx.runCli(target.cliName, cliArgs, { timeoutMs: input.timeout_ms });
  const { observation: linkedObservation, content } = await readLinkedObservablesWithContent(
    ctx,
    resolveLinkedObservables(ctx.workspace, {
      kind: "cli_set",
      cli_name: target.cliName,
      parameter: input.parameter,
      linked_observables: input.linked_observables,
    }),
  );

  return attachModelContent({
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

function formatArgs(args: Record<string, unknown>): string[] {
  return argEntries(args).flatMap(([key, value]) => ["--arg", `${key}=${String(value)}`]);
}

function valueModeArgs(parameter: CliParameter, value: unknown): string[] {
  const fields = setArgFields(parameter);
  if (fields.length === 0) {
    return [String(value)];
  }

  if (fields.length !== 1) {
    throw new Error(`value mode requires zero or one declared arg field for CLI parameter ${parameter.ref}`);
  }

  return ["--arg", `${fields[0].name}=${String(value)}`];
}

function resolvedSetValue(parameter: CliParameter, input: CliSetInput, hasArgs: boolean): unknown {
  if (!hasArgs) {
    return input.value;
  }

  const fields = setArgFields(parameter);
  return fields.length === 1 && Object.hasOwn(input.args ?? {}, fields[0].name)
    ? input.args?.[fields[0].name]
    : undefined;
}

function validateDeclaredArgs(parameter: CliParameter, args: Record<string, unknown>): Record<string, unknown> {
  const fields = setArgFields(parameter);
  validateFields(`CLI parameter ${parameter.ref}`, fields, args);
  return args;
}

type ArgField = {
  name: string;
  required: boolean;
};

function setArgFields(parameter: CliParameter): ArgField[] {
  const schema = record(parameter.schema);
  const setCmd = record(schema.set_cmd);
  return argFields(setCmd.arg_fields);
}

function validateFields(context: string, fields: ArgField[], args: Record<string, unknown>): void {
  if (fields.length === 0) {
    return;
  }

  const knownNames = new Set(fields.map((field) => field.name));
  const unknown = Object.keys(args).filter((key) => !knownNames.has(key));
  if (unknown.length > 0) {
    throw new Error(`unknown args for ${context}: ${unknown.join(", ")}`);
  }

  const missing = fields.filter((field) => field.required && !(field.name in args)).map((field) => field.name);
  if (missing.length > 0) {
    throw new Error(`missing required args for ${context}: ${missing.join(", ")}`);
  }
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

function argEntries(args: Record<string, unknown> | undefined): [string, unknown][] {
  return args === undefined ? [] : Object.entries(args);
}
