import type { Workspace, WorkspaceRoi } from "../workspace/types.js";
import { observeRois, type RoiObservationContext } from "./roi-observation.js";
import { attachModelContent, type QuailbotToolResult } from "./tool-result.js";

export type ObserveInput = {
  rois?: string[];
};

export async function executeObserve(ctx: RoiObservationContext, input: ObserveInput): Promise<QuailbotToolResult> {
  const { requested, rois } = resolveObserveRois(ctx.workspace, input);
  const { observation, content } = await observeRois(ctx, rois);
  const ok = observation.unavailable.length === 0;

  return attachModelContent({
    ok,
    action: "observe",
    action_input: input,
    primary_result: {
      ok,
      requested_rois: requested,
      channels: { roi: observation },
      ...(ok ? {} : observeFailureFields(observation.unavailable, observation.results)),
    },
  }, content);
}

export function validateObserveInput(workspace: Workspace, input: ObserveInput): string[] {
  return resolveObserveRois(workspace, input).requested;
}

export function resolveObserveRois(workspace: Workspace, input: ObserveInput): { requested: string[]; rois: WorkspaceRoi[] } {
  const requested = input.rois === undefined ? activeRoiNames(workspace) : validateActiveRois(workspace, input.rois);
  return { requested, rois: requested.map((name) => requireActiveRoi(workspace, name)) };
}

function activeRoiNames(workspace: Workspace): string[] {
  return workspace.rois.filter((roi) => roi.active).map((roi) => roi.name ?? roi.ref);
}

export function validateActiveRois(workspace: Workspace, names: string[]): string[] {
  for (const name of names) {
    requireActiveRoi(workspace, name);
  }

  return names;
}

function requireActiveRoi(workspace: Workspace, name: string): WorkspaceRoi {
  const roi = workspace.rois.find((item) => item.active && (item.ref === name || item.name === name));
  if (!roi) {
    throw new Error(`unknown or inactive ROI: ${name}`);
  }

  return roi;
}

function observeFailureFields(
  unavailable: string[],
  results: Record<string, { ok: boolean; error_type?: string; error_message?: string }>,
): { error_type: string; message: string } {
  const errorTypes = unavailable
    .map((ref) => results[ref]?.error_type)
    .filter((value): value is string => value !== undefined);
  const errorType = errorTypes.length > 0 && errorTypes.every((value) => value === errorTypes[0])
    ? errorTypes[0]
    : "roi_observation_failed";

  return {
    error_type: errorType,
    message: "One or more ROI observations failed.",
  };
}
