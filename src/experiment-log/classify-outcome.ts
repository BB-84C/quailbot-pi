import { isMutatingToolKind } from "../tools/mutation-policy.js";
import type { QuailbotToolResult } from "../tools/tool-result.js";
import type { ExperimentOutcome, PlanStepResultPayload } from "./experiment-log-types.js";

export function classifyToolOutcome(result: QuailbotToolResult): ExperimentOutcome {
  const primary = record(result.primary_result);
  const primaryOutcome = classifyPrimaryOutcome(primary);
  if (primaryOutcome !== undefined) {
    return primaryOutcome;
  }

  if (result.ok === false || isPrimaryDriverFailure(primary)) {
    return "driver_failure";
  }

  const readbackOutcome = classifyToolReadbackOutcome(result, primary);
  if (readbackOutcome !== undefined) {
    return readbackOutcome;
  }

  if (result.action === "quailbot_plan_and_execute") {
    return classifySuccessfulPlan(primary);
  }

  return isMutatingToolKind(result.action) ? "applied" : "measured";
}

export function classifyPlanStepOutcome(step: PlanStepResultPayload): ExperimentOutcome {
  const primary = record(step.primary_result);
  const primaryOutcome = classifyPrimaryOutcome(primary);
  if (primaryOutcome !== undefined) {
    return primaryOutcome;
  }

  if (isPrimaryDriverFailure(primary)) {
    return "driver_failure";
  }

  const readbackOutcome = classifyLinkedObservationOutcome(step.linked_observation);
  if (readbackOutcome !== undefined) {
    return readbackOutcome;
  }

  return isMutatingToolKind(step.kind) ? "applied" : "measured";
}

function classifyPrimaryOutcome(primary: Record<string, unknown>): ExperimentOutcome | undefined {
  if (primary.error_type === "mutation_policy_disabled") {
    return "mutation_denied";
  }

  if (primary.stopped_reason === "validation_failed") {
    return "validation_failed";
  }

  if (primary.stopped_reason === "step_failed") {
    return "step_failed";
  }

  if (isGuiBackendUnavailableError(primary.error_type)) {
    return "gui_backend_unavailable";
  }

  if (primary.error_type === "tool_exception") {
    return "exception";
  }

  return undefined;
}

function classifyLinkedObservationOutcome(value: unknown): ExperimentOutcome | undefined {
  const linked = record(value);
  const roi = record(record(linked.channels).roi);

  if (arrayHasEntries(roi.unavailable) || roiResultsHaveGuiBackendUnavailable(roi.results)) {
    return "gui_backend_unavailable";
  }

  if (arrayHasEntries(linked.unresolved) || channelResultsHaveFailure(record(record(linked.channels).cli).results)) {
    return "readback_failure";
  }

  if (channelResultsHaveFailure(roi.results)) {
    return "readback_failure";
  }

  return undefined;
}

function classifyToolReadbackOutcome(
  result: QuailbotToolResult,
  primary: Record<string, unknown>,
): ExperimentOutcome | undefined {
  const outcomes = [classifyLinkedObservationOutcome(result.linked_observation)];

  if (result.action === "quailbot_plan_and_execute" && Array.isArray(primary.steps)) {
    outcomes.push(...primary.steps.map((step) => classifyLinkedObservationOutcome(record(step).linked_observation)));
  }

  if (outcomes.includes("gui_backend_unavailable")) {
    return "gui_backend_unavailable";
  }

  return outcomes.includes("readback_failure") ? "readback_failure" : undefined;
}

function classifySuccessfulPlan(primary: Record<string, unknown>): ExperimentOutcome {
  const steps = Array.isArray(primary.steps) ? primary.steps : [];
  return steps.some((step) => isMutatingToolKind(record(step).kind)) ? "applied" : "measured";
}

function isPrimaryDriverFailure(primary: Record<string, unknown>): boolean {
  if (primary.ok === false) {
    return true;
  }

  return typeof primary.exit_code === "number" && primary.exit_code !== 0;
}

function roiResultsHaveGuiBackendUnavailable(results: unknown): boolean {
  return Object.values(record(results)).some((result) => isGuiBackendUnavailableError(record(result).error_type));
}

function channelResultsHaveFailure(results: unknown): boolean {
  return Object.values(record(results)).some((result) => record(result).ok === false);
}

function isGuiBackendUnavailableError(errorType: unknown): boolean {
  return errorType === "gui_backend_unavailable" || errorType === "roi_backend_unavailable";
}

function arrayHasEntries(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
