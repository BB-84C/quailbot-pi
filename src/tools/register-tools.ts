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
import { executeQuailbotPlanAndExecute, type PlanStepResultRecord } from "./quailbot_plan_and_execute.js";
import { executeQuailbotPlanwrite } from "./quailbot_planwrite.js";
import { executeQuailbotSkill } from "./quailbot_skill.js";
import { executeSetField } from "./set_field.js";
import { executeSleepSeconds } from "./sleep_seconds.js";
import { createToolContext } from "./tool-context.js";
import type { QuailbotToolResult } from "./tool-result.js";
import { buildQuailbotToolContent } from "./tool-result-projection.js";
import { makeQuailbotRenderCall, renderQuailbotToolResult } from "./tool-result-renderer.js";

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
const planAndExecuteStepSchema = Type.Union([
  Type.Object({
    kind: Type.Literal("cli_get"),
    cli_name: Type.Optional(Type.String({ minLength: 1 })),
    parameter: Type.String({ minLength: 1 }),
    timeout_ms: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
  }),
  Type.Object({
    kind: Type.Literal("cli_set"),
    cli_name: Type.Optional(Type.String({ minLength: 1 })),
    parameter: Type.String({ minLength: 1 }),
    value: Type.Optional(Type.Any()),
    args: Type.Optional(argsSchema),
    linked_observables: Type.Optional(linkedObservablesSchema),
    timeout_ms: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
  }),
  Type.Object({
    kind: Type.Literal("cli_ramp"),
    cli_name: Type.Optional(Type.String({ minLength: 1 })),
    parameter: Type.String({ minLength: 1 }),
    start: Type.Number(),
    end: Type.Number(),
    step: Type.Number(),
    interval_s: Type.Number(),
    linked_observables: Type.Optional(linkedObservablesSchema),
    timeout_ms: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
  }),
  Type.Object({
    kind: Type.Literal("cli_action"),
    cli_name: Type.Optional(Type.String({ minLength: 1 })),
    action_name: Type.String({ minLength: 1 }),
    args: Type.Optional(argsSchema),
    linked_observables: Type.Optional(linkedObservablesSchema),
    timeout_ms: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
  }),
  Type.Object({
    kind: Type.Literal("click_anchor"),
    anchor: Type.String({ minLength: 1 }),
    rois: Type.Optional(roisSchema),
  }),
  Type.Object({
    kind: Type.Literal("set_field"),
    anchor: Type.String({ minLength: 1 }),
    typed_text: Type.String({ minLength: 1 }),
    submit: Type.Optional(Type.Union([Type.Literal("enter"), Type.Literal("tab")])),
    rois: Type.Optional(roisSchema),
  }),
  Type.Object({
    kind: Type.Literal("observe"),
    rois: Type.Optional(roisSchema),
  }),
  Type.Object({
    kind: Type.Literal("sleep_seconds"),
    seconds: Type.Number({ minimum: 0 }),
  }),
]);
const planAndExecuteParameters = Type.Object({ steps: Type.Array(planAndExecuteStepSchema, { minItems: 1 }) });

