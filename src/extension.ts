import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { buildQuailbotSystemPrompt } from "./prompt/quailbot-system-prompt.js";
import { buildWorkspaceContextText } from "./prompt/workspace-summary.js";
import { PlanContextStore } from "./prompt/plan-context.js";
import { mutationPolicyFromEnvironment } from "./tools/mutation-policy.js";
import { registerQuailbotTools } from "./tools/register-tools.js";
import { projectQuailbotContextMessages } from "./tools/tool-result-context.js";
import { registerWorkspaceCommands } from "./workspace/register-workspace-commands.js";
import { loadActiveWorkspace } from "./workspace/workspace-service.js";
import type { LoadedWorkspace } from "./workspace/workspace-service.js";
import type { Workspace } from "./workspace/types.js";
import { stopWorkspaceUiServer, type WorkspaceUiServer } from "./workspace-ui/server.js";

export type PendingWorkspaceActivation = { targetPath: string; expectedHash: string };

export type QuailbotRuntime = {
  workspace?: Workspace;
  activeWorkspace?: LoadedWorkspace;
  pendingWorkspaceActivation?: PendingWorkspaceActivation;
  workspaceUiServer?: WorkspaceUiServer;
  planStore: PlanContextStore;
};

export default function quailbotExtension(pi: ExtensionAPI): void {
  const runtime: QuailbotRuntime = {
    planStore: new PlanContextStore(),
  };

  registerQuailbotTools(pi, runtime);
  registerWorkspaceCommands(pi, runtime);

  pi.on("session_start", (_event, ctx) => {
    runtime.planStore.clear();
    runtime.pendingWorkspaceActivation = undefined;

    try {
      const activeWorkspace = loadActiveWorkspace({ cwd: ctx.cwd });
      runtime.activeWorkspace = activeWorkspace;
      runtime.workspace = activeWorkspace.workspace;
    } catch (error) {
      runtime.activeWorkspace = undefined;
      runtime.workspace = undefined;
      notifyWarning(ctx, `Quailbot workspace unavailable: ${errorMessage(error)}`);
    }
  });

  pi.on("session_shutdown", async () => {
    try {
      await stopWorkspaceUiServer(runtime);
    } finally {
      runtime.pendingWorkspaceActivation = undefined;
    }
  });

  pi.on("context", (event) => ({
    messages: projectQuailbotContextMessages(event.messages),
  }));

  pi.on("before_agent_start", (event) => {
    const mutationPolicy = mutationPolicyFromEnvironment();
    const content = [
      runtime.workspace ? buildWorkspaceContextText(runtime.workspace, mutationPolicy) : undefined,
      runtime.planStore.render(),
    ].filter((item): item is string => item !== undefined);

    const systemPrompt = buildQuailbotSystemPrompt(event.systemPromptOptions);

    if (content.length === 0) {
      return { systemPrompt };
    }

    return {
      systemPrompt,
      message: {
        customType: "quailbot-context",
        content: content.join("\n\n"),
        display: false,
      },
    };
  });
}

function notifyWarning(ctx: ExtensionContext, message: string): void {
  if (!ctx.hasUI) {
    return;
  }

  ctx.ui.notify(message, "warning");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
