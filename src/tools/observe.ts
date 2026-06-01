import type { Workspace, WorkspaceRoi } from "../workspace/types.js";
import type { QuailbotToolResult } from "./tool-result.js";

export type ObserveInput = {
  rois?: string[];
};

export async function executeObserve(ctx: { workspace: Workspace }, input: ObserveInput): Promise<QuailbotToolResult> {
  const requestedRois = validateObserveInput(ctx.workspace, input);

  return {
    ok: false,
    action: "observe",
    action_input: input,
    primary_result: {
      requested_rois: requestedRois,
      error_type: "roi_backend_unavailable",
      message: "ROI screenshot/OCR backend is not configured in this plugin implementation round.",
    },
  };
}

export function validateObserveInput(workspace: Workspace, input: ObserveInput): string[] {
  return input.rois === undefined ? activeRoiNames(workspace) : validateActiveRois(workspace, input.rois);
}

function activeRoiNames(workspace: Workspace): string[] {
  return workspace.rois.filter((roi) => roi.active).map((roi) => roi.name ?? roi.ref);
}

function validateActiveRois(workspace: Workspace, names: string[]): string[] {
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