export function registerQuailbotTools(pi: ExtensionAPI, runtime: QuailbotRuntime): void {
  pi.registerTool({
    name: "quailbot_planwrite",
    label: "Quailbot planwrite",
    description: "Write persistent or ephemeral plan context for future Quailbot agent turns.",
    renderCall: makeQuailbotRenderCall("quailbot_planwrite"),
    renderResult: renderQuailbotToolResult,
    parameters: Type.Object({
      text: Type.String({ description: "Plan text to write or return ephemerally." }),
      mode: Type.Union([Type.Literal("system"), Type.Literal("ephemeral")], {
        description: "Persist text into system plan context or return it ephemerally.",
      }),
      clean: Type.Optional(Type.Boolean({ description: "Clear the persistent plan before processing this input." })),
    }),
    async execute(_toolCallId, params) {
      return piToolResult(await executeQuailbotPlanwrite(runtime.planStore, params));
    },
  });

  pi.registerTool({
    name: "quailbot_skill",
    label: "Quailbot skill",
    description: "Load a workspace-registered Quailbot skill by name. Prepends a fixed warning if a required CLI driver is missing from the active workspace.",
    renderCall: makeQuailbotRenderCall("quailbot_skill"),
    renderResult: renderQuailbotToolResult,
    parameters: Type.Object({
      name: Type.String({ minLength: 1, description: "Skill name from the catalog in the system prompt." }),
    }),
    async execute(toolCallId, params) {
      return piToolResult(
        await executeLoggedTool(runtime, toolCallId, "quailbot_skill", params, async () =>
          executeQuailbotSkill(runtime.workspace, runtime.knowledge.cwd, runtime.knowledge.skillCache, params),
        ),
      );
    },
  });

  pi.registerTool({
    name: "cli_get",
    label: "CLI get",
    description: "Read a workspace-declared CLI parameter through the configured driver-agnostic CLI executable.",
    renderCall: makeQuailbotRenderCall("cli_get"),
    renderResult: renderQuailbotToolResult,
    parameters: Type.Object({
      cli_name: Type.Optional(
        Type.String({ minLength: 1, description: "CLI executable name, defaults to the workspace CLI name." }),
      ),
      parameter: Type.String({ minLength: 1, description: "Workspace parameter name to read." }),
      timeout_ms: Type.Optional(Type.Number({ exclusiveMinimum: 0, description: "Optional CLI timeout in milliseconds." })),
    }),
    async execute(toolCallId, params) {
      return piToolResult(
        await executeLoggedTool(runtime, toolCallId, "cli_get", params, async () => executeCliGet(runtimeToolContext(runtime), params)),
      );
    },
  });

  pi.registerTool({
    name: "cli_set",
    label: "CLI set",
    description: "Set a workspace-declared CLI parameter through the configured driver-agnostic CLI executable.",
    renderCall: makeQuailbotRenderCall("cli_set"),
    renderResult: renderQuailbotToolResult,
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
    async execute(toolCallId, params) {
      return piToolResult(
        await executeLoggedTool(runtime, toolCallId, "cli_set", params, async () => executeCliSet(runtimeToolContext(runtime), params)),
      );
    },
  });

  pi.registerTool({
    name: "cli_ramp",
    label: "CLI ramp",
    description: "Ramp a workspace-declared CLI parameter through the configured driver-agnostic CLI executable.",
    renderCall: makeQuailbotRenderCall("cli_ramp"),
    renderResult: renderQuailbotToolResult,
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
    async execute(toolCallId, params) {
      return piToolResult(
        await executeLoggedTool(runtime, toolCallId, "cli_ramp", params, async () => executeCliRamp(runtimeToolContext(runtime), params)),
      );
    },
  });

  pi.registerTool({
    name: "cli_action",
    label: "CLI action",
    description: "Run a workspace-declared CLI action through the configured driver-agnostic CLI executable.",
    renderCall: makeQuailbotRenderCall("cli_action"),
    renderResult: renderQuailbotToolResult,
    parameters: Type.Object({
      cli_name: Type.Optional(
        Type.String({ minLength: 1, description: "CLI executable name, defaults to the workspace CLI name." }),
      ),
      action_name: Type.String({ minLength: 1, description: "Workspace action name to invoke." }),
      args: Type.Optional(argsSchema),
      linked_observables: Type.Optional(linkedObservablesSchema),
      timeout_ms: Type.Optional(Type.Number({ exclusiveMinimum: 0, description: "Optional CLI timeout in milliseconds." })),
    }),
    async execute(toolCallId, params) {
      return piToolResult(
        await executeLoggedTool(runtime, toolCallId, "cli_action", params, async () => executeCliAction(runtimeToolContext(runtime), params)),
      );
    },
  });

  pi.registerTool({
    name: "observe",
    label: "Observe GUI ROIs",
    description: "Request GUI ROI screenshot/OCR readback. This plugin round exposes the explicit unavailable backend boundary.",
    renderCall: makeQuailbotRenderCall("observe"),
    renderResult: renderQuailbotToolResult,
    parameters: Type.Object({
      rois: Type.Optional(roisSchema),
    }),
    async execute(toolCallId, params) {
      return piToolResult(
        await executeLoggedTool(runtime, toolCallId, "observe", params, async () => executeObserve(runtimeToolContext(runtime), params)),
      );
    },
  });

  pi.registerTool({
    name: "click_anchor",
    label: "Click GUI anchor",
    description: "Click an active workspace GUI anchor. This plugin round exposes the explicit unavailable backend boundary.",
    renderCall: makeQuailbotRenderCall("click_anchor"),
    renderResult: renderQuailbotToolResult,
    parameters: Type.Object({
      anchor: Type.String({ minLength: 1, description: "Active workspace anchor name or ref to click." }),
      rois: Type.Optional(roisSchema),
    }),
    async execute(toolCallId, params) {
      return piToolResult(
        await executeLoggedTool(runtime, toolCallId, "click_anchor", params, async () =>
          executeClickAnchor(runtimeToolContext(runtime), params),
        ),
      );
    },
  });

  pi.registerTool({
    name: "set_field",
    label: "Set GUI field",
    description: "Type text into an active workspace GUI anchor. This plugin round exposes the explicit unavailable backend boundary.",
    renderCall: makeQuailbotRenderCall("set_field"),
    renderResult: renderQuailbotToolResult,
    parameters: Type.Object({
      anchor: Type.String({ minLength: 1, description: "Active workspace anchor name or ref for text entry." }),
      typed_text: Type.String({ minLength: 1, description: "Text to type into the GUI field." }),
      submit: Type.Optional(Type.Union([Type.Literal("enter"), Type.Literal("tab")], { description: "Optional submit key." })),
      rois: Type.Optional(roisSchema),
    }),
    async execute(toolCallId, params) {
      return piToolResult(
        await executeLoggedTool(runtime, toolCallId, "set_field", params, async () => executeSetField(runtimeToolContext(runtime), params)),
      );
    },
  });

  pi.registerTool({
    name: "sleep_seconds",
    label: "Sleep seconds",
    description: "Wait for a finite non-negative number of seconds before continuing.",
    renderCall: makeQuailbotRenderCall("sleep_seconds"),
    renderResult: renderQuailbotToolResult,
    parameters: sleepSecondsParameters,
    async execute(_toolCallId, params) {
      return piToolResult(await executeSleepSeconds(params));
    },
  });

  pi.registerTool({
    name: "quailbot_plan_and_execute",
    label: "Quailbot Plan And Execute",
    description: "Execute a concrete serial Quailbot program and return one final result with per-step readbacks.",
    renderCall: makeQuailbotRenderCall("quailbot_plan_and_execute"),
    renderResult: renderQuailbotToolResult,
    parameters: planAndExecuteParameters,
    async execute(toolCallId, params) {
      return piToolResult(
        await executeLoggedTool(runtime, toolCallId, "quailbot_plan_and_execute", params, async (parentEventId) =>
          executeQuailbotPlanAndExecute(runtimeToolContext(runtime), params as never, {
            onStepResult: (step) => recordPlanStep(runtime, toolCallId, parentEventId, step),
          }),
        ),
      );
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

async function executeLoggedTool(
  runtime: QuailbotRuntime,
  toolCallId: string,
  toolName: string,
  params: unknown,
  run: (parentEventId: string | undefined) => Promise<QuailbotToolResult>,
): Promise<QuailbotToolResult> {
  const startedAt = Date.now();
  const parentEventId = recordToolInvocationStarted(runtime, toolCallId, toolName, params);

  try {
    const result = await run(parentEventId);
    recordToolResult(runtime, toolCallId, parentEventId, toolName, result, durationSince(startedAt));
    return result;
  } catch (error) {
    recordToolException(runtime, toolCallId, parentEventId, toolName, params, error, durationSince(startedAt));
    throw error;
  }
}

function recordToolInvocationStarted(
  runtime: QuailbotRuntime,
  toolCallId: string,
  toolName: string,
  actionInput: unknown,
): string | undefined {
  try {
    const result = runtime.experimentLog?.recordToolInvocationStarted({ toolCallId, toolName, actionInput });
    return result?.ok ? result.event_id : undefined;
  } catch {
    return undefined;
  }
}

function recordToolResult(
  runtime: QuailbotRuntime,
  toolCallId: string,
  parentEventId: string | undefined,
  toolName: string,
  result: QuailbotToolResult,
  durationMs: number,
): void {
  try {
    runtime.experimentLog?.recordToolResult({
      toolCallId,
      ...(parentEventId === undefined ? {} : { parentEventId }),
      toolName,
      result,
      durationMs,
    });
  } catch {
    // Experiment telemetry is fail-soft and must not affect tool results.
  }
}

function recordToolException(
  runtime: QuailbotRuntime,
  toolCallId: string,
  parentEventId: string | undefined,
  toolName: string,
  actionInput: unknown,
  error: unknown,
  durationMs: number,
): void {
  try {
    runtime.experimentLog?.recordToolException({
      toolCallId,
      ...(parentEventId === undefined ? {} : { parentEventId }),
      toolName,
      actionInput,
      error,
      durationMs,
    });
  } catch {
    // Preserve the original tool exception even if telemetry fails.
  }
}

function recordPlanStep(
  runtime: QuailbotRuntime,
  toolCallId: string,
  parentEventId: string | undefined,
  step: PlanStepResultRecord,
): void {
  try {
    runtime.experimentLog?.recordPlanStepResult({
      toolCallId,
      ...(parentEventId === undefined ? {} : { parentEventId }),
      step,
    });
  } catch {
    // Step telemetry is best-effort only.
  }
}

function durationSince(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}

function piToolResult(result: QuailbotToolResult) {
  return {
    content: [{ type: "text" as const, text: buildQuailbotToolContent(result) }],
    details: result,
  };
}
