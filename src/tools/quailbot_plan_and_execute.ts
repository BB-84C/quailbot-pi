import { executeCliAction, type CliActionInput } from "./cli_action.js";
import { executeCliGet, type CliGetInput } from "./cli_get.js";
import { executeCliRamp, type CliRampInput } from "./cli_ramp.js";
import { executeCliSet, type CliSetInput } from "./cli_set.js";
import { executeSleepSeconds, type SleepSecondsInput } from "./sleep_seconds.js";
import type { ToolContext } from "./tool-context.js";
import type { QuailbotToolResult } from "./tool-result.js";

export type PlanAndExecuteStep =
  | ({ kind: "cli_get" } & CliGetInput)
  | ({ kind: "cli_set" } & CliSetInput)
  | ({ kind: "cli_ramp" } & CliRampInput)
  | ({ kind: "cli_action" } & CliActionInput)
  | ({ kind: "sleep_seconds" } & SleepSecondsInput);

export type PlanAndExecuteInput = { steps: PlanAndExecuteStep[] };

async function runStep(ctx: ToolContext, step: PlanAndExecuteStep): Promise<QuailbotToolResult> {
  if (step.kind === "cli_get") return await executeCliGet(ctx, step);
  if (step.kind === "cli_set") return await executeCliSet(ctx, step);
  if (step.kind === "cli_ramp") return await executeCliRamp(ctx, step);
  if (step.kind === "cli_action") return await executeCliAction(ctx, step);
  if (step.kind === "sleep_seconds") return await executeSleepSeconds(step);
  const neverStep: never = step;
  throw new Error(`unsupported step: ${JSON.stringify(neverStep)}`);
}

export async function executeQuailbotPlanAndExecute(
  ctx: ToolContext,
  input: PlanAndExecuteInput,
): Promise<QuailbotToolResult> {
  if (!Array.isArray(input.steps) || input.steps.length === 0) {
    throw new Error("quailbot_plan_and_execute requires at least one step");
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
