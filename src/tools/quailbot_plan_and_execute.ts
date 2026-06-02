import { validateRunCliOptions } from "../cli/cli-driver.js";
import { executeClickAnchor, validateClickAnchorInput, type ClickAnchorInput } from "./click_anchor.js";
import { executeCliAction, type CliActionInput } from "./cli_action.js";
import { executeCliGet, type CliGetInput } from "./cli_get.js";
import { executeCliRamp, type CliRampInput } from "./cli_ramp.js";
import { executeCliSet, type CliSetInput } from "./cli_set.js";
import { isMutatingToolKind, mutationPolicyValidationError } from "./mutation-policy.js";
import { executeObserve, validateObserveInput, type ObserveInput } from "./observe.js";
import { executeSetField, validateSetFieldInput, type SetFieldInput } from "./set_field.js";
import { executeSleepSeconds, type SleepSecondsInput } from "./sleep_seconds.js";
import type { ToolContext } from "./tool-context.js";
import type { QuailbotToolResult } from "./tool-result.js";

export type PlanAndExecuteStep =
  | ({ kind: "cli_get" } & CliGetInput)
  | ({ kind: "cli_set" } & CliSetInput)
  | ({ kind: "cli_ramp" } & CliRampInput)
  | ({ kind: "cli_action" } & CliActionInput)
  | ({ kind: "click_anchor" } & ClickAnchorInput)
  | ({ kind: "set_field" } & SetFieldInput)
  | ({ kind: "observe" } & ObserveInput)
  | ({ kind: "sleep_seconds" } & SleepSecondsInput);

export type PlanAndExecuteInput = { steps: PlanAndExecuteStep[] };

async function runStep(ctx: ToolContext, step: PlanAndExecuteStep): Promise<QuailbotToolResult> {
  if (step.kind === "cli_get") return await executeCliGet(ctx, step);
  if (step.kind === "cli_set") return await executeCliSet(ctx, step);
  if (step.kind === "cli_ramp") return await executeCliRamp(ctx, step);
  if (step.kind === "cli_action") return await executeCliAction(ctx, step);
  if (step.kind === "click_anchor") return await executeClickAnchor(ctx, step);
  if (step.kind === "set_field") return await executeSetField(ctx, step);
  if (step.kind === "observe") return await executeObserve(ctx, step);
  if (step.kind === "sleep_seconds") return await executeSleepSeconds(step);
  const neverStep: never = step;
  throw new Error(`unsupported step: ${JSON.stringify(neverStep)}`);
}

async function validateStep(ctx: ToolContext, step: unknown): Promise<void> {
  if (!isRecord(step)) {
    throw new Error(`unsupported step: ${JSON.stringify(step)}`);
  }

  switch (step.kind) {
    case "cli_get":
    case "cli_set":
    case "cli_ramp":
    case "cli_action":
      await runStep(validationContext(ctx), step as PlanAndExecuteStep);
      return;
    case "click_anchor":
      validateClickAnchorInput(ctx.workspace, step as ClickAnchorInput);
      return;
    case "set_field":
      validateSetFieldInput(ctx.workspace, step as SetFieldInput);
      return;
    case "observe":
      validateObserveInput(ctx.workspace, step as ObserveInput);
      return;
    case "sleep_seconds":
      validateSleepSeconds(step as Partial<SleepSecondsInput>);
      return;
    default:
      throw new Error(`unsupported step: ${JSON.stringify(step)}`);
  }
}

async function validatePlan(ctx: ToolContext, steps: PlanAndExecuteStep[]): Promise<string | undefined> {
  try {
    for (const step of steps) {
      if (isMutatingPlanStep(step) && !ctx.mutationPolicy.mutatingToolsEnabled) {
        throw new Error(mutationPolicyValidationError());
      }
    }

    for (const step of steps) {
      await validateStep(ctx, step);
    }
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function validationContext(ctx: ToolContext): ToolContext {
  return {
    workspace: ctx.workspace,
    mutationPolicy: ctx.mutationPolicy,
    runCli: async (cliName, args, options) => {
      validateRunCliOptions(options);
      return {
        ok: true,
        exitCode: 0,
        stdout: "",
        stderr: "",
        payload: undefined,
        argv: [cliName, ...args],
      };
    },
  };
}

function validateSleepSeconds(input: Partial<SleepSecondsInput>): void {
  const seconds = input.seconds;
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) {
    throw new Error("sleep_seconds requires a finite non-negative seconds value");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMutatingPlanStep(step: unknown): boolean {
  return isRecord(step) && isMutatingToolKind(step.kind);
}

export async function executeQuailbotPlanAndExecute(
  ctx: ToolContext,
  input: PlanAndExecuteInput,
): Promise<QuailbotToolResult> {
  if (!Array.isArray(input.steps) || input.steps.length === 0) {
    throw new Error("quailbot_plan_and_execute requires at least one step");
  }

  const validationError = await validatePlan(ctx, input.steps);
  if (validationError) {
    return {
      ok: false,
      action: "quailbot_plan_and_execute",
      action_input: input as unknown as Record<string, unknown>,
      primary_result: { ok: false, stopped_reason: "validation_failed", validation_error: validationError, steps: [] },
    };
  }

  const steps: Record<string, unknown>[] = [];
  let ok = true;
  let stopped_reason: "completed" | "step_failed" = "completed";

  for (let index = 0; index < input.steps.length; index += 1) {
    const step = input.steps[index];
    const result = await runStep(ctx, step);
    steps.push({
      index,
      kind: step.kind,
      args: { ...step },
      primary_result: result.primary_result,
      linked_observation: result.linked_observation,
    });

    if (!result.ok) {
      ok = false;
      stopped_reason = "step_failed";
      break;
    }
  }

  return {
    ok,
    action: "quailbot_plan_and_execute",
    action_input: input as unknown as Record<string, unknown>,
    primary_result: { ok, stopped_reason, steps },
  };
}
