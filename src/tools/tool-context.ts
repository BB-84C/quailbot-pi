import { dirname } from "node:path";

import { runCli, type RunCli } from "../cli/cli-driver.js";
import type { ExperimentLogService } from "../experiment-log/experiment-log-service.js";
import type { Workspace } from "../workspace/types.js";
import { createDefaultGuiActionBackend, type GuiActionBackend } from "./gui-action.js";
import { mutationPolicyFromEnvironment, type MutationPolicy } from "./mutation-policy.js";
import { createDefaultRoiCaptureBackend, type RoiCaptureBackend } from "./roi-observation.js";

export type ToolContext = {
  workspace: Workspace;
  runCli: RunCli;
  mutationPolicy: MutationPolicy;
  guiActionBackend?: GuiActionBackend;
  roiCaptureBackend?: RoiCaptureBackend;
  modelSupportsImages?: boolean;
  notifyWarning?: (message: string) => void;
};

export function createToolContext({
  workspace,
  runCli: runner = runCli,
  mutationPolicy = mutationPolicyFromEnvironment(),
  cwd,
  experimentLog,
  guiActionBackend,
  roiCaptureBackend,
  modelSupportsImages,
  notifyWarning,
}: {
  workspace: Workspace;
  runCli?: RunCli;
  mutationPolicy?: MutationPolicy;
  cwd?: string;
  experimentLog?: ExperimentLogService;
  guiActionBackend?: GuiActionBackend;
  roiCaptureBackend?: RoiCaptureBackend;
  modelSupportsImages?: boolean;
  notifyWarning?: (message: string) => void;
}): ToolContext {
  const resolveExperimentDir = experimentLog === undefined
    ? undefined
    : () => {
        const identity = experimentLog.currentIdentity();
        return identity === undefined ? undefined : dirname(identity.events_path);
      };
  return {
    workspace,
    runCli: runner,
    mutationPolicy,
    guiActionBackend: guiActionBackend ?? (cwd === undefined ? undefined : createDefaultGuiActionBackend()),
    roiCaptureBackend:
      roiCaptureBackend ?? (cwd === undefined ? undefined : createDefaultRoiCaptureBackend({ resolveExperimentDir })),
    modelSupportsImages,
    notifyWarning,
  };
}

export function cliRef(cliName: string | undefined, name: string): string {
  return `${cliName || "cli"}:${name}`;
}
