import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { registerProviderPayloadLog } from "./debug/provider-payload-log.js";
import { registerExperimentCommands } from "./experiment-log/register-experiment-commands.js";
import { ExperimentLogService, experimentLogRoot } from "./experiment-log/experiment-log-service.js";
import { loadSessionExperimentIndex, saveSessionExperimentIndex } from "./experiment-log/session-experiment-index.js";
import type { ExperimentCloseReason } from "./experiment-log/experiment-log-types.js";
import { registerKnowledgeCommands } from "./knowledge/register-knowledge-commands.js";
import { registerMemoryCommands } from "./knowledge/register-memory-commands.js";
import { registerSettingsCommands } from "./knowledge/register-settings-commands.js";
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
  pendingExperimentStart?: { reason: string };
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
  registerSettingsCommands(pi, runtime);
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
    const reason = sessionStartReason(event);
    if (reason === "reload" && runtime.experimentLog !== undefined) {
      runtime.experimentLog.updateContext({ workspace: activeWorkspace, mutationPolicy: mutationPolicyFromEnvironment() });
      return;
    }

    if (runtime.experimentLog !== undefined) {
      closeExperimentLog(runtime, ctx, "session_restarted");
    }
    runtime.pendingExperimentStart = { reason };
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    closeExperimentLog(runtime, ctx, "session_shutdown");
    await stopWorkspaceUiServer(runtime);
  });

  pi.on("context", (event) => ({
    messages: projectQuailbotContextMessages(event.messages, {
      recentFullCliResultCount: runtime.knowledge.recentFullCliResultWindow,
      recentFullSkillResultCount: runtime.knowledge.skillBodyWindow,
      recentImageResultCount: runtime.knowledge.recentImageResultWindow,
    }),
  }));

  pi.on("before_agent_start", (event, ctx) => {
    if (runtime.experimentLog === undefined) {
      openExperimentLog(runtime, ctx, runtime.pendingExperimentStart?.reason ?? "unknown");
      runtime.pendingExperimentStart = undefined;
    }

    const mutationPolicy = mutationPolicyFromEnvironment();
    const workspaceContext = runtime.workspace ? buildWorkspaceContextText(runtime.workspace, mutationPolicy) : undefined;
    const planContext = runtime.planStore.render();

    const knowledgePrefix = renderKnowledgePrefixFromRuntime(runtime.knowledge, runtime.workspace);
    const systemPrompt = [buildQuailbotSystemPrompt(event.systemPromptOptions), workspaceContext, knowledgePrefix]
      .filter((part): part is string => part !== undefined && part.length > 0)
      .join("\n\n");

    if (planContext === undefined) {
      return { systemPrompt };
    }

    return {
      systemPrompt,
      message: {
        customType: "quailbot-context",
        content: planContext,
        display: false,
      },
    };
  });
}

function openExperimentLog(
  runtime: QuailbotRuntime,
  ctx: ExtensionContext,
  sessionStartReason: string,
): void {
  const service = new ExperimentLogService({
    root: experimentLogRoot(ctx.cwd),
    warn: (message) => notifyExperimentLogWarning(ctx, message),
  });
  const root = experimentLogRoot(ctx.cwd);
  const sessionId = currentSessionId(ctx);
  const index = loadSessionExperimentIndex(root, { warn: (message) => notifyExperimentLogWarning(ctx, message) });
  const indexedExperiment = sessionId === undefined ? undefined : index[sessionId];
  // A Pi session owns one experiment. Workspace changes are captured on each
  // event, so the former workspace-hash rollover would only fragment evidence.
  const result = service.open({
    sessionStartReason,
    workspace: runtime.activeWorkspace,
    mutationPolicy: mutationPolicyFromEnvironment(),
    ...(indexedExperiment === undefined
      ? {}
      : { resumeFrom: { experimentId: indexedExperiment.experiment_id, eventsPath: indexedExperiment.events_path } }),
  });

  if (!result.ok) {
    notifyExperimentLogWarning(ctx, `experiment log open failed: ${result.error}`);
    runtime.experimentLog = undefined;
    return;
  }

  runtime.experimentLog = service;
  const identity = service.currentIdentity();
  if (sessionId !== undefined && identity !== undefined) {
    index[sessionId] = {
      experiment_id: identity.experiment_id,
      events_path: identity.events_path,
      updated_at: new Date().toISOString(),
    };
    saveSessionExperimentIndex(root, index, { warn: (message) => notifyExperimentLogWarning(ctx, message) });
  }
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

function currentSessionId(ctx: ExtensionContext): string | undefined {
  try {
    const sessionManager = (ctx as ExtensionContext & { sessionManager?: { getSessionId?: () => unknown } }).sessionManager;
    const sessionId = sessionManager?.getSessionId?.();
    if (typeof sessionId === "string" && sessionId.length > 0) return sessionId;
  } catch {
    // Session indexing is fail-soft; an experiment can still be logged without reuse.
  }

  notifyExperimentLogWarning(ctx, "experiment session id unavailable; starting an unindexed experiment");
  return undefined;
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
