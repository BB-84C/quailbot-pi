import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { buildWorkspaceContextText } from "./prompt/workspace-summary.js";
import { PlanContextStore } from "./prompt/plan-context.js";
import { mutationPolicyFromEnvironment } from "./tools/mutation-policy.js";
import { registerQuailbotTools } from "./tools/register-tools.js";
import { loadWorkspace } from "./workspace/load-workspace.js";
import { resolveWorkspaceSelection } from "./workspace/workspace-state.js";
import type { Workspace } from "./workspace/types.js";

export type QuailbotRuntime = {
  workspace?: Workspace;
  planStore: PlanContextStore;
};

export default function quailbotExtension(pi: ExtensionAPI): void {
  const runtime: QuailbotRuntime = {
    planStore: new PlanContextStore(),
  };

  registerQuailbotTools(pi, runtime);

  pi.on("session_start", (_event, ctx) => {
    runtime.planStore.clear();

    try {
      const selection = resolveWorkspaceSelection({ cwd: ctx.cwd });
      runtime.workspace = loadWorkspace(selection.path);
    } catch (error) {
      runtime.workspace = undefined;
      notifyWarning(ctx, `Quailbot workspace unavailable: ${errorMessage(error)}`);
    }
  });

  pi.on("before_agent_start", () => {
    const mutationPolicy = mutationPolicyFromEnvironment();
    const content = [
      runtime.workspace ? buildWorkspaceContextText(runtime.workspace, mutationPolicy) : undefined,
      runtime.planStore.render(),
    ].filter((item): item is string => item !== undefined);

    if (content.length === 0) {
      return undefined;
    }

    return {
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
