import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { registerProviderPayloadLog } from "./debug/provider-payload-log.js";
import { registerExperimentCommands } from "./experiment-log/register-experiment-commands.js";
import { ExperimentLogService, experimentLogRoot } from "./experiment-log/experiment-log-service.js";
import type { ExperimentCloseReason } from "./experiment-log/experiment-log-types.js";
import { registerKnowledgeCommands } from "./knowledge/register-knowledge-commands.js";
import { registerMemoryCommands } from "./knowledge/register-memory-commands.js";
import { createKnowledgeRuntime, hydrateKnowledgeRuntime, renderKnowledgePrefixFromRuntime } from "./knowledge/knowledge-runtime.js";
import type { KnowledgeRuntime } from "./knowledge/knowledge-runtime.js";
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

export type QuailbotRuntime = {
  workspace?: Workspace;
  activeWorkspace?: LoadedWorkspace;
  workspaceUiServer?: WorkspaceUiServer;
  experimentLog?: ExperimentLogService;
  planStore: PlanContextStore;
  knowledge: KnowledgeRuntime;
};

export default function quailbotExtension(pi: ExtensionAPI): void {
  const runtime: QuailbotRuntime = {
    planStore: new PlanContextStore(),
    knowledge: createKnowledgeRuntime(),
  };

  registerQuailbotTools(pi, runtime);
  registerWorkspaceCommands(pi, runtime);
  registerKnowledgeCommands(pi, runtime);
  registerMemoryCommands(pi, runtime);
  registerExperimentCommands(pi);
  registerProviderPayloadLog(pi);

  pi.on("session_start", (event, ctx) => {
    runtime.planStore.clear();

    let activeWorkspace: LoadedWorkspace | undefined;
    try {
      activeWorkspace = loadActiveWorkspace({ cwd: ctx.cwd });
      runtime.activeWorkspace = activeWorkspace;
      runtime.workspace = activeWorkspace.workspace;
    } catch (error) {
      runtime.activeWorkspace = undefined;
      runtime.workspace = undefined;
      notifyWarning(ctx, `Quailbot workspace unavailable: ${errorMessage(error)}`);
    }

    hydrateKnowledgeRuntime(runtime.knowledge, ctx.cwd);
    synchronizeExperimentLog(runtime, ctx, sessionStartReason(event), activeWorkspace, mutationPolicyFromEnvironment());
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    closeExperimentLog(runtime, ctx, "session_shutdown");
    await stopWorkspaceUiServer(runtime);
  });

  pi.on("context", (event) => ({
    messages: projectQuailbotContextMessages(event.messages, {
      recentFullSkillResultCount: runtime.knowledge.skillBodyWindow,
    }),
  }));

  pi.on("before_agent_start", (event) => {
    const mutationPolicy = mutationPolicyFromEnvironment();
    const content = [
      runtime.workspace ? buildWorkspaceContextText(runtime.workspace, mutationPolicy) : undefined,
      runtime.planStore.render(),
    ].filter((item): item is string => item !== undefined);

    const knowledgePrefix = renderKnowledgePrefixFromRuntime(runtime.knowledge, runtime.workspace);
    const systemPrompt = [buildQuailbotSystemPrompt(event.systemPromptOptions), knowledgePrefix]
      .filter((part) => part.length > 0)
      .join("\n\n");

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

function synchronizeExperimentLog(
  runtime: QuailbotRuntime,
  ctx: ExtensionContext,
  reason: string,
  activeWorkspace: LoadedWorkspace | undefined,
  mutationPolicy: ReturnType<typeof mutationPolicyFromEnvironment>,
): void {
  try {
    if (reason === "reload" && runtime.experimentLog !== undefined) {
      if (runtime.experimentLog.currentWorkspaceHash() === activeWorkspace?.hash) {
        runtime.experimentLog.updateContext({ workspace: activeWorkspace, mutationPolicy });
        return;
      }

      const previousSessionFile = closeExperimentLog(runtime, ctx, "workspace_changed");
      openExperimentLog(runtime, ctx, reason, activeWorkspace, mutationPolicy, previousSessionFile);
      return;
    }

    const previousSessionFile = closeExperimentLog(runtime, ctx, "session_restarted");
    openExperimentLog(runtime, ctx, reason, activeWorkspace, mutationPolicy, previousSessionFile);
  } catch (error) {
    notifyExperimentLogWarning(ctx, `experiment log lifecycle failed: ${errorMessage(error)}`);
    runtime.experimentLog = undefined;
  }
}

function openExperimentLog(
  runtime: QuailbotRuntime,
  ctx: ExtensionContext,
  sessionStartReason: string,
  activeWorkspace: LoadedWorkspace | undefined,
  mutationPolicy: ReturnType<typeof mutationPolicyFromEnvironment>,
  previousSessionFile: string | undefined,
): void {
  const service = new ExperimentLogService({
    root: experimentLogRoot(ctx.cwd),
    warn: (message) => notifyExperimentLogWarning(ctx, message),
  });
  const result = service.open({
    sessionStartReason,
    previousSessionFile,
    workspace: activeWorkspace,
    mutationPolicy,
  });

  if (!result.ok) {
    notifyExperimentLogWarning(ctx, `experiment log open failed: ${result.error}`);
    runtime.experimentLog = undefined;
    return;
  }

  runtime.experimentLog = service;
}

function closeExperimentLog(
  runtime: QuailbotRuntime,
  ctx: ExtensionContext,
  reason: ExperimentCloseReason,
): string | undefined {
  const service = runtime.experimentLog;
  if (service === undefined) {
    return undefined;
  }

  const previousSessionFile = service.currentIdentity()?.events_path;
  const result = service.close(reason);
  runtime.experimentLog = undefined;

  if (!result.ok) {
    notifyExperimentLogWarning(ctx, `experiment log close failed: ${result.error}`);
  }

  return previousSessionFile;
}

function sessionStartReason(event: { reason?: unknown }): string {
  return typeof event.reason === "string" && event.reason.length > 0 ? event.reason : "unknown";
}

function notifyExperimentLogWarning(ctx: ExtensionContext, message: string): void {
  const warningMessage = `Quailbot experiment log warning: ${message}`;
  if (!ctx.hasUI) {
    console.warn(warningMessage);
    return;
  }

  try {
    ctx.ui.notify(warningMessage, "warning");
  } catch {
    console.warn(warningMessage);
  }
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
