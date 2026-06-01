import type { Workspace, WorkspaceAnchor } from "../workspace/types.js";
import type { QuailbotToolResult } from "./tool-result.js";

export type SetFieldInput = {
  anchor: string;
  typed_text: string;
  submit?: "enter" | "tab";
  rois?: string[];
};

export async function executeSetField(ctx: { workspace: Workspace }, input: SetFieldInput): Promise<QuailbotToolResult> {
  const anchor = requireActiveAnchor(ctx.workspace, input.anchor);

  return {
    ok: false,
    action: "set_field",
    action_input: input,
    primary_result: {
      anchor: anchor.name ?? anchor.ref,
      error_type: "gui_backend_unavailable",
      message: "GUI text-entry backend is not configured in this plugin implementation round.",
    },
  };
}

function requireActiveAnchor(workspace: Workspace, name: string): WorkspaceAnchor {
  const anchor = workspace.anchors.find((item) => item.active && (item.ref === name || item.name === name));
  if (!anchor) {
    throw new Error(`unknown or inactive anchor: ${name}`);
  }

  return anchor;
}
