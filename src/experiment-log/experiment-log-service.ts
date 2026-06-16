import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import type { MutationPolicy } from "../tools/mutation-policy.js";
import type { QuailbotToolResult } from "../tools/tool-result.js";
import type { LoadedWorkspace } from "../workspace/workspace-service.js";
import { quailbotStateRoot } from "../workspace/workspace-state.js";
import { classifyPlanStepOutcome, classifyToolOutcome } from "./classify-outcome.js";
import {
  EXPERIMENT_LOG_SCHEMA_VERSION,
  mutationPolicySnapshot,
  workspaceSnapshot,
  type ExperimentCloseEvent,
  type ExperimentCloseReason,
  type ExperimentLogEvent,
  type ExperimentLogEventBase,
  type ExperimentLogEventKind,
  type ExperimentLogWriteResult,
  type ExperimentOpenEvent,
  type PlanStepResultEvent,
  type PlanStepResultPayload,
  type ToolExceptionEvent,
  type ToolInvocationStartedEvent,
  type ToolResultEvent,
} from "./experiment-log-types.js";

export type ExperimentLogIdentity = {
  experiment_id: string;
  events_path: string;
  blobs_path: string;
  started_at: string;
};

export type ExperimentLogServiceOptions = {
  root: string;
  now?: () => Date;
  idFactory?: () => string;
  appendLine?: (path: string, line: string) => void;
  warn?: (message: string) => void;
};

export type ExperimentLogOpenOptions = {
  sessionStartReason: string;
  previousSessionFile?: string;
  workspace?: LoadedWorkspace;
  mutationPolicy?: MutationPolicy;
};

export type ToolInvocationStartedInput = {
  toolCallId: string;
  toolName: string;
  actionInput: unknown;
};

export type ToolResultInput = {
  toolCallId: string;
  parentEventId?: string;
  toolName: string;
  result: QuailbotToolResult;
  durationMs?: number;
};

export type ToolExceptionInput = ToolInvocationStartedInput & {
  parentEventId?: string;
  error: unknown;
  durationMs?: number;
};

export type PlanStepResultInput = {
  toolCallId: string;
  parentEventId?: string;
  step: PlanStepResultPayload;
  durationMs?: number;
};

export function experimentLogRoot(cwd = process.cwd()): string {
  return join(quailbotStateRoot(cwd), "experiments");
}

export class ExperimentLogService {
  private readonly root: string;
  private readonly now: () => Date;
  private readonly idFactory?: () => string;
  private readonly appendLine: (path: string, line: string) => void;
  private readonly warn?: (message: string) => void;
  private identity: ExperimentLogIdentity | undefined;
  private workspace: LoadedWorkspace | undefined;
  private mutationPolicy: MutationPolicy | undefined;
  private sequence = 0;
  private eventCount = 0;

  constructor(options: ExperimentLogServiceOptions) {
    this.root = options.root;
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory;
    this.appendLine =
      options.appendLine ??
      ((path, line) => {
        mkdirSync(dirname(path), { recursive: true });
        appendFileSync(path, line, "utf8");
      });
    this.warn = options.warn;
  }

