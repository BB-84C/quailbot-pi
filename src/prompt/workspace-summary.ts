import type { CliAction, CliActionPermissions, CliParameter, Workspace } from "../workspace/types.js";
import {
  MUTATING_TOOL_KINDS,
  READ_ONLY_WITHOUT_MUTATION_ENABLE,
  mutationPolicyFromEnvironment,
  type MutationPolicy,
} from "../tools/mutation-policy.js";

export type WorkspaceSummary = {
  workspace_path: string;
  mutation_policy: WorkspaceMutationPolicySummary;
  active_rois: WorkspaceRoiSummary[];
  active_anchors: WorkspaceAnchorSummary[];
  cli: {
    enabled: boolean;
    default_cli_name: string;
    enabledParameters: WorkspaceCliParameterSummary[];
    enabledActions: WorkspaceCliActionSummary[];
    actionsAvailable: WorkspaceActionsAvailableSummary;
  };
};

export type WorkspaceMutationPolicySummary = {
  mutating_tools_enabled: boolean;
  enable_env_var: MutationPolicy["enableEnvVar"];
  blocked_without_enable: typeof MUTATING_TOOL_KINDS;
  allowed_without_enable: typeof READ_ONLY_WITHOUT_MUTATION_ENABLE;
};

export type WorkspaceRoiSummary = {
  ref: string;
  name?: string;
  linked_observables: string[];
  schema: Record<string, unknown>;
};

export type WorkspaceAnchorSummary = {
  ref: string;
  name?: string;
  linked_observables: string[];
  linked_rois: string[];
  schema: Record<string, unknown>;
};

export type WorkspaceCliParameterSummary = {
  ref: string;
  cli_name: string;
  name: string;
  label?: string;
  description?: string;
  linked_observables: string[];
  actions_available: CliActionPermissions;
  schema: Record<string, unknown>;
};

export type WorkspaceCliActionSummary = {
  ref: string;
  cli_name: string;
  name: string;
  description?: string;
  safety_mode?: string;
  linked_observables: string[];
  actions_available: CliActionPermissions;
  action_cmd?: Record<string, unknown>;
  schema: Record<string, unknown>;
};

export type WorkspaceActionsAvailableSummary = {
  cli_get: boolean;
  cli_set: boolean;
  cli_ramp: boolean;
  cli_action: boolean;
};

export function buildWorkspaceSummary(
  workspace: Workspace,
  policy: MutationPolicy = mutationPolicyFromEnvironment(),
): WorkspaceSummary {
  const enabledParameters = [...workspace.cli.parameters.values()]
    .filter((parameter) => parameter.enabled)
    .map(summarizeParameter);
  const enabledActions = [...workspace.cli.actions.values()].filter((action) => action.enabled).map(summarizeAction);

  return {
    workspace_path: workspace.sourcePath,
    mutation_policy: summarizeMutationPolicy(policy),
    active_rois: workspace.rois
      .filter((roi) => roi.active)
      .map((roi) => ({
        ref: roi.ref,
        ...(roi.name !== undefined ? { name: roi.name } : {}),
        linked_observables: roi.linkedObservables,
        schema: roi.schema,
      })),
    active_anchors: workspace.anchors
      .filter((anchor) => anchor.active)
      .map((anchor) => ({
        ref: anchor.ref,
        ...(anchor.name !== undefined ? { name: anchor.name } : {}),
        linked_observables: anchor.linkedObservables,
        linked_rois: anchor.linkedRois,
        schema: anchor.schema,
      })),
    cli: {
      enabled: workspace.cli.enabled,
      default_cli_name: workspace.cli.defaultCliName,
      enabledParameters,
      enabledActions,
      actionsAvailable: summarizeActionsAvailable(enabledParameters, enabledActions),
    },
  };
}

export function buildWorkspaceContextText(
  workspace: Workspace,
  policy: MutationPolicy = mutationPolicyFromEnvironment(),
): string {
  return `WORKSPACE (Quailbot active workspace)\n${JSON.stringify(buildWorkspaceSummary(workspace, policy), null, 2)}`;
}

function summarizeMutationPolicy(policy: MutationPolicy): WorkspaceMutationPolicySummary {
  return {
    mutating_tools_enabled: policy.mutatingToolsEnabled,
    enable_env_var: policy.enableEnvVar,
    blocked_without_enable: MUTATING_TOOL_KINDS,
    allowed_without_enable: READ_ONLY_WITHOUT_MUTATION_ENABLE,
  };
}

function summarizeParameter(parameter: CliParameter): WorkspaceCliParameterSummary {
  return {
    ref: parameter.ref,
    cli_name: parameter.cliName,
    name: parameter.name,
    ...(parameter.label !== undefined ? { label: parameter.label } : {}),
    ...(parameter.description !== undefined ? { description: parameter.description } : {}),
    linked_observables: parameter.linkedObservables,
    actions_available: parameter.actions,
    schema: parameter.schema,
  };
}

function summarizeAction(action: CliAction): WorkspaceCliActionSummary {
  return {
    ref: action.ref,
    cli_name: action.cliName,
    name: action.name,
    ...(action.description !== undefined ? { description: action.description } : {}),
    ...(action.safetyMode !== undefined ? { safety_mode: action.safetyMode } : {}),
    linked_observables: action.linkedObservables,
    actions_available: action.actions,
    ...(action.actionCmd !== undefined ? { action_cmd: action.actionCmd } : {}),
    schema: action.schema,
  };
}

function summarizeActionsAvailable(
  parameters: WorkspaceCliParameterSummary[],
  actions: WorkspaceCliActionSummary[],
): WorkspaceActionsAvailableSummary {
  return {
    cli_get: parameters.some((parameter) => parameter.actions_available.get),
    cli_set: parameters.some((parameter) => parameter.actions_available.set),
    cli_ramp: parameters.some((parameter) => parameter.actions_available.ramp),
    cli_action: actions.some((action) => action.safety_mode !== "blocked"),
  };
}
