import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import type { QuailbotRuntime } from "../extension.js";
import type { Workspace } from "../workspace/types.js";
import { executeClickAnchor } from "./click_anchor.js";
import { executeCliAction } from "./cli_action.js";
import { executeCliGet } from "./cli_get.js";
import { executeCliRamp } from "./cli_ramp.js";
import { executeCliSet } from "./cli_set.js";
import { executeObserve } from "./observe.js";
import { executeQuailbotPlanwrite } from "./quailbot_planwrite.js";
import { executeSetField } from "./set_field.js";
import { executeSleepSeconds } from "./sleep_seconds.js";
import { createToolContext } from "./tool-context.js";
import type { QuailbotToolResult } from "./tool-result.js";

const argsSchema = Type.Record(Type.String({ minLength: 1 }), Type.Any(), { minProperties: 1 });
const linkedObservablesSchema = Type.Array(Type.String({ minLength: 1 }), {
  description: "Additional linked observables to read after this mutating command.",
});
const roisSchema = Type.Array(Type.String({ minLength: 1 }), {
  description: "Workspace ROI names or refs to use for GUI readback.",
});
export const sleepSecondsParameters = Type.Object({
  seconds: Type.Number({ minimum: 0, description: "Number of seconds to wait." }),
});

export function registerQuailbotTools(pi: ExtensionAPI, runtime: QuailbotRuntime): void {
  pi.registerTool({
    name: "quailbot_planwrite",
    label: "Quailbot planwrite",
    description: "Write persistent or ephemeral plan context for future Quailbot agent turns.",
    parameters: Type.Object({
      text: Type.String({ description: "Plan text to write or return ephemerally." }),
      mode: Type.Union([Type.Literal("system"), Type.Literal("ephemeral")], {
        description: "Persist text into system plan context or return it ephemerally.",
      }),
      clean: Type.Optional(Type.Boolean({ description: "Clear the persistent plan before processing this input." })),
    }),
    async execute(_toolCallId, params) {
      return piToolResult(await executeQuailbotPlanwrite(runtime.planContext, params));
    },
  });

  pi.registerTool({
    name: "cli_get",
    label: "CLI get",
    description: "Read a workspace-declared CLI parameter through the configured driver-agnostic CLI executable.",
    parameters: Type.Object({
      cli_name: Type.Optional(
        Type.String({ minLength: 1, description: "CLI executable name, defaults to the workspace CLI name." }),
      ),
      parameter: Type.String({ minLength: 1, description: "Workspace parameter name to read." }),
      timeout_ms: Type.Optional(Type.Number({ exclusiveMinimum: 0, description: "Optional CLI timeout in milliseconds." })),
    }),
    async execute(_toolCallId, params) {
      return piToolResult(await executeCliGet(runtimeToolContext(runtime), params));
    },
  });

  pi.registerTool({
    name: "cli_set",
    label: "CLI set",
    description: "Set a workspace-declared CLI parameter through the configured driver-agnostic CLI executable.",
    parameters: Type.Object({
      cli_name: Type.Optional(
        Type.String({ minLength: 1, description: "CLI executable name, defaults to the workspace CLI name." }),
      ),
      parameter: Type.String({ minLength: 1, description: "Workspace parameter name to set." }),
      value: Type.Optional(Type.Any({ description: "Single value to pass to the CLI set command." })),
      args: Type.Optional(argsSchema),
      linked_observables: Type.Optional(linkedObservablesSchema),
      timeout_ms: Type.Optional(Type.Number({ exclusiveMinimum: 0, description: "Optional CLI timeout in milliseconds." })),
    }),
    async execute(_toolCallId, params) {
      return piToolResult(await executeCliSet(runtimeToolContext(runtime), params));
    },
  });

  pi.registerTool({
    name: "cli_ramp",
    label: "CLI ramp",
    description: "Ramp a workspace-declared CLI parameter through the configured driver-agnostic CLI executable.",
    parameters: Type.Object({
      cli_name: Type.Optional(
        Type.String({ minLength: 1, description: "CLI executable name, defaults to the workspace CLI name." }),
      ),
      parameter: Type.String({ minLength: 1, description: "Workspace parameter name to ramp." }),
      start: Type.Number({ description: "Ramp start value." }),
      end: Type.Number({ description: "Ramp end value." }),
      step: Type.Number({ description: "Ramp step value." }),
      interval_s: Type.Number({ description: "Interval between ramp steps in seconds." }),
      linked_observables: Type.Optional(linkedObservablesSchema),
      timeout_ms: Type.Optional(Type.Number({ exclusiveMinimum: 0, description: "Optional CLI timeout in milliseconds." })),
    }),
    async execute(_toolCallId, params) {
      return piToolResult(await executeCliRamp(runtimeToolContext(runtime), params));
    },
  });

  pi.registerTool({
    name: "cli_action",
    label: "CLI action",
    description: "Run a workspace-declared CLI action through the configured driver-agnostic CLI executable.",
    parameters: Type.Object({
      cli_name: Type.Optional(
        Type.String({ minLength: 1, description: "CLI executable name, defaults to the workspace CLI name." }),
      ),
      action_name: Type.String({ minLength: 1, description: "Workspace action name to invoke." }),
      args: Type.Optional(argsSchema),
      linked_observables: Type.Optional(linkedObservablesSchema),
      timeout_ms: Type.Optional(Type.Number({ exclusiveMinimum: 0, description: "Optional CLI timeout in milliseconds." })),
    }),
    async execute(_toolCallId, params) {
      return piToolResult(await executeCliAction(runtimeToolContext(runtime), params));
    },
  });

  pi.registerTool({
    name: "observe",
    label: "Observe GUI ROIs",
    description: "Request GUI ROI screenshot/OCR readback. This plugin round exposes the explicit unavailable backend boundary.",
    parameters: Type.Object({
      rois: Type.Optional(roisSchema),
    }),
    async execute(_toolCallId, params) {
      return piToolResult(await executeObserve(runtimeToolContext(runtime), params));
    },
  });

  pi.registerTool({
    name: "click_anchor",
    label: "Click GUI anchor",
    description: "Click an active workspace GUI anchor. This plugin round exposes the explicit unavailable backend boundary.",
    parameters: Type.Object({
      anchor: Type.String({ minLength: 1, description: "Active workspace anchor name or ref to click." }),
      rois: Type.Optional(roisSchema),
    }),
    async execute(_toolCallId, params) {
      return piToolResult(await executeClickAnchor(runtimeToolContext(runtime), params));
    },
  });

  pi.registerTool({
    name: "set_field",
    label: "Set GUI field",
    description: "Type text into an active workspace GUI anchor. This plugin round exposes the explicit unavailable backend boundary.",
    parameters: Type.Object({
      anchor: Type.String({ minLength: 1, description: "Active workspace anchor name or ref for text entry." }),
      typed_text: Type.String({ minLength: 1, description: "Text to type into the GUI field." }),
      submit: Type.Optional(Type.Union([Type.Literal("enter"), Type.Literal("tab")], { description: "Optional submit key." })),
      rois: Type.Optional(roisSchema),
    }),
    async execute(_toolCallId, params) {
      return piToolResult(await executeSetField(runtimeToolContext(runtime), params));
    },
  });

  pi.registerTool({
    name: "sleep_seconds",
    label: "Sleep seconds",
    description: "Wait for a finite non-negative number of seconds before continuing.",
    parameters: sleepSecondsParameters,
    async execute(_toolCallId, params) {
      return piToolResult(await executeSleepSeconds(params));
    },
  });
}

function runtimeToolContext(runtime: QuailbotRuntime) {
  return createToolContext({ workspace: requireWorkspace(runtime) });
}

function requireWorkspace(runtime: QuailbotRuntime): Workspace {
  if (!runtime.workspace) {
    throw new Error("Quailbot workspace is not loaded; start a session with a valid workspace before using CLI tools");
  }

  return runtime.workspace;
}

function piToolResult(result: QuailbotToolResult) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    details: result,
  };
}
