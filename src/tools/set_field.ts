import type { Workspace, WorkspaceAnchor } from "../workspace/types.js";
import { validateActiveRois } from "./observe.js";
import type { QuailbotToolResult } from "./tool-result.js";

export type SetFieldInput = {
  anchor: string;
  typed_text: string;
  submit?: "enter" | "tab";
  rois?: string[];
};

export async function executeSetField(ctx: { workspace: Workspace }, input: SetFieldInput): Promise<QuailbotToolResult> {
  const anchor = validateSetFieldInput(ctx.workspace, input);

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

export function validateSetFieldInput(workspace: Workspace, input: SetFieldInput): WorkspaceAnchor {
  const anchor = requireActiveAnchor(workspace, input.anchor);
  if (typeof input.typed_text !== "string" || input.typed_text.length === 0) {
    throw new Error("set_field requires non-empty typed_text");
  }
  if (input.submit !== undefined && input.submit !== "enter" && input.submit !== "tab") {
    throw new Error("set_field submit must be enter or tab");
  }
  if (input.rois !== undefined) {
    validateActiveRois(workspace, input.rois);
  }
  return anchor;
}

function requireActiveAnchor(workspace: Workspace, name: string): WorkspaceAnchor {
  const anchor = workspace.anchors.find((item) => item.active && (item.ref === name || item.name === name));
  if (!anchor) {
    throw new Error(`unknown or inactive anchor: ${name}`);
  }

  return anchor;
}
