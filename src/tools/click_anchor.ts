import type { Workspace, WorkspaceAnchor } from "../workspace/types.js";
import type { QuailbotToolResult } from "./tool-result.js";

export type ClickAnchorInput = {
  anchor: string;
  rois?: string[];
};

export async function executeClickAnchor(ctx: { workspace: Workspace }, input: ClickAnchorInput): Promise<QuailbotToolResult> {
  const anchor = validateClickAnchorInput(ctx.workspace, input);

  return {
    ok: false,
    action: "click_anchor",
    action_input: input,
    primary_result: {
      anchor: anchor.name ?? anchor.ref,
      error_type: "gui_backend_unavailable",
      message: "GUI click backend is not configured in this plugin implementation round.",
    },
  };
}

export function validateClickAnchorInput(workspace: Workspace, input: ClickAnchorInput): WorkspaceAnchor {
  return requireActiveAnchor(workspace, input.anchor);
}

function requireActiveAnchor(workspace: Workspace, name: string): WorkspaceAnchor {
  const anchor = workspace.anchors.find((item) => item.active && (item.ref === name || item.name === name));
  if (!anchor) {
    throw new Error(`unknown or inactive anchor: ${name}`);
  }

  return anchor;
}
