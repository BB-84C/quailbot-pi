import { runCli, type RunCli } from "../cli/cli-driver.js";
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
  guiActionBackend,
  roiCaptureBackend,
  modelSupportsImages = false,
  notifyWarning,
}: {
  workspace: Workspace;
  runCli?: RunCli;
  mutationPolicy?: MutationPolicy;
  cwd?: string;
  guiActionBackend?: GuiActionBackend;
  roiCaptureBackend?: RoiCaptureBackend;
  modelSupportsImages?: boolean;
  notifyWarning?: (message: string) => void;
}): ToolContext {
  return {
    workspace,
    runCli: runner,
    mutationPolicy,
    guiActionBackend: guiActionBackend ?? (cwd === undefined ? undefined : createDefaultGuiActionBackend()),
    roiCaptureBackend: roiCaptureBackend ?? (cwd === undefined ? undefined : createDefaultRoiCaptureBackend(cwd)),
    modelSupportsImages,
    notifyWarning,
  };
}

export function cliRef(cliName: string | undefined, name: string): string {
  return `${cliName || "cli"}:${name}`;
}
