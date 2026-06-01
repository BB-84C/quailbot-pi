import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import type { QuailbotRuntime } from "../extension.js";
import type { Workspace } from "../workspace/types.js";
import { executeCliAction } from "./cli_action.js";
import { executeCliGet } from "./cli_get.js";
import { executeCliRamp } from "./cli_ramp.js";
import { executeCliSet } from "./cli_set.js";
import { executeSleepSeconds } from "./sleep_seconds.js";
import { createToolContext } from "./tool-context.js";
import type { QuailbotToolResult } from "./tool-result.js";

const argsSchema = Type.Record(Type.String({ minLength: 1 }), Type.Any(), { minProperties: 1 });

export function registerQuailbotTools(pi: ExtensionAPI, runtime: QuailbotRuntime): void {
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
      timeout_ms: Type.Optional(Type.Number({ exclusiveMinimum: 0, description: "Optional CLI timeout in milliseconds." })),
    }),
    async execute(_toolCallId, params) {
      return piToolResult(await executeCliAction(runtimeToolContext(runtime), params));
    },
  });

  pi.registerTool({
    name: "sleep_seconds",
    label: "Sleep seconds",
    description: "Wait for a finite non-negative number of seconds before continuing.",
    parameters: Type.Object({
      seconds: Type.Number({ exclusiveMinimum: 0, description: "Number of seconds to wait." }),
    }),
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