  open(options: ExperimentLogOpenOptions): ExperimentLogWriteResult<ExperimentOpenEvent> {
    const startedAt = this.now();
    const timestamp = startedAt.toISOString();
    const experimentId = this.nextExperimentId(startedAt);
    const eventsPath = join(
      this.root,
      year(startedAt),
      month(startedAt),
      day(startedAt),
      experimentId,
      "events.jsonl",
    );
    const blobsPath = join(dirname(eventsPath), "blobs");

    const identity = { experiment_id: experimentId, events_path: eventsPath, blobs_path: blobsPath, started_at: timestamp };
    const event: ExperimentOpenEvent = {
      schema_version: EXPERIMENT_LOG_SCHEMA_VERSION,
      event_id: this.nextEventId(timestamp),
      experiment_id: identity.experiment_id,
      sequence: 1,
      timestamp_utc: timestamp,
      event_kind: "experiment_open",
      ...withDefined("workspace", workspaceSnapshot(options.workspace)),
      ...withDefined("mutation_policy", mutationPolicySnapshot(options.mutationPolicy)),
      session_start_reason: options.sessionStartReason,
      ...(options.previousSessionFile === undefined ? {} : { previous_session_file: options.previousSessionFile }),
    };

    try {
      mkdirSync(blobsPath, { recursive: true });
    } catch (error) {
      return this.writeFailure(eventsPath, event, error);
    }

    try {
      this.appendLine(eventsPath, `${JSON.stringify(event)}\n`);
    } catch (error) {
      return this.writeFailure(eventsPath, event, error);
    }

    this.identity = identity;
    this.workspace = options.workspace;
    this.mutationPolicy = options.mutationPolicy;
    this.sequence = 1;
    this.eventCount = 1;

    return { ok: true, path: eventsPath, event_id: event.event_id, sequence: event.sequence, event };
  }

  currentIdentity(): ExperimentLogIdentity | undefined {
    return this.identity === undefined ? undefined : { ...this.identity };
  }

  currentWorkspaceHash(): string | undefined {
    return this.workspace?.hash;
  }

  updateContext(options: { workspace?: LoadedWorkspace; mutationPolicy?: MutationPolicy }): void {
    if ("workspace" in options) {
      this.workspace = options.workspace;
    }

    if ("mutationPolicy" in options) {
      this.mutationPolicy = options.mutationPolicy;
    }
  }

  recordToolInvocationStarted(
    input: ToolInvocationStartedInput,
  ): ExperimentLogWriteResult<ToolInvocationStartedEvent> {
    if (this.identity === undefined) {
      return { ok: false, error: "experiment log is not open" };
    }

    return this.appendEvent(
      this.buildEvent("tool_invocation_started", this.now().toISOString(), {
        tool_call_id: input.toolCallId,
        tool_name: input.toolName,
        input: input.actionInput,
      }),
    );
  }

  recordToolResult(input: ToolResultInput): ExperimentLogWriteResult<ToolResultEvent> {
    if (this.identity === undefined) {
      return { ok: false, error: "experiment log is not open" };
    }

    return this.appendEvent(
      this.buildEvent("tool_result", this.now().toISOString(), {
        tool_call_id: input.toolCallId,
        ...withDefined("parent_event_id", input.parentEventId),
        tool_name: input.toolName,
        result: input.result,
        outcome: classifyToolOutcome(input.result),
      }),
    );
  }

  recordToolException(input: ToolExceptionInput): ExperimentLogWriteResult<ToolExceptionEvent> {
    if (this.identity === undefined) {
      return { ok: false, error: "experiment log is not open" };
    }

    const error = serializeError(input.error);
    return this.appendEvent(
      this.buildEvent("tool_exception", this.now().toISOString(), {
        tool_call_id: input.toolCallId,
        ...withDefined("parent_event_id", input.parentEventId),
        tool_name: input.toolName,
        input: input.actionInput,
        outcome: "exception" as const,
        error,
        error_message: error.message,
      }),
    );
  }

  recordPlanStepResult(input: PlanStepResultInput): ExperimentLogWriteResult<PlanStepResultEvent> {
    if (this.identity === undefined) {
      return { ok: false, error: "experiment log is not open" };
    }

    return this.appendEvent(
      this.buildEvent("plan_step_result", this.now().toISOString(), {
        tool_call_id: input.toolCallId,
        ...withDefined("parent_event_id", input.parentEventId),
        step: input.step,
        outcome: classifyPlanStepOutcome(input.step),
      }),
    );
  }

  close(reason: ExperimentCloseReason): ExperimentLogWriteResult<ExperimentCloseEvent> {
    if (this.identity === undefined) {
      return { ok: false, error: "experiment log is not open" };
    }

    const sequence = this.sequence + 1;
    const event = this.buildEvent("experiment_close", this.now().toISOString(), {
      reason,
      event_count: this.eventCount + 1,
      last_sequence: sequence,
    });
    const result = this.appendEvent(event);
    this.identity = undefined;
    return result;
  }

