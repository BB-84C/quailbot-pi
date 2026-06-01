import type { Workspace } from "../workspace/types.js";
import type { QuailbotToolResult } from "./tool-result.js";

export type ObserveInput = {
  rois?: string[];
};

export async function executeObserve(ctx: { workspace: Workspace }, input: ObserveInput): Promise<QuailbotToolResult> {
  const requestedRois = input.rois ?? activeRoiNames(ctx.workspace);

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

function activeRoiNames(workspace: Workspace): string[] {
  return workspace.rois.filter((roi) => roi.active).map((roi) => roi.name ?? roi.ref);
}
