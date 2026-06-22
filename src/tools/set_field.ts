import type { Workspace, WorkspaceAnchor } from "../workspace/types.js";
import { readLinkedObservablesWithContent } from "../linked-observables/read-linked-observables.js";
import { resolveLinkedObservables } from "../linked-observables/resolve-linked-observables.js";
import { anchorPointFromSchema, type GuiActionResult } from "./gui-action.js";
import { validateActiveRois } from "./observe.js";
import { mutationPolicyDisabledResult } from "./mutation-policy.js";
import { attachModelContent, type QuailbotToolResult } from "./tool-result.js";
import type { ToolContext } from "./tool-context.js";

export type SetFieldInput = {
  anchor: string;
  typed_text: string;
  submit?: "enter" | "tab";
  rois?: string[];
};

export async function executeSetField(
  ctx: ToolContext,
  input: SetFieldInput,
): Promise<QuailbotToolResult> {
  if (!ctx.mutationPolicy.mutatingToolsEnabled) {
    return mutationPolicyDisabledResult("set_field", input);
  }

  const anchor = validateSetFieldInput(ctx.workspace, input);
  const primaryResult = await setFieldPrimaryResult(ctx, anchor, input);
  const { observation: linkedObservation, content } = await readLinkedObservablesWithContent(
    ctx,
    resolveLinkedObservables(ctx.workspace, {
      kind: "set_field",
      anchor: input.anchor,
      linked_observables: input.rois,
    }),
  );

  return attachModelContent({
    ok: primaryResult.ok === true,
    action: "set_field",
    action_input: input,
    primary_result: primaryResult,
    linked_observation: linkedObservation,
  }, content);
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

type SetFieldPrimaryResult =
  | {
      ok: true;
      anchor: string;
      typed_text: string;
      submit?: "enter" | "tab";
      point: { x: number; y: number };
      backend: string;
      clear_strategy: "legacy_pyautogui_sequence";
    }
  | {
      ok: false;
      anchor: string;
      typed_text: string;
      submit?: "enter" | "tab";
      point?: { x: number; y: number };
      error_type: "gui_backend_unavailable" | "anchor_geometry_invalid" | "gui_action_failed";
      message: string;
    };

async function setFieldPrimaryResult(
  ctx: ToolContext,
  anchor: WorkspaceAnchor,
  input: SetFieldInput,
): Promise<SetFieldPrimaryResult> {
  const anchorName = anchor.name ?? anchor.ref;
  const point = anchorPointFromSchema(anchor);

  if (ctx.guiActionBackend === undefined) {
    return {
      ok: false,
      anchor: anchorName,
      typed_text: input.typed_text,
      ...(input.submit === undefined ? {} : { submit: input.submit }),
      ...(point === undefined ? {} : { point }),
      error_type: "gui_backend_unavailable",
      message: "GUI text-entry backend is not configured for this execution context.",
    };
  }

  if (point === undefined) {
    return {
      ok: false,
      anchor: anchorName,
      typed_text: input.typed_text,
      ...(input.submit === undefined ? {} : { submit: input.submit }),
      error_type: "anchor_geometry_invalid",
      message: `Anchor ${anchorName} must define finite x and y values.`,
    };
  }

  try {
    return successfulSetFieldResult(anchorName, input, await ctx.guiActionBackend.setField({
      anchor,
      typedText: input.typed_text,
      submit: input.submit,
    }));
  } catch (error) {
    return {
      ok: false,
      anchor: anchorName,
      typed_text: input.typed_text,
      ...(input.submit === undefined ? {} : { submit: input.submit }),
      point,
      error_type: "gui_action_failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function successfulSetFieldResult(
  anchor: string,
  input: SetFieldInput,
  result: GuiActionResult,
): SetFieldPrimaryResult {
  return {
    ok: true,
    anchor,
    typed_text: input.typed_text,
    ...(input.submit === undefined ? {} : { submit: input.submit }),
    point: result.point,
    backend: result.backend,
    clear_strategy: "legacy_pyautogui_sequence",
  };
}
