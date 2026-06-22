import type { Workspace, WorkspaceAnchor } from "../workspace/types.js";
import { readLinkedObservablesWithContent } from "../linked-observables/read-linked-observables.js";
import { resolveLinkedObservables } from "../linked-observables/resolve-linked-observables.js";
import { anchorPointFromSchema, type GuiActionResult } from "./gui-action.js";
import { validateActiveRois } from "./observe.js";
import { mutationPolicyDisabledResult } from "./mutation-policy.js";
import { attachModelContent, type QuailbotToolResult } from "./tool-result.js";
import type { ToolContext } from "./tool-context.js";

export type ClickAnchorInput = {
  anchor: string;
  rois?: string[];
};

export async function executeClickAnchor(
  ctx: ToolContext,
  input: ClickAnchorInput,
): Promise<QuailbotToolResult> {
  if (!ctx.mutationPolicy.mutatingToolsEnabled) {
    return mutationPolicyDisabledResult("click_anchor", input);
  }

  const anchor = validateClickAnchorInput(ctx.workspace, input);
  const primaryResult = await clickAnchorPrimaryResult(ctx, anchor);
  const { observation: linkedObservation, content } = await readLinkedObservablesWithContent(
    ctx,
    resolveLinkedObservables(ctx.workspace, {
      kind: "click_anchor",
      anchor: input.anchor,
      linked_observables: input.rois,
    }),
  );

  return attachModelContent({
    ok: primaryResult.ok === true,
    action: "click_anchor",
    action_input: input,
    primary_result: primaryResult,
    linked_observation: linkedObservation,
  }, content);
}

export function validateClickAnchorInput(workspace: Workspace, input: ClickAnchorInput): WorkspaceAnchor {
  const anchor = requireActiveAnchor(workspace, input.anchor);
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

type ClickAnchorPrimaryResult =
  | {
      ok: true;
      anchor: string;
      point: { x: number; y: number };
      backend: string;
    }
  | {
      ok: false;
      anchor: string;
      point?: { x: number; y: number };
      error_type: "gui_backend_unavailable" | "anchor_geometry_invalid" | "gui_action_failed";
      message: string;
    };

async function clickAnchorPrimaryResult(ctx: ToolContext, anchor: WorkspaceAnchor): Promise<ClickAnchorPrimaryResult> {
  const anchorName = anchor.name ?? anchor.ref;
  const point = anchorPointFromSchema(anchor);

  if (ctx.guiActionBackend === undefined) {
    return {
      ok: false,
      anchor: anchorName,
      ...(point === undefined ? {} : { point }),
      error_type: "gui_backend_unavailable",
      message: "GUI click backend is not configured for this execution context.",
    };
  }

  if (point === undefined) {
    return {
      ok: false,
      anchor: anchorName,
      error_type: "anchor_geometry_invalid",
      message: `Anchor ${anchorName} must define finite x and y values.`,
    };
  }

  try {
    return successfulClickResult(anchorName, await ctx.guiActionBackend.clickAnchor({ anchor }));
  } catch (error) {
    return {
      ok: false,
      anchor: anchorName,
      point,
      error_type: "gui_action_failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function successfulClickResult(anchor: string, result: GuiActionResult): ClickAnchorPrimaryResult {
  return {
    ok: true,
    anchor,
    point: result.point,
    backend: result.backend,
  };
}
