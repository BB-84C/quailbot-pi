import type { CliAction, CliActionPermissions, CliParameter, Workspace } from "../workspace/types.js";

export type WorkspaceSummary = {
  workspace_path: string;
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
  action_get: boolean;
  action_set: boolean;
  action_ramp: boolean;
};

export function buildWorkspaceSummary(workspace: Workspace): WorkspaceSummary {
  const enabledParameters = [...workspace.cli.parameters.values()]
    .filter((parameter) => parameter.enabled)
    .map(summarizeParameter);
  const enabledActions = [...workspace.cli.actions.values()].filter((action) => action.enabled).map(summarizeAction);

  return {
    workspace_path: workspace.sourcePath,
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

export function buildWorkspaceContextText(workspace: Workspace): string {
  return `WORKSPACE (Quailbot active workspace)\n${JSON.stringify(buildWorkspaceSummary(workspace), null, 2)}`;
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
    action_get: actions.some((action) => action.actions_available.get),
    action_set: actions.some((action) => action.actions_available.set),
    action_ramp: actions.some((action) => action.actions_available.ramp),
  };
}
