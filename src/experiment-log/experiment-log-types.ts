import type { MutationPolicy } from "../tools/mutation-policy.js";
import type { QuailbotToolResult } from "../tools/tool-result.js";
import type { LoadedWorkspace, WorkspaceSummaryReadback } from "../workspace/workspace-service.js";

export const EXPERIMENT_LOG_SCHEMA_VERSION = 1 as const;

export type ExperimentOutcome =
  | "applied"
  | "measured"
  | "mutation_denied"
  | "validation_failed"
  | "step_failed"
  | "driver_failure"
  | "readback_failure"
  | "gui_backend_unavailable"
  | "exception"
  | "interrupted_unknown";

export type ExperimentLogEventKind =
  | "experiment_open"
  | "tool_invocation_started"
  | "tool_result"
  | "tool_exception"
  | "plan_step_result"
  | "experiment_close";

export type WorkspaceSnapshotSource = WorkspaceSummaryReadback["source"];

export type WorkspaceSnapshot = {
  path: string;
  hash: string;
  source: WorkspaceSnapshotSource;
};

export type MutationPolicySnapshot = {
  mutating_tools_enabled: boolean;
  enable_env_var: MutationPolicy["enableEnvVar"];
};

export type ExperimentLogEventBase<TKind extends ExperimentLogEventKind = ExperimentLogEventKind> = {
  schema_version: typeof EXPERIMENT_LOG_SCHEMA_VERSION;
  event_id: string;
  experiment_id: string;
  sequence: number;
  timestamp_utc: string;
  event_kind: TKind;
  workspace?: WorkspaceSnapshot;
  mutation_policy?: MutationPolicySnapshot;
};

export type ExperimentOpenEvent = ExperimentLogEventBase<"experiment_open">;

export type ToolInvocationStartedEvent = ExperimentLogEventBase<"tool_invocation_started"> & {
  tool_name: string;
  input: unknown;
};

export type ToolResultEvent = ExperimentLogEventBase<"tool_result"> & {
  result: QuailbotToolResult;
  outcome: ExperimentOutcome;
};

export type ToolExceptionEvent = ExperimentLogEventBase<"tool_exception"> & {
  tool_name: string;
  input: unknown;
  error_message: string;
};

export type PlanStepResultPayload = {
  index: number;
  kind: string;
  args: Record<string, unknown>;
  primary_result: unknown;
  linked_observation?: unknown;
};

export type PlanStepResultEvent = ExperimentLogEventBase<"plan_step_result"> & {
  step: PlanStepResultPayload;
  outcome: ExperimentOutcome;
};

export type ExperimentCloseReason = "session_shutdown" | "session_restarted" | "workspace_changed";

export type ExperimentCloseEvent = ExperimentLogEventBase<"experiment_close"> & {
  reason: ExperimentCloseReason;
};

export type ExperimentLogEvent =
  | ExperimentOpenEvent
  | ToolInvocationStartedEvent
  | ToolResultEvent
  | ToolExceptionEvent
  | PlanStepResultEvent
  | ExperimentCloseEvent;

export type ExperimentLogWriteResult =
  | {
      ok: true;
      path: string;
      event_id: string;
      sequence: number;
    }
  | {
      ok: false;
      path?: string;
      error: string;
    };

export function workspaceSnapshot(value: LoadedWorkspace | undefined): WorkspaceSnapshot | undefined {
  if (value === undefined) {
    return undefined;
  }

  return {
    path: value.selection.path,
    hash: value.hash,
    source: value.selection.source,
  };
}

export function mutationPolicySnapshot(value: MutationPolicy | undefined): MutationPolicySnapshot | undefined {
  if (value === undefined) {
    return undefined;
  }

  return {
    mutating_tools_enabled: value.mutatingToolsEnabled,
    enable_env_var: value.enableEnvVar,
  };
}