  private buildEvent<TKind extends ExperimentLogEventKind, TFields extends Record<string, unknown>>(
    eventKind: TKind,
    timestampUtc: string,
    fields: TFields,
  ): ExperimentLogEventBase<TKind> & TFields {
    if (this.identity === undefined) {
      throw new Error("experiment log is not open");
    }

    this.sequence += 1;
    return {
      schema_version: EXPERIMENT_LOG_SCHEMA_VERSION,
      event_id: this.nextEventId(timestampUtc),
      experiment_id: this.identity.experiment_id,
      sequence: this.sequence,
      timestamp_utc: timestampUtc,
      event_kind: eventKind,
      ...withDefined("workspace", workspaceSnapshot(this.workspace)),
      ...withDefined("mutation_policy", mutationPolicySnapshot(this.mutationPolicy)),
      ...fields,
    };
  }

  private appendEvent<TEvent extends ExperimentLogEvent>(event: TEvent): ExperimentLogWriteResult<TEvent> {
    const path = this.identity?.events_path;
    if (path === undefined) {
      return { ok: false, error: "experiment log is not open", event };
    }

    try {
      this.appendLine(path, `${JSON.stringify(event)}\n`);
      this.eventCount += 1;
      return { ok: true, path, event_id: event.event_id, sequence: event.sequence, event };
    } catch (error) {
      return this.writeFailure(path, event, error);
    }
  }

  private writeFailure<TEvent extends ExperimentLogEvent>(
    path: string,
    event: TEvent,
    error: unknown,
  ): ExperimentLogWriteResult<TEvent> {
    const message = errorMessage(error);
    this.emitWarning(`experiment log write failed: ${message}`);
    return { ok: false, path, error: message, event };
  }

  private emitWarning(message: string): void {
    if (this.warn === undefined) {
      console.warn(message);
      return;
    }

    try {
      this.warn(message);
    } catch {
      // Logging is fail-soft by design; warning callbacks must not affect tool behavior.
    }
  }

  private nextExperimentId(startedAt: Date): string {
    const candidate = this.idFactory?.();
    if (candidate?.startsWith("exp_")) {
      return candidate;
    }

    const suffix = candidate === undefined ? randomToken() : windowsSafe(candidate);
    return `exp_${compactUtcTimestamp(startedAt)}_${suffix}`;
  }

  private nextEventId(timestampUtc: string): string {
    const candidate = this.idFactory?.();
    return candidate === undefined ? `evt_${compactUtcTimestamp(new Date(timestampUtc))}_${randomToken()}` : candidate;
  }
}

function serializeError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: error.message,
      ...withDefined("stack", error.stack),
    };
  }

  return { name: "Error", message: errorMessage(error) };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function compactUtcTimestamp(date: Date): string {
  return `${year(date)}${month(date)}${day(date)}-${hour(date)}${minute(date)}${second(date)}Z`;
}

function year(date: Date): string {
  return String(date.getUTCFullYear()).padStart(4, "0");
}

function month(date: Date): string {
  return String(date.getUTCMonth() + 1).padStart(2, "0");
}

function day(date: Date): string {
  return String(date.getUTCDate()).padStart(2, "0");
}

function hour(date: Date): string {
  return String(date.getUTCHours()).padStart(2, "0");
}

function minute(date: Date): string {
  return String(date.getUTCMinutes()).padStart(2, "0");
}

function second(date: Date): string {
  return String(date.getUTCSeconds()).padStart(2, "0");
}

function randomToken(): string {
  return randomUUID().replaceAll("-", "").slice(0, 12);
}

function windowsSafe(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, "_");
}

function withDefined<TKey extends string, TValue>(key: TKey, value: TValue | undefined): Record<TKey, TValue> | {} {
  return value === undefined ? {} : { [key]: value } as Record<TKey, TValue>;
}
