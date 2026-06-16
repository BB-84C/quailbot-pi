# A7 Experiment Log Subsystem Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a durable, append-only Quailbot experiment log for local Pi runs, preserving instrument action evidence separately from Pi chat history and construction artifacts.

**Architecture:** Add a Pi-independent `src/experiment-log/` subsystem that writes and reads JSONL event streams under `.quailbot-pi/experiments/YYYY/MM/DD/<experiment_id>/events.jsonl`. Wire it at the registered Quailbot tool boundary so top-level tool calls are logged once, add a narrow plan-step recorder for partial progress inside `quailbot_plan_and_execute`, and expose a read-only `/quailbot-experiments` command.

**Tech Stack:** TypeScript, Node `fs`/`path`/`crypto`, Pi extension command API, Vitest, existing Quailbot `QuailbotToolResult`, workspace service, and mutation policy modules.

---

## File structure

- Create `src/experiment-log/experiment-log-types.ts`
  - Owns event, outcome, workspace snapshot, mutation-policy snapshot, service-result, and reader types.
- Create `src/experiment-log/classify-outcome.ts`
  - Pure classifier from existing `QuailbotToolResult` and plan-step evidence to A7 outcome classes.
- Create `src/experiment-log/experiment-log-service.ts`
  - Append-only writer with deterministic injection points for tests, fail-soft warning handling, experiment lifecycle, tool events, plan step events, and close records.
- Create `src/experiment-log/experiment-log-reader.ts`
  - Read-only parser/list/show helpers for JSONL experiments, including `interrupted_unknown` for missing close records and incomplete tail-line handling.
- Create `src/experiment-log/register-experiment-commands.ts`
  - Thin `/quailbot-experiments list|show|where` command adapter over the reader.
- Modify `src/extension.ts`
  - Add experiment log runtime field, lifecycle open/close handling, reload/resume semantics, and command registration.
- Modify `src/tools/quailbot_plan_and_execute.ts`
  - Add an optional `onStepResult` recorder callback called only after real step execution.
- Modify `src/tools/register-tools.ts`
  - Add a logged execution wrapper around selected top-level tools; keep logging failures warning-only.
- Create tests under `tests/experiment-log/`.
- Extend existing tool/plan/e2e tests for wiring and command registration.
- Update `ROADMAP.md` after implementation with delivered behavior, new facts, and later-phase impact.

Implementation note: ordinary feature work in this repo uses the main checkout on a normal feature branch, not project-local `.worktrees`.

---

## Pre-flight

- [ ] **Step 1: Create a normal feature branch before implementation**

Run:

```bash
git status --short
git switch -c feature/a7-experiment-log
```

Expected: branch switches successfully. Preserve the existing uncommitted planning/spec files; do not create a project-local `.worktrees` checkout.

---

### Task 1: Define event types and outcome classifier

**Files:**
- Create: `src/experiment-log/experiment-log-types.ts`
- Create: `src/experiment-log/classify-outcome.ts`
- Create: `tests/experiment-log/classify-outcome.test.ts`

- [ ] **Step 1: Write the failing classifier tests**

Create `tests/experiment-log/classify-outcome.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { classifyPlanStepOutcome, classifyToolOutcome } from "../../src/experiment-log/classify-outcome.js";
import type { QuailbotToolResult } from "../../src/tools/tool-result.js";

describe("experiment log outcome classification", () => {
  it("classifies successful read-only CLI results as measured", () => {
    expect(
      classifyToolOutcome({
        ok: true,
        action: "cli_get",
        action_input: { parameter: "bias_v" },
        primary_result: { ok: true, payload: { value: 0.1 }, argv: ["nqctl", "get", "bias_v"] },
      }),
    ).toBe("measured");
  });

  it("classifies successful mutating CLI results as applied", () => {
    expect(
      classifyToolOutcome({
        ok: true,
        action: "cli_set",
        action_input: { parameter: "bias_v", value: 0.2 },
        primary_result: { ok: true, payload: { applied: true }, argv: ["nqctl", "set", "bias_v"] },
      }),
    ).toBe("applied");
  });

  it("classifies successful plans by whether completed steps mutated instrument state", () => {
    expect(
      classifyToolOutcome({
        ok: true,
        action: "quailbot_plan_and_execute",
        action_input: { steps: [{ kind: "sleep_seconds", seconds: 0 }] },
        primary_result: { ok: true, stopped_reason: "completed", steps: [{ index: 0, kind: "sleep_seconds" }] },
      }),
    ).toBe("measured");

    expect(
      classifyToolOutcome({
        ok: true,
        action: "quailbot_plan_and_execute",
        action_input: { steps: [{ kind: "cli_set", parameter: "bias_v", value: 0.2 }] },
        primary_result: { ok: true, stopped_reason: "completed", steps: [{ index: 0, kind: "cli_set" }] },
      }),
    ).toBe("applied");
  });

  it("classifies mutation-policy blocks as mutation_denied", () => {
    expect(
      classifyToolOutcome({
        ok: false,
        action: "cli_set",
        action_input: { parameter: "bias_v", value: 0.2 },
        primary_result: { ok: false, error_type: "mutation_policy_disabled" },
      }),
    ).toBe("mutation_denied");
  });

  it("classifies plan validation and step failure outcomes distinctly", () => {
    expect(
      classifyToolOutcome({
        ok: false,
        action: "quailbot_plan_and_execute",
        action_input: { steps: [] },
        primary_result: { ok: false, stopped_reason: "validation_failed", validation_error: "bad plan", steps: [] },
      }),
    ).toBe("validation_failed");

    expect(
      classifyToolOutcome({
        ok: false,
        action: "quailbot_plan_and_execute",
        action_input: { steps: [] },
        primary_result: { ok: false, stopped_reason: "step_failed", steps: [{ index: 0 }] },
      }),
    ).toBe("step_failed");
  });

  it("classifies driver, GUI, exception, and readback failures", () => {
    expect(
      classifyToolOutcome({
        ok: false,
        action: "cli_get",
        action_input: { parameter: "bias_v" },
        primary_result: { ok: false, exit_code: 1, error_type: "timeout" },
      }),
    ).toBe("driver_failure");

    expect(
      classifyToolOutcome({
        ok: false,
        action: "observe",
        action_input: { rois: ["scan"] },
        primary_result: { error_type: "roi_backend_unavailable" },
      }),
    ).toBe("gui_backend_unavailable");

    expect(
      classifyToolOutcome({
        ok: true,
        action: "cli_set",
        action_input: { parameter: "bias_v", value: 0.2 },
        primary_result: { ok: true },
        linked_observation: {
          channels: { cli: { results: { "nqctl:bias_v": { ok: false } } } },
          unresolved: [],
        },
      } as QuailbotToolResult),
    ).toBe("readback_failure");

    expect(classifyToolOutcome(exceptionResult("cli_set", "bad value"))).toBe("exception");
  });

  it("classifies plan step outcomes from nested step evidence", () => {
    expect(classifyPlanStepOutcome({ index: 0, kind: "sleep_seconds", args: { seconds: 0 }, primary_result: { slept_seconds: 0 } })).toBe("measured");
    expect(classifyPlanStepOutcome({ index: 1, kind: "cli_set", args: { value: 1 }, primary_result: { ok: true } })).toBe("applied");
    expect(classifyPlanStepOutcome({ index: 2, kind: "cli_get", args: {}, primary_result: { ok: false, exit_code: 1 } })).toBe("driver_failure");
    expect(
      classifyPlanStepOutcome({
        index: 3,
        kind: "cli_set",
        args: { value: 1 },
        primary_result: { ok: true },
        linked_observation: { channels: { roi: { unavailable: ["scan_roi"] } }, unresolved: [] },
      }),
    ).toBe("readback_failure");
  });
});

function exceptionResult(action: string, message: string): QuailbotToolResult {
  return {
    ok: false,
    action,
    action_input: {},
    primary_result: { ok: false, error_type: "tool_exception", message },
  };
}
```

- [ ] **Step 2: Run the classifier test and verify it fails**

Run:

```bash
npm test -- tests/experiment-log/classify-outcome.test.ts
```

Expected: FAIL because `src/experiment-log/classify-outcome.ts` does not exist.

- [ ] **Step 3: Create the event types**

Create `src/experiment-log/experiment-log-types.ts`:

```ts
import type { MutationPolicy } from "../tools/mutation-policy.js";
import type { QuailbotToolResult } from "../tools/tool-result.js";
import type { LoadedWorkspace } from "../workspace/workspace-service.js";
import type { WorkspaceSelection } from "../workspace/workspace-state.js";

export const EXPERIMENT_LOG_SCHEMA_VERSION = 1;

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

export type ExperimentEventKind =
  | "experiment_open"
  | "tool_invocation_started"
  | "tool_result"
  | "tool_exception"
  | "plan_step_result"
  | "experiment_close";

export type ExperimentWorkspaceSnapshot = {
  path: string;
  hash: string;
  source: WorkspaceSelection["source"] | "written" | "candidate";
};

export type ExperimentMutationPolicySnapshot = {
  mutating_tools_enabled: boolean;
  enable_env_var: MutationPolicy["enableEnvVar"];
};

export type ExperimentEventBase = {
  schema_version: typeof EXPERIMENT_LOG_SCHEMA_VERSION;
  event_id: string;
  experiment_id: string;
  sequence: number;
  timestamp_utc: string;
  event_kind: ExperimentEventKind;
  workspace?: ExperimentWorkspaceSnapshot;
  mutation_policy?: ExperimentMutationPolicySnapshot;
};

export type ExperimentOpenEvent = ExperimentEventBase & {
  event_kind: "experiment_open";
  session_start_reason: "startup" | "reload" | "new" | "resume" | "fork";
  previous_session_file?: string;
};

export type ToolInvocationStartedEvent = ExperimentEventBase & {
  event_kind: "tool_invocation_started";
  tool_call_id: string;
  tool_name: string;
  action_input: unknown;
};

export type ToolResultEvent = ExperimentEventBase & {
  event_kind: "tool_result";
  tool_call_id: string;
  parent_event_id?: string;
  tool_name: string;
  outcome: ExperimentOutcome;
  duration_ms?: number;
  result: QuailbotToolResult;
};

export type ToolExceptionEvent = ExperimentEventBase & {
  event_kind: "tool_exception";
  tool_call_id: string;
  parent_event_id?: string;
  tool_name: string;
  action_input: unknown;
  outcome: "exception";
  duration_ms?: number;
  error: { name?: string; message: string; stack?: string };
};

export type PlanStepResultPayload = {
  index: number;
  kind: string;
  args: Record<string, unknown>;
  primary_result: unknown;
  linked_observation?: unknown;
};

export type PlanStepResultEvent = ExperimentEventBase & {
  event_kind: "plan_step_result";
  parent_event_id?: string;
  tool_call_id: string;
  outcome: ExperimentOutcome;
  step: PlanStepResultPayload;
};

export type ExperimentCloseReason = "session_shutdown" | "session_restarted" | "workspace_changed";

export type ExperimentCloseEvent = ExperimentEventBase & {
  event_kind: "experiment_close";
  reason: ExperimentCloseReason;
  event_count: number;
  last_sequence: number;
};

export type ExperimentLogEvent =
  | ExperimentOpenEvent
  | ToolInvocationStartedEvent
  | ToolResultEvent
  | ToolExceptionEvent
  | PlanStepResultEvent
  | ExperimentCloseEvent;

export type ExperimentLogWriteResult =
  | { ok: true; event: ExperimentLogEvent }
  | { ok: false; error: Error; event: ExperimentLogEvent };

export type ExperimentIdentity = {
  experimentId: string;
  experimentDir: string;
  eventsPath: string;
};

export type LoadedExperimentStatus = "open" | "closed" | "interrupted_unknown";

export type ExperimentSummary = {
  experiment_id: string;
  events_path: string;
  started_at?: string;
  closed_at?: string;
  status: LoadedExperimentStatus;
  workspace?: ExperimentWorkspaceSnapshot;
  event_count: number;
  outcome_counts: Partial<Record<ExperimentOutcome, number>>;
};

export function workspaceSnapshot(value: LoadedWorkspace | undefined): ExperimentWorkspaceSnapshot | undefined {
  if (value === undefined) {
    return undefined;
  }
  return {
    path: value.selection.path,
    hash: value.hash,
    source: value.selection.source,
  };
}

export function mutationPolicySnapshot(value: MutationPolicy | undefined): ExperimentMutationPolicySnapshot | undefined {
  if (value === undefined) {
    return undefined;
  }
  return {
    mutating_tools_enabled: value.mutatingToolsEnabled,
    enable_env_var: value.enableEnvVar,
  };
}
```

- [ ] **Step 4: Create the outcome classifier**

Create `src/experiment-log/classify-outcome.ts`:

```ts
import { MUTATION_POLICY_DISABLED_ERROR_TYPE } from "../tools/mutation-policy.js";
import type { QuailbotToolResult } from "../tools/tool-result.js";
import type { ExperimentOutcome, PlanStepResultPayload } from "./experiment-log-types.js";

const READ_ONLY_ACTIONS = new Set(["cli_get", "observe"]);
const READ_ONLY_PLAN_STEPS = new Set(["cli_get", "observe", "sleep_seconds"]);
const GUI_UNAVAILABLE_ERRORS = new Set(["gui_backend_unavailable", "roi_backend_unavailable"]);

export function classifyToolOutcome(result: QuailbotToolResult): ExperimentOutcome {
  const primary = record(result.primary_result);
  if (primary.error_type === "tool_exception") return "exception";
  if (primary.error_type === MUTATION_POLICY_DISABLED_ERROR_TYPE) return "mutation_denied";
  if (primary.stopped_reason === "validation_failed") return "validation_failed";
  if (primary.stopped_reason === "step_failed") return "step_failed";
  if (hasGuiUnavailable(primary, result.linked_observation)) return "gui_backend_unavailable";
  if (hasReadbackFailure(result.linked_observation)) return "readback_failure";
  if (!result.ok || primary.ok === false || nonZeroExit(primary.exit_code)) return "driver_failure";
  if (result.action === "quailbot_plan_and_execute") return planHasMutatingStep(primary) ? "applied" : "measured";
  return READ_ONLY_ACTIONS.has(result.action) ? "measured" : "applied";
}

export function classifyPlanStepOutcome(step: PlanStepResultPayload): ExperimentOutcome {
  const primary = record(step.primary_result);
  if (primary.error_type === MUTATION_POLICY_DISABLED_ERROR_TYPE) return "mutation_denied";
  if (hasGuiUnavailable(primary, step.linked_observation)) return "gui_backend_unavailable";
  if (hasReadbackFailure(step.linked_observation)) return "readback_failure";
  if (primary.ok === false || nonZeroExit(primary.exit_code)) return "driver_failure";
  return READ_ONLY_PLAN_STEPS.has(step.kind) ? "measured" : "applied";
}

function hasGuiUnavailable(primary: Record<string, unknown>, linkedObservation: unknown): boolean {
  if (typeof primary.error_type === "string" && GUI_UNAVAILABLE_ERRORS.has(primary.error_type)) {
    return true;
  }
  const channels = record(record(linkedObservation).channels);
  const roi = record(channels.roi);
  if (Array.isArray(roi.unavailable) && roi.unavailable.length > 0) {
    return true;
  }
  const results = record(roi.results);
  return Object.values(results).some((value) => {
    const result = record(value);
    return typeof result.error_type === "string" && GUI_UNAVAILABLE_ERRORS.has(result.error_type);
  });
}

function hasReadbackFailure(linkedObservation: unknown): boolean {
  const observation = record(linkedObservation);
  if (Array.isArray(observation.unresolved) && observation.unresolved.length > 0) {
    return true;
  }
  const channels = record(observation.channels);
  const cliResults = record(record(channels.cli).results);
  const roiResults = record(record(channels.roi).results);
  return [...Object.values(cliResults), ...Object.values(roiResults)].some((value) => record(value).ok === false);
}

function nonZeroExit(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value !== 0;
}

function planHasMutatingStep(primary: Record<string, unknown>): boolean {
  const steps = Array.isArray(primary.steps) ? primary.steps : [];
  return steps.some((step) => {
    const kind = record(step).kind;
    return typeof kind === "string" && !READ_ONLY_PLAN_STEPS.has(kind);
  });
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
```

- [ ] **Step 5: Run the classifier tests and typecheck**

Run:

```bash
npm test -- tests/experiment-log/classify-outcome.test.ts && npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/experiment-log/experiment-log-types.ts src/experiment-log/classify-outcome.ts tests/experiment-log/classify-outcome.test.ts
git commit -m "feat: add experiment log outcome model"
```

---

### Task 2: Implement append-only writer and reader

**Files:**
- Create: `src/experiment-log/experiment-log-service.ts`
- Create: `src/experiment-log/experiment-log-reader.ts`
- Create: `tests/experiment-log/experiment-log-service.test.ts`
- Create: `tests/experiment-log/experiment-log-reader.test.ts`

- [ ] **Step 1: Write failing writer tests**

Create `tests/experiment-log/experiment-log-service.test.ts`:

```ts
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ExperimentLogService, experimentLogRoot } from "../../src/experiment-log/experiment-log-service.js";
import type { QuailbotToolResult } from "../../src/tools/tool-result.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("ExperimentLogService", () => {
  it("opens an experiment, appends tool events, and closes with monotonic sequences", () => {
    const root = makeTempDir();
    const warnings: string[] = [];
    const service = new ExperimentLogService({
      root,
      now: fixedClock([
        "2026-06-16T10:00:00.000Z",
        "2026-06-16T10:00:00.000Z",
        "2026-06-16T10:00:01.000Z",
        "2026-06-16T10:00:02.000Z",
        "2026-06-16T10:00:03.000Z",
      ]),
      idFactory: fixedIds(["exp_20260616-100000Z_abcd", "evt_open", "evt_start", "evt_result", "evt_close"]),
      warn: (message) => warnings.push(message),
    });

    service.open({
      sessionStartReason: "startup",
      workspace: { path: "D:/workspace.json", hash: "abc123", source: "settings" },
      mutationPolicy: { mutating_tools_enabled: true, enable_env_var: "QUAILBOT_ALLOW_MUTATING_TOOLS" },
    });
    const identity = service.currentIdentity();
    const started = service.recordToolInvocationStarted({ toolCallId: "call-1", toolName: "cli_get", actionInput: { parameter: "bias_v" } });
    const result = service.recordToolResult({
      parentEventId: started.event.event_id,
      toolCallId: "call-1",
      toolName: "cli_get",
      result: measuredResult(),
      durationMs: 7,
    });
    service.close("session_shutdown");

    expect(result.ok).toBe(true);
    expect(warnings).toEqual([]);
    const lines = readLines(identity?.eventsPath ?? "");
    expect(lines.map((event) => event.sequence)).toEqual([1, 2, 3, 4]);
    expect(lines.map((event) => event.event_kind)).toEqual(["experiment_open", "tool_invocation_started", "tool_result", "experiment_close"]);
    expect(lines[2]).toMatchObject({
      outcome: "measured",
      result: { action: "cli_get", primary_result: { argv: ["nqctl", "get", "bias_v"] } },
      workspace: { hash: "abc123" },
    });
    expect(service.currentIdentity()).toBeUndefined();
  });

  it("records plan steps and warns without throwing when appends fail", () => {
    const warnings: string[] = [];
    const service = new ExperimentLogService({
      root: makeTempDir(),
      now: fixedClock(["2026-06-16T10:00:00.000Z", "2026-06-16T10:00:00.000Z", "2026-06-16T10:00:01.000Z"]),
      idFactory: fixedIds(["exp_20260616-100000Z_abcd", "evt_open", "evt_step"]),
      warn: (message) => warnings.push(message),
      appendLine: () => {
        throw new Error("disk full");
      },
    });

    service.open({ sessionStartReason: "startup", mutationPolicy: { mutating_tools_enabled: true, enable_env_var: "QUAILBOT_ALLOW_MUTATING_TOOLS" } });
    const result = service.recordPlanStepResult({
      parentEventId: "evt_plan",
      toolCallId: "call-plan",
      step: { index: 0, kind: "cli_set", args: { value: 1 }, primary_result: { ok: true } },
    });

    expect(result.ok).toBe(false);
    expect(warnings.join("\n")).toContain("experiment log write failed");
  });

  it("uses the project-local Quailbot state root for product logs", () => {
    expect(experimentLogRoot("D:/repo").replace(/\\/g, "/")).toBe("D:/repo/.quailbot-pi/experiments");
  });
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "quailbot-exp-log-"));
  tempDirs.push(dir);
  return dir;
}

function measuredResult(): QuailbotToolResult {
  return { ok: true, action: "cli_get", action_input: { parameter: "bias_v" }, primary_result: { ok: true, argv: ["nqctl", "get", "bias_v"], payload: { value: 0.1 } } };
}

function readLines(path: string): Array<Record<string, any>> {
  return readFileSync(path, "utf8").trim().split("\n").map((line) => JSON.parse(line));
}

function fixedClock(values: string[]): () => Date {
  let index = 0;
  return () => new Date(values[Math.min(index++, values.length - 1)]);
}

function fixedIds(values: string[]): () => string {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}
```

- [ ] **Step 2: Write failing reader tests**

Create `tests/experiment-log/experiment-log-reader.test.ts`:

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { findExperimentEventsPath, listExperiments, readExperiment } from "../../src/experiment-log/experiment-log-reader.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("experiment log reader", () => {
  it("reads closed experiments and summarizes outcomes", () => {
    const root = makeTempDir();
    const dir = writeExperiment(root, "exp_20260616-100000Z_abcd", [
      event({ sequence: 1, event_kind: "experiment_open", timestamp_utc: "2026-06-16T10:00:00.000Z", workspace: { path: "w.json", hash: "abc", source: "settings" } }),
      event({ sequence: 2, event_kind: "tool_result", timestamp_utc: "2026-06-16T10:00:01.000Z", outcome: "measured" }),
      event({ sequence: 3, event_kind: "experiment_close", timestamp_utc: "2026-06-16T10:00:02.000Z", reason: "session_shutdown" }),
    ]);

    const experiment = readExperiment(join(dir, "events.jsonl"));
    expect(experiment.status).toBe("closed");
    expect(experiment.summary.outcome_counts.measured).toBe(1);
    expect(experiment.summary.workspace?.hash).toBe("abc");
    expect(listExperiments(root).map((item) => item.experiment_id)).toEqual(["exp_20260616-100000Z_abcd"]);
    expect(findExperimentEventsPath(root, "exp_20260616-100000Z_abcd")).toBe(join(dir, "events.jsonl"));
  });

  it("reports missing close as interrupted_unknown and ignores an incomplete tail line", () => {
    const root = makeTempDir();
    const dir = join(root, "2026", "06", "16", "exp_20260616-100000Z_abcd");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "events.jsonl"),
      event({ sequence: 1, event_kind: "experiment_open", timestamp_utc: "2026-06-16T10:00:00.000Z" }) + "\n" +
        event({ sequence: 2, event_kind: "tool_result", timestamp_utc: "2026-06-16T10:00:01.000Z", outcome: "applied" }) + "\n" +
        "{not complete",
      "utf8",
    );

    const experiment = readExperiment(join(dir, "events.jsonl"));
    expect(experiment.status).toBe("interrupted_unknown");
    expect(experiment.events).toHaveLength(2);
    expect(experiment.ignoredTail).toBe("{not complete");
    expect(experiment.summary.outcome_counts.applied).toBe(1);
  });
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "quailbot-exp-read-"));
  tempDirs.push(dir);
  return dir;
}

function writeExperiment(root: string, id: string, lines: string[]): string {
  const dir = join(root, "2026", "06", "16", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "events.jsonl"), `${lines.join("\n")}\n`, "utf8");
  return dir;
}

function event(fields: Record<string, unknown>): string {
  return JSON.stringify({ schema_version: 1, event_id: `evt_${fields.sequence}`, experiment_id: "exp_20260616-100000Z_abcd", ...fields });
}
```

- [ ] **Step 3: Run writer/reader tests and verify they fail**

Run:

```bash
npm test -- tests/experiment-log/experiment-log-service.test.ts tests/experiment-log/experiment-log-reader.test.ts
```

Expected: FAIL because writer and reader modules do not exist.

- [ ] **Step 4: Implement the append-only service**

Create `src/experiment-log/experiment-log-service.ts`:

```ts
import { randomBytes } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { quailbotStateRoot } from "../workspace/workspace-state.js";
import { classifyPlanStepOutcome, classifyToolOutcome } from "./classify-outcome.js";
import {
  EXPERIMENT_LOG_SCHEMA_VERSION,
  type ExperimentCloseReason,
  type ExperimentEventBase,
  type ExperimentIdentity,
  type ExperimentLogEvent,
  type ExperimentLogWriteResult,
  type ExperimentMutationPolicySnapshot,
  type ExperimentWorkspaceSnapshot,
  type PlanStepResultPayload,
  type ToolExceptionEvent,
} from "./experiment-log-types.js";
import type { QuailbotToolResult } from "../tools/tool-result.js";

export type ExperimentLogServiceOptions = {
  root: string;
  now?: () => Date;
  idFactory?: () => string;
  appendLine?: (path: string, line: string) => void;
  warn?: (message: string) => void;
};

export type OpenExperimentInput = {
  sessionStartReason: "startup" | "reload" | "new" | "resume" | "fork";
  previousSessionFile?: string;
  workspace?: ExperimentWorkspaceSnapshot;
  mutationPolicy?: ExperimentMutationPolicySnapshot;
};

export type ToolInvocationInput = { toolCallId: string; toolName: string; actionInput: unknown };
export type ToolResultInput = { toolCallId: string; toolName: string; parentEventId?: string; result: QuailbotToolResult; durationMs?: number };
export type ToolExceptionInput = { toolCallId: string; toolName: string; parentEventId?: string; actionInput: unknown; error: unknown; durationMs?: number };
export type PlanStepResultInput = { toolCallId: string; parentEventId?: string; step: PlanStepResultPayload };

export function experimentLogRoot(cwd = process.cwd()): string {
  return join(quailbotStateRoot(cwd), "experiments");
}

export class ExperimentLogService {
  private readonly root: string;
  private readonly now: () => Date;
  private readonly idFactory: () => string;
  private readonly appendLine: (path: string, line: string) => void;
  private readonly warn: (message: string) => void;
  private identity: ExperimentIdentity | undefined;
  private sequence = 0;
  private eventCount = 0;
  private workspace: ExperimentWorkspaceSnapshot | undefined;
  private mutationPolicy: ExperimentMutationPolicySnapshot | undefined;

  constructor(options: ExperimentLogServiceOptions) {
    this.root = options.root;
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? (() => randomId("evt"));
    this.appendLine = options.appendLine ?? ((path, line) => appendFileSync(path, line, "utf8"));
    this.warn = options.warn ?? ((message) => console.warn(message));
  }

  currentIdentity(): ExperimentIdentity | undefined {
    return this.identity;
  }

  currentWorkspaceHash(): string | undefined {
    return this.workspace?.hash;
  }

  open(input: OpenExperimentInput): ExperimentLogWriteResult {
    this.workspace = input.workspace;
    this.mutationPolicy = input.mutationPolicy;
    this.sequence = 0;
    this.eventCount = 0;
    const timestamp = this.now();
    const candidateId = this.idFactory();
    const experimentId = candidateId.startsWith("exp_") ? candidateId : randomExperimentId(timestamp);
    const experimentDir = join(this.root, dateSegment(timestamp), experimentId);
    this.identity = { experimentId, experimentDir, eventsPath: join(experimentDir, "events.jsonl") };
    mkdirSync(join(experimentDir, "blobs"), { recursive: true });
    return this.write({
      ...this.base("experiment_open"),
      event_kind: "experiment_open",
      session_start_reason: input.sessionStartReason,
      ...(input.previousSessionFile === undefined ? {} : { previous_session_file: input.previousSessionFile }),
    });
  }

  updateContext(input: { workspace?: ExperimentWorkspaceSnapshot; mutationPolicy?: ExperimentMutationPolicySnapshot }): void {
    this.workspace = input.workspace;
    this.mutationPolicy = input.mutationPolicy;
  }

  recordToolInvocationStarted(input: ToolInvocationInput): ExperimentLogWriteResult {
    return this.write({ ...this.base("tool_invocation_started"), event_kind: "tool_invocation_started", tool_call_id: input.toolCallId, tool_name: input.toolName, action_input: input.actionInput });
  }

  recordToolResult(input: ToolResultInput): ExperimentLogWriteResult {
    return this.write({
      ...this.base("tool_result"),
      event_kind: "tool_result",
      tool_call_id: input.toolCallId,
      ...(input.parentEventId === undefined ? {} : { parent_event_id: input.parentEventId }),
      tool_name: input.toolName,
      outcome: classifyToolOutcome(input.result),
      ...(input.durationMs === undefined ? {} : { duration_ms: input.durationMs }),
      result: input.result,
    });
  }

  recordToolException(input: ToolExceptionInput): ExperimentLogWriteResult {
    return this.write({
      ...this.base("tool_exception"),
      event_kind: "tool_exception",
      tool_call_id: input.toolCallId,
      ...(input.parentEventId === undefined ? {} : { parent_event_id: input.parentEventId }),
      tool_name: input.toolName,
      action_input: input.actionInput,
      outcome: "exception",
      ...(input.durationMs === undefined ? {} : { duration_ms: input.durationMs }),
      error: serializeError(input.error),
    } satisfies ToolExceptionEvent);
  }

  recordPlanStepResult(input: PlanStepResultInput): ExperimentLogWriteResult {
    return this.write({
      ...this.base("plan_step_result"),
      event_kind: "plan_step_result",
      ...(input.parentEventId === undefined ? {} : { parent_event_id: input.parentEventId }),
      tool_call_id: input.toolCallId,
      outcome: classifyPlanStepOutcome(input.step),
      step: input.step,
    });
  }

  close(reason: ExperimentCloseReason): ExperimentLogWriteResult | undefined {
    if (this.identity === undefined) return undefined;
    const result = this.write({ ...this.base("experiment_close"), event_kind: "experiment_close", reason, event_count: this.eventCount + 1, last_sequence: this.sequence + 1 });
    this.identity = undefined;
    return result;
  }

  private base(eventKind: ExperimentLogEvent["event_kind"]): ExperimentEventBase {
    const identity = this.ensureIdentity();
    return {
      schema_version: EXPERIMENT_LOG_SCHEMA_VERSION,
      event_id: this.idFactory(),
      experiment_id: identity.experimentId,
      sequence: this.sequence + 1,
      timestamp_utc: this.now().toISOString(),
      event_kind: eventKind,
      ...(this.workspace === undefined ? {} : { workspace: this.workspace }),
      ...(this.mutationPolicy === undefined ? {} : { mutation_policy: this.mutationPolicy }),
    };
  }

  private write(event: ExperimentLogEvent): ExperimentLogWriteResult {
    const identity = this.ensureIdentity();
    try {
      this.appendLine(identity.eventsPath, `${JSON.stringify(event)}\n`);
      this.sequence = event.sequence;
      this.eventCount += 1;
      return { ok: true, event };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.warn(`experiment log write failed: ${err.message}`);
      return { ok: false, error: err, event };
    }
  }

  private ensureIdentity(): ExperimentIdentity {
    if (this.identity === undefined) throw new Error("experiment log is not open");
    return this.identity;
  }
}

function dateSegment(now: Date): string {
  return join(String(now.getUTCFullYear()), String(now.getUTCMonth() + 1).padStart(2, "0"), String(now.getUTCDate()).padStart(2, "0"));
}

function randomExperimentId(now: Date): string {
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}-${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}${String(now.getUTCSeconds()).padStart(2, "0")}Z`;
  return `exp_${stamp}_${randomBytes(3).toString("hex")}`;
}

function randomId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

function serializeError(error: unknown): { name?: string; message: string; stack?: string } {
  if (error instanceof Error) return { name: error.name, message: error.message, ...(error.stack === undefined ? {} : { stack: error.stack }) };
  return { message: String(error) };
}
```

- [ ] **Step 5: Implement the reader**

Create `src/experiment-log/experiment-log-reader.ts`:

```ts
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import type { ExperimentLogEvent, ExperimentOutcome, ExperimentSummary, LoadedExperimentStatus } from "./experiment-log-types.js";

export type LoadedExperiment = { eventsPath: string; events: ExperimentLogEvent[]; status: LoadedExperimentStatus; summary: ExperimentSummary; ignoredTail?: string };

export function listExperiments(root: string): ExperimentSummary[] {
  if (!existsSync(root)) return [];
  return findEventFiles(root).map((path) => readExperiment(path).summary).sort((a, b) => (b.started_at ?? "").localeCompare(a.started_at ?? ""));
}

export function findExperimentEventsPath(root: string, experimentId: string): string | undefined {
  return findEventFiles(root).find((path) => path.split(/[\\/]/).at(-2) === experimentId);
}

export function readExperiment(eventsPath: string): LoadedExperiment {
  const { events, ignoredTail } = readEvents(eventsPath);
  const close = events.findLast((event) => event.event_kind === "experiment_close");
  const status: LoadedExperimentStatus = close ? "closed" : events.length > 0 ? "interrupted_unknown" : "open";
  return { eventsPath, events, status, summary: summarize(eventsPath, events, status), ...(ignoredTail === undefined ? {} : { ignoredTail }) };
}

function findEventFiles(root: string): string[] {
  const output: string[] = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    const stat = statSync(path);
    if (stat.isDirectory()) output.push(...findEventFiles(path));
    if (stat.isFile() && name === "events.jsonl") output.push(path);
  }
  return output;
}

function readEvents(eventsPath: string): { events: ExperimentLogEvent[]; ignoredTail?: string } {
  const text = readFileSync(eventsPath, "utf8");
  const complete = text.endsWith("\n");
  const lines = text.split("\n");
  const parseableLines = complete ? lines.filter(Boolean) : lines.slice(0, -1).filter(Boolean);
  const events = parseableLines.map((line) => JSON.parse(line) as ExperimentLogEvent);
  const ignoredTail = complete ? undefined : lines.at(-1);
  return { events, ...(ignoredTail ? { ignoredTail } : {}) };
}

function summarize(eventsPath: string, events: ExperimentLogEvent[], status: LoadedExperimentStatus): ExperimentSummary {
  const open = events.find((event) => event.event_kind === "experiment_open");
  const close = events.findLast((event) => event.event_kind === "experiment_close");
  const outcomeCounts: Partial<Record<ExperimentOutcome, number>> = {};
  for (const event of events) {
    const outcome = "outcome" in event ? event.outcome : undefined;
    if (typeof outcome === "string") outcomeCounts[outcome as ExperimentOutcome] = (outcomeCounts[outcome as ExperimentOutcome] ?? 0) + 1;
  }
  if (status === "interrupted_unknown") outcomeCounts.interrupted_unknown = (outcomeCounts.interrupted_unknown ?? 0) + 1;
  return {
    experiment_id: events[0]?.experiment_id ?? experimentIdFromPath(eventsPath),
    events_path: eventsPath,
    started_at: open?.timestamp_utc,
    closed_at: close?.timestamp_utc,
    status,
    workspace: open?.workspace ?? events.find((event) => event.workspace !== undefined)?.workspace,
    event_count: events.length,
    outcome_counts: outcomeCounts,
  };
}

function experimentIdFromPath(eventsPath: string): string {
  return eventsPath.split(/[\\/]/).at(-2) ?? eventsPath;
}
```

- [ ] **Step 6: Run writer/reader tests and typecheck**

Run:

```bash
npm test -- tests/experiment-log/experiment-log-service.test.ts tests/experiment-log/experiment-log-reader.test.ts && npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/experiment-log/experiment-log-service.ts src/experiment-log/experiment-log-reader.ts tests/experiment-log/experiment-log-service.test.ts tests/experiment-log/experiment-log-reader.test.ts
git commit -m "feat: add append-only experiment log storage"
```

---

### Task 3: Add `/quailbot-experiments` read-only command

**Files:**
- Create: `src/experiment-log/register-experiment-commands.ts`
- Create: `tests/experiment-log/register-experiment-commands.test.ts`

- [ ] **Step 1: Write failing command tests**

Create `tests/experiment-log/register-experiment-commands.test.ts`:

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import { registerExperimentCommands } from "../../src/experiment-log/register-experiment-commands.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("registerExperimentCommands", () => {
  it("reports the root path and lists experiments", async () => {
    const cwd = makeTempDir();
    writeEventLog(cwd, "exp_20260616-100000Z_abcd", true);
    const command = registeredCommand();
    const ctx = commandContext(cwd);

    await command.handler("where", ctx);
    await command.handler("list", ctx);

    expect(ctx.notifications[0]).toContain("Quailbot experiment log root");
    expect(ctx.notifications[0].replace(/\\/g, "/")).toContain("/.quailbot-pi/experiments");
    const list = notificationJson(ctx.notifications, "Quailbot experiments") as Array<{ experiment_id: string; status: string }>;
    expect(list).toEqual([expect.objectContaining({ experiment_id: "exp_20260616-100000Z_abcd", status: "closed" })]);
  });

  it("shows one experiment timeline by id", async () => {
    const cwd = makeTempDir();
    writeEventLog(cwd, "exp_20260616-100000Z_abcd", false);
    const command = registeredCommand();
    const ctx = commandContext(cwd);

    await command.handler("show exp_20260616-100000Z_abcd", ctx);

    const shown = notificationJson(ctx.notifications, "Quailbot experiment exp_20260616-100000Z_abcd") as { summary: { status: string }; timeline: Array<{ event_kind: string }> };
    expect(shown.summary.status).toBe("interrupted_unknown");
    expect(shown.timeline.map((event) => event.event_kind)).toEqual(["experiment_open", "tool_result"]);
  });
});

function registeredCommand(): { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> } {
  const commands: Array<{ name: string; handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }> = [];
  registerExperimentCommands({ registerCommand: (name: string, options: any) => commands.push({ name, handler: options.handler }) } as never);
  const command = commands.find((item) => item.name === "quailbot-experiments");
  if (!command) throw new Error("quailbot-experiments command was not registered");
  return command;
}

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "quailbot-exp-command-"));
  tempDirs.push(dir);
  return dir;
}

function writeEventLog(cwd: string, id: string, closed: boolean): void {
  const dir = join(cwd, ".quailbot-pi", "experiments", "2026", "06", "16", id);
  mkdirSync(dir, { recursive: true });
  const lines = [
    event(id, { sequence: 1, event_kind: "experiment_open", timestamp_utc: "2026-06-16T10:00:00.000Z" }),
    event(id, { sequence: 2, event_kind: "tool_result", timestamp_utc: "2026-06-16T10:00:01.000Z", outcome: "measured" }),
  ];
  if (closed) lines.push(event(id, { sequence: 3, event_kind: "experiment_close", timestamp_utc: "2026-06-16T10:00:02.000Z", reason: "session_shutdown" }));
  writeFileSync(join(dir, "events.jsonl"), `${lines.join("\n")}\n`, "utf8");
}

function event(id: string, fields: Record<string, unknown>): string {
  return JSON.stringify({ schema_version: 1, event_id: `evt_${fields.sequence}`, experiment_id: id, ...fields });
}

function commandContext(cwd: string): ExtensionCommandContext & { notifications: string[] } {
  const notifications: string[] = [];
  return {
    cwd,
    hasUI: false,
    ui: { notify: (message: string) => notifications.push(message) },
    notifications,
  } as never;
}

function notificationJson(notifications: string[], title: string): unknown {
  const prefix = `${title}\n`;
  const notification = notifications.find((item) => item.startsWith(prefix));
  if (!notification) throw new Error(`missing notification: ${title}`);
  return JSON.parse(notification.slice(prefix.length));
}
```

- [ ] **Step 2: Run the command tests and verify they fail**

Run:

```bash
npm test -- tests/experiment-log/register-experiment-commands.test.ts
```

Expected: FAIL because `register-experiment-commands.ts` does not exist.

- [ ] **Step 3: Implement the command adapter**

Create `src/experiment-log/register-experiment-commands.ts`:

```ts
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import { experimentLogRoot } from "./experiment-log-service.js";
import { findExperimentEventsPath, listExperiments, readExperiment } from "./experiment-log-reader.js";
import type { ExperimentLogEvent } from "./experiment-log-types.js";

export function registerExperimentCommands(pi: ExtensionAPI): void {
  pi.registerCommand("quailbot-experiments", {
    description: "List, show, or locate local Quailbot experiment logs",
    getArgumentCompletions(prefix) {
      return ["list", "show", "where"].filter((command) => command.startsWith(prefix.trim())).map((command) => ({ value: command, label: command }));
    },
    async handler(args, ctx) {
      await handleExperimentCommand(args, ctx);
    },
  });
}

async function handleExperimentCommand(args: string, ctx: ExtensionCommandContext): Promise<void> {
  const [command = "list", ...rest] = splitCommandArgs(args);
  const root = experimentLogRoot(ctx.cwd);
  switch (command) {
    case "where":
      ctx.ui.notify(`Quailbot experiment log root\n${root}`, "info");
      return;
    case "list":
      notifyJson(ctx, "Quailbot experiments", listExperiments(root));
      return;
    case "show": {
      const [experimentId] = rest;
      if (!experimentId) {
        ctx.ui.notify("usage: /quailbot-experiments show <experiment-id>", "warning");
        return;
      }
      const eventsPath = findExperimentEventsPath(root, experimentId);
      if (!eventsPath) {
        ctx.ui.notify(`experiment not found: ${experimentId}`, "warning");
        return;
      }
      const experiment = readExperiment(eventsPath);
      notifyJson(ctx, `Quailbot experiment ${experiment.summary.experiment_id}`, {
        summary: experiment.summary,
        timeline: experiment.events.map(timelineEvent),
        ...(experiment.ignoredTail === undefined ? {} : { ignored_tail: experiment.ignoredTail }),
      });
      return;
    }
    default:
      ctx.ui.notify(`unknown experiment command: ${command}\nusage: /quailbot-experiments list|show <experiment-id>|where`, "warning");
  }
}

function timelineEvent(event: ExperimentLogEvent): Record<string, unknown> {
  return {
    sequence: event.sequence,
    timestamp_utc: event.timestamp_utc,
    event_kind: event.event_kind,
    ...("tool_name" in event ? { tool_name: event.tool_name } : {}),
    ...("outcome" in event ? { outcome: event.outcome } : {}),
    ...("reason" in event ? { reason: event.reason } : {}),
  };
}

function notifyJson(ctx: ExtensionCommandContext, title: string, value: unknown): void {
  ctx.ui.notify(`${title}\n${JSON.stringify(value, null, 2)}`, "info");
}

function splitCommandArgs(input: string): string[] {
  const result: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  for (const char of input.trim()) {
    if (quote) {
      if (char === quote) quote = undefined;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === " " || char === "\t") {
      if (current.length > 0) result.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current.length > 0) result.push(current);
  return result;
}
```

- [ ] **Step 4: Run command tests and typecheck**

Run:

```bash
npm test -- tests/experiment-log/register-experiment-commands.test.ts && npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/experiment-log/register-experiment-commands.ts tests/experiment-log/register-experiment-commands.test.ts
git commit -m "feat: add experiment log command surface"
```

---

### Task 4: Wire extension lifecycle and command registration

**Files:**
- Modify: `src/extension.ts`
- Modify: `tests/e2e/dev-release-adoption.test.ts`

- [ ] **Step 1: Write failing lifecycle adoption tests**

Modify `tests/e2e/dev-release-adoption.test.ts`:

1. Add `readdirSync` to the `node:fs` import:

```ts
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
```

2. Change the command registration expectation in the existing deterministic registration test:

```ts
expect(commands.map((command) => command.name).sort(compareNames)).toEqual(["quailbot-experiments", "quailbot-workspace"]);
```

3. Add these tests before the closing `});` of the top-level describe block:

```ts
  it("opens and closes an experiment log on Pi lifecycle events", async () => {
    const tempCwd = makeTempDir();
    const workspacePath = join(tempCwd, ".quailbot-pi", "workspace.json");
    mkdirSync(dirname(workspacePath), { recursive: true });
    copyFileSync(join(root, "tests", "workspaces", "nanonis-minimal.workspace.json"), workspacePath);
    const { handlers, commands } = await loadBuiltExtensionWithPiStub();
    const ctx = createExtensionContextStub(tempCwd);

    handlers.get("session_start")?.(
      { type: "session_start", reason: "resume" } satisfies SessionStartEvent,
      ctx,
    );
    await handlers.get("session_shutdown")?.({ type: "session_shutdown" }, ctx);

    const command = commands.find((item) => item.name === "quailbot-experiments");
    if (!command) throw new Error("quailbot-experiments command was not registered");
    const commandContext = createCommandContextStub(tempCwd);
    await command.handler("list", commandContext);
    const list = notificationJson(commandContext.notifications, "Quailbot experiments") as Array<{ status: string; event_count: number }>;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ status: "closed", event_count: 2 });
    const logText = readFileSync(firstExperimentEventsPath(tempCwd), "utf8");
    expect(logText).toContain('"session_start_reason":"resume"');
    expect(logText).toContain('"reason":"session_shutdown"');
  });

  it("continues an experiment across same-workspace reload and starts a new one when the workspace hash changes", async () => {
    const tempCwd = makeTempDir();
    const workspacePath = join(tempCwd, ".quailbot-pi", "workspace.json");
    mkdirSync(dirname(workspacePath), { recursive: true });
    copyFileSync(join(root, "tests", "workspaces", "nanonis-minimal.workspace.json"), workspacePath);
    const { handlers } = await loadBuiltExtensionWithPiStub();
    const ctx = createExtensionContextStub(tempCwd);

    handlers.get("session_start")?.(
      { type: "session_start", reason: "startup" } satisfies SessionStartEvent,
      ctx,
    );
    handlers.get("session_start")?.(
      { type: "session_start", reason: "reload" } satisfies SessionStartEvent,
      ctx,
    );
    expect(experimentEventFiles(tempCwd)).toHaveLength(1);

    const changed = readFileSync(workspacePath, "utf8").replace('"rois": []', '"rois": [{ "name": "changed", "w": 1, "h": 1 }]');
    writeFileSync(workspacePath, changed, "utf8");
    handlers.get("session_start")?.(
      { type: "session_start", reason: "reload" } satisfies SessionStartEvent,
      ctx,
    );

    const paths = experimentEventFiles(tempCwd);
    expect(paths).toHaveLength(2);
    expect(paths.map((path) => readFileSync(path, "utf8")).join("\n")).toContain('"reason":"workspace_changed"');
  });
```

4. Add these helper functions near the existing test helpers:

```ts
function experimentEventFiles(cwd: string): string[] {
  const rootPath = join(cwd, ".quailbot-pi", "experiments");
  if (!existsSync(rootPath)) return [];
  const output: string[] = [];
  const visit = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (existsSync(path) && readdirSyncSafe(path) !== undefined) visit(path);
      else if (name === "events.jsonl") output.push(path);
    }
  };
  visit(rootPath);
  return output.sort(compareNames);
}

function readdirSyncSafe(path: string): string[] | undefined {
  try {
    return readdirSync(path);
  } catch {
    return undefined;
  }
}

function firstExperimentEventsPath(cwd: string): string {
  const [path] = experimentEventFiles(cwd);
  if (!path) throw new Error("no experiment event file found");
  return path;
}
```

- [ ] **Step 2: Run adoption tests and verify they fail**

Run:

```bash
npm run dev:release && npm test -- tests/e2e/dev-release-adoption.test.ts
```

Expected: FAIL because `quailbot-experiments` is not registered and lifecycle logging is not wired.

- [ ] **Step 3: Add experiment log runtime fields and lifecycle wiring**

Modify `src/extension.ts`:

1. Add imports:

```ts
import {
  mutationPolicySnapshot,
  workspaceSnapshot,
  type ExperimentMutationPolicySnapshot,
  type ExperimentWorkspaceSnapshot,
} from "./experiment-log/experiment-log-types.js";
import { ExperimentLogService, experimentLogRoot } from "./experiment-log/experiment-log-service.js";
import { registerExperimentCommands } from "./experiment-log/register-experiment-commands.js";
```

2. Extend `QuailbotRuntime`:

```ts
export type QuailbotRuntime = {
  workspace?: Workspace;
  activeWorkspace?: LoadedWorkspace;
  pendingWorkspaceActivation?: PendingWorkspaceActivation;
  workspaceUiServer?: WorkspaceUiServer;
  experimentLog?: ExperimentLogService;
  planStore: PlanContextStore;
};
```

3. Register the command after workspace commands:

```ts
registerQuailbotTools(pi, runtime);
registerWorkspaceCommands(pi, runtime);
registerExperimentCommands(pi);
```

4. Replace the `session_start` handler body with:

```ts
runtime.planStore.clear();
runtime.pendingWorkspaceActivation = undefined;

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

syncExperimentLogForSession(runtime, ctx, sessionStartReason(_event), workspaceSnapshot(activeWorkspace), mutationPolicySnapshot(mutationPolicyFromEnvironment()));
```

5. Replace the `session_shutdown` handler body with:

```ts
try {
  runtime.experimentLog?.close("session_shutdown");
  runtime.experimentLog = undefined;
  await stopWorkspaceUiServer(runtime);
} finally {
  runtime.pendingWorkspaceActivation = undefined;
}
```

6. Add these helper functions near the bottom of the file:

```ts
function syncExperimentLogForSession(
  runtime: QuailbotRuntime,
  ctx: ExtensionContext,
  reason: "startup" | "reload" | "new" | "resume" | "fork",
  workspace: ExperimentWorkspaceSnapshot | undefined,
  mutationPolicy: ExperimentMutationPolicySnapshot | undefined,
): void {
  const existing = runtime.experimentLog;
  if (reason === "reload" && existing !== undefined && existing.currentWorkspaceHash() === workspace?.hash) {
    existing.updateContext({ workspace, mutationPolicy });
    return;
  }

  if (existing !== undefined) {
    existing.close(reason === "reload" ? "workspace_changed" : "session_restarted");
  }

  runtime.experimentLog = new ExperimentLogService({
    root: experimentLogRoot(ctx.cwd),
    warn: (message) => notifyExperimentLogWarning(ctx, message),
  });
  runtime.experimentLog.open({ sessionStartReason: reason, workspace, mutationPolicy });
}

function sessionStartReason(event: unknown): "startup" | "reload" | "new" | "resume" | "fork" {
  const reason = typeof event === "object" && event !== null && "reason" in event ? String((event as { reason?: unknown }).reason) : "startup";
  return reason === "reload" || reason === "new" || reason === "resume" || reason === "fork" ? reason : "startup";
}

function notifyExperimentLogWarning(ctx: ExtensionContext, message: string): void {
  if (ctx.hasUI) {
    ctx.ui.notify(`Quailbot experiment log warning: ${message}`, "warning");
    return;
  }
  console.warn(`Quailbot experiment log warning: ${message}`);
}
```

- [ ] **Step 4: Fix the test directory walker if needed**

If TypeScript objects to the `existsSync + readdirSyncSafe` helper because it treats files and directories ambiguously, replace `experimentEventFiles()` with this version and add `statSync` to the `node:fs` import:

```ts
function experimentEventFiles(cwd: string): string[] {
  const rootPath = join(cwd, ".quailbot-pi", "experiments");
  if (!existsSync(rootPath)) return [];
  const output: string[] = [];
  const visit = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const stat = statSync(path);
      if (stat.isDirectory()) visit(path);
      if (stat.isFile() && name === "events.jsonl") output.push(path);
    }
  };
  visit(rootPath);
  return output.sort(compareNames);
}
```

- [ ] **Step 5: Run lifecycle tests and typecheck**

Run:

```bash
npm run dev:release && npm test -- tests/e2e/dev-release-adoption.test.ts && npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/extension.ts tests/e2e/dev-release-adoption.test.ts
git commit -m "feat: open experiment logs during Pi lifecycle"
```

---

### Task 5: Add plan-step recorder callback

**Files:**
- Modify: `src/tools/quailbot_plan_and_execute.ts`
- Modify: `tests/tools/quailbot-plan-and-execute.test.ts`

- [ ] **Step 1: Write failing plan-recorder tests**

Modify `tests/tools/quailbot-plan-and-execute.test.ts` by adding these tests inside the `describe("quailbot_plan_and_execute", ...)` block:

```ts
  it("emits plan step records only after real step execution", async () => {
    const runCli = vi.fn<RunCli>().mockResolvedValueOnce({
      ok: true,
      exitCode: 0,
      stdout: '{"current":1.2}',
      stderr: "",
      payload: { current: 1.2 },
      argv: ["nqctl", "get", "current"],
    });
    const records: unknown[] = [];
    const ctx = createToolContext({ workspace: fixtureWorkspace(), runCli, mutationPolicy: enabledMutationPolicy() });

    await executeQuailbotPlanAndExecute(
      ctx,
      { steps: [{ kind: "cli_get", cli_name: "nqctl", parameter: "current" }] },
      { onStepResult: (step) => records.push(step) },
    );

    expect(records).toEqual([
      expect.objectContaining({ index: 0, kind: "cli_get", args: { kind: "cli_get", cli_name: "nqctl", parameter: "current" }, primary_result: expect.objectContaining({ ok: true }) }),
    ]);
  });

  it("does not emit plan step records for validation failures", async () => {
    const runCli = vi.fn<RunCli>();
    const records: unknown[] = [];
    const ctx = createToolContext({ workspace: fixtureWorkspace(), runCli, mutationPolicy: enabledMutationPolicy() });

    await executeQuailbotPlanAndExecute(
      ctx,
      { steps: [{ kind: "cli_get", cli_name: "nqctl", parameter: "missing" }] },
      { onStepResult: (step) => records.push(step) },
    );

    expect(records).toEqual([]);
    expect(runCli).not.toHaveBeenCalled();
  });

  it("swallows recorder failures so plan execution semantics are unchanged", async () => {
    const runCli = vi.fn<RunCli>().mockResolvedValueOnce({
      ok: true,
      exitCode: 0,
      stdout: '{"current":1.2}',
      stderr: "",
      payload: { current: 1.2 },
      argv: ["nqctl", "get", "current"],
    });
    const ctx = createToolContext({ workspace: fixtureWorkspace(), runCli, mutationPolicy: enabledMutationPolicy() });

    const result = await executeQuailbotPlanAndExecute(
      ctx,
      { steps: [{ kind: "cli_get", cli_name: "nqctl", parameter: "current" }] },
      { onStepResult: () => { throw new Error("logging down"); } },
    );

    expect(result).toMatchObject({ ok: true, primary_result: { stopped_reason: "completed" } });
  });
```

- [ ] **Step 2: Run plan tests and verify they fail**

Run:

```bash
npm test -- tests/tools/quailbot-plan-and-execute.test.ts
```

Expected: FAIL because `executeQuailbotPlanAndExecute` does not accept a recorder options argument.

- [ ] **Step 3: Implement recorder types and callback**

Modify `src/tools/quailbot_plan_and_execute.ts`:

1. Add after `PlanAndExecuteInput`:

```ts
export type PlanStepResultRecord = {
  index: number;
  kind: PlanAndExecuteStep["kind"];
  args: Record<string, unknown>;
  primary_result: unknown;
  linked_observation?: unknown;
};

export type PlanAndExecuteOptions = {
  onStepResult?: (step: PlanStepResultRecord) => void | Promise<void>;
};
```

2. Change the function signature:

```ts
export async function executeQuailbotPlanAndExecute(
  ctx: ToolContext,
  input: PlanAndExecuteInput,
  options: PlanAndExecuteOptions = {},
): Promise<QuailbotToolResult> {
```

3. Replace the `steps.push({...})` block inside the execution loop with:

```ts
    const stepRecord: PlanStepResultRecord = {
      index,
      kind: step.kind,
      args: { ...step } as Record<string, unknown>,
      primary_result: result.primary_result,
      linked_observation: result.linked_observation,
    };
    steps.push(stepRecord);
    try {
      await options.onStepResult?.(stepRecord);
    } catch {
      // Experiment logging is fail-soft and must not alter plan execution semantics.
    }
```

- [ ] **Step 4: Run plan tests and typecheck**

Run:

```bash
npm test -- tests/tools/quailbot-plan-and-execute.test.ts && npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add src/tools/quailbot_plan_and_execute.ts tests/tools/quailbot-plan-and-execute.test.ts
git commit -m "feat: emit plan execution step records"
```

---

### Task 6: Log registered top-level tool calls

**Files:**
- Modify: `src/tools/register-tools.ts`
- Create: `tests/tools/experiment-log-tool-wrapper.test.ts`

- [ ] **Step 1: Write failing tool-wrapper tests**

Create `tests/tools/experiment-log-tool-wrapper.test.ts`:

```ts
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { ExperimentLogService } from "../../src/experiment-log/experiment-log-service.js";
import { registerQuailbotTools } from "../../src/tools/register-tools.js";
import { loadWorkspace } from "../../src/workspace/load-workspace.js";

const tempDirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("registered tool experiment logging", () => {
  it("logs direct GUI-unavailable tool calls without changing the returned result", async () => {
    const { tool, service } = registeredTool("observe");

    const result = await tool.execute("call-observe", {}) as { details: { action: string; primary_result: { error_type: string } } };

    expect(result.details.action).toBe("observe");
    expect(result.details.primary_result.error_type).toBe("roi_backend_unavailable");
    const events = readEvents(service);
    expect(events.map((event) => event.event_kind)).toEqual(["experiment_open", "tool_invocation_started", "tool_result"]);
    expect(events[2]).toMatchObject({ tool_call_id: "call-observe", tool_name: "observe", outcome: "gui_backend_unavailable" });
  });

  it("logs thrown tool exceptions and rethrows the original error", async () => {
    const { tool, service } = registeredTool("cli_get");

    await expect(tool.execute("call-cli", { cli_name: "nqctl", parameter: "missing" })).rejects.toThrow(/unknown CLI parameter/);

    const events = readEvents(service);
    expect(events.map((event) => event.event_kind)).toEqual(["experiment_open", "tool_invocation_started", "tool_exception"]);
    expect(events[2]).toMatchObject({ tool_call_id: "call-cli", tool_name: "cli_get", outcome: "exception" });
  });

  it("logs plan step results before the final aggregate plan result", async () => {
    const { tool, service } = registeredTool("quailbot_plan_and_execute");

    await tool.execute("call-plan", { steps: [{ kind: "sleep_seconds", seconds: 0 }] });

    const events = readEvents(service);
    expect(events.map((event) => event.event_kind)).toEqual(["experiment_open", "tool_invocation_started", "plan_step_result", "tool_result"]);
    expect(events[2]).toMatchObject({ tool_call_id: "call-plan", outcome: "measured", step: { index: 0, kind: "sleep_seconds" } });
    expect(events[3]).toMatchObject({ tool_call_id: "call-plan", tool_name: "quailbot_plan_and_execute", outcome: "measured" });
  });

  it("does not log quailbot_planwrite or direct sleep_seconds in the first slice", async () => {
    const planwrite = registeredTool("quailbot_planwrite");
    await planwrite.tool.execute("call-planwrite", { text: "remember", mode: "ephemeral" });
    expect(readEvents(planwrite.service).map((event) => event.event_kind)).toEqual(["experiment_open"]);

    const sleep = registeredTool("sleep_seconds");
    await sleep.tool.execute("call-sleep", { seconds: 0 });
    expect(readEvents(sleep.service).map((event) => event.event_kind)).toEqual(["experiment_open"]);
  });
});

function registeredTool(name: string): { tool: { execute: (id: string, params: unknown) => Promise<unknown> }; service: ExperimentLogService } {
  const root = mkdtempSync(join(tmpdir(), "quailbot-tool-log-"));
  tempDirs.push(root);
  const service = new ExperimentLogService({ root, warn: () => undefined });
  service.open({ sessionStartReason: "startup" });
  const tools: Array<{ name: string; execute: (id: string, params: unknown) => Promise<unknown> }> = [];
  registerQuailbotTools({ registerTool: (tool: any) => tools.push(tool) } as never, {
    workspace: loadWorkspace(join(process.cwd(), "tests/workspaces/nanonis-minimal.workspace.json")),
    activeWorkspace: undefined,
    planStore: { clear() {}, render: () => undefined } as never,
    experimentLog: service,
  });
  const tool = tools.find((item) => item.name === name);
  if (!tool) throw new Error(`missing registered tool: ${name}`);
  return { tool, service };
}

function readEvents(service: ExperimentLogService): Array<Record<string, any>> {
  const path = service.currentIdentity()?.eventsPath;
  if (!path) throw new Error("experiment service is not open");
  return readFileSync(path, "utf8").trim().split("\n").map((line) => JSON.parse(line));
}
```

- [ ] **Step 2: Run tool-wrapper tests and verify they fail**

Run:

```bash
npm test -- tests/tools/experiment-log-tool-wrapper.test.ts
```

Expected: FAIL because registered tools are not wrapped with experiment logging.

- [ ] **Step 3: Add logging helper functions**

Modify `src/tools/register-tools.ts`:

1. Add imports:

```ts
import type { PlanStepResultRecord } from "./quailbot_plan_and_execute.js";
```

2. Add this type and helper block above `registerQuailbotTools`:

```ts
type PiToolEnvelope = ReturnType<typeof piToolResult>;
type LoggedToolRun = (parentEventId: string | undefined) => Promise<QuailbotToolResult>;

async function executeLoggedTool(
  runtime: QuailbotRuntime,
  toolCallId: string,
  toolName: string,
  params: unknown,
  run: LoggedToolRun,
): Promise<PiToolEnvelope> {
  const startedAt = Date.now();
  const started = runtime.experimentLog?.recordToolInvocationStarted({ toolCallId, toolName, actionInput: params });
  const parentEventId = started?.event.event_id;
  try {
    const result = await run(parentEventId);
    runtime.experimentLog?.recordToolResult({ toolCallId, toolName, parentEventId, result, durationMs: Date.now() - startedAt });
    return piToolResult(result);
  } catch (error) {
    runtime.experimentLog?.recordToolException({ toolCallId, toolName, parentEventId, actionInput: params, error, durationMs: Date.now() - startedAt });
    throw error;
  }
}

function recordPlanStep(runtime: QuailbotRuntime, toolCallId: string, parentEventId: string | undefined, step: PlanStepResultRecord): void {
  runtime.experimentLog?.recordPlanStepResult({ toolCallId, parentEventId, step });
}
```

- [ ] **Step 4: Wrap selected tool execute handlers**

In `src/tools/register-tools.ts`, change these execute handlers:

```ts
async execute(toolCallId, params) {
  return executeLoggedTool(runtime, toolCallId, "cli_get", params, async () => executeCliGet(runtimeToolContext(runtime), params));
}
```

```ts
async execute(toolCallId, params) {
  return executeLoggedTool(runtime, toolCallId, "cli_set", params, async () => executeCliSet(runtimeToolContext(runtime), params));
}
```

```ts
async execute(toolCallId, params) {
  return executeLoggedTool(runtime, toolCallId, "cli_ramp", params, async () => executeCliRamp(runtimeToolContext(runtime), params));
}
```

```ts
async execute(toolCallId, params) {
  return executeLoggedTool(runtime, toolCallId, "cli_action", params, async () => executeCliAction(runtimeToolContext(runtime), params));
}
```

```ts
async execute(toolCallId, params) {
  return executeLoggedTool(runtime, toolCallId, "observe", params, async () => executeObserve(runtimeToolContext(runtime), params));
}
```

```ts
async execute(toolCallId, params) {
  return executeLoggedTool(runtime, toolCallId, "click_anchor", params, async () => executeClickAnchor(runtimeToolContext(runtime), params));
}
```

```ts
async execute(toolCallId, params) {
  return executeLoggedTool(runtime, toolCallId, "set_field", params, async () => executeSetField(runtimeToolContext(runtime), params));
}
```

```ts
async execute(toolCallId, params) {
  return executeLoggedTool(runtime, toolCallId, "quailbot_plan_and_execute", params, async (parentEventId) =>
    executeQuailbotPlanAndExecute(runtimeToolContext(runtime), params as never, {
      onStepResult: (step) => recordPlanStep(runtime, toolCallId, parentEventId, step),
    }),
  );
}
```

Keep the `quailbot_planwrite` and direct `sleep_seconds` execute handlers unchanged.

- [ ] **Step 5: Run wrapper tests and typecheck**

Run:

```bash
npm test -- tests/tools/experiment-log-tool-wrapper.test.ts tests/tools/quailbot-plan-and-execute.test.ts && npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit Task 6**

```bash
git add src/tools/register-tools.ts tests/tools/experiment-log-tool-wrapper.test.ts
git commit -m "feat: log registered Quailbot tool calls"
```

---

### Task 7: Run semantic acceptance and update roadmap

**Files:**
- Modify: `ROADMAP.md`
- Preserve local evidence under: `.opencode/artifacts/a7-experiment-log/`

- [ ] **Step 1: Run the focused A7 gate**

Run:

```bash
npm run dev:release && npm run typecheck && npm test -- tests/experiment-log/classify-outcome.test.ts tests/experiment-log/experiment-log-service.test.ts tests/experiment-log/experiment-log-reader.test.ts tests/experiment-log/register-experiment-commands.test.ts tests/tools/experiment-log-tool-wrapper.test.ts tests/tools/quailbot-plan-and-execute.test.ts tests/e2e/dev-release-adoption.test.ts && git diff --check
```

Expected: PASS. Preserve the terminal output in `.opencode/artifacts/a7-experiment-log/focused-gate.txt` if the executing workflow needs a durable local evidence trail.

- [ ] **Step 2: Run the real-shaped product-log readback scenario**

Use a temp repo-local runtime cwd outside tracked source, such as `.opencode/artifacts/a7-experiment-log/runtime-cwd/`, then run the built extension through the existing Pi stub or a small local harness that invokes:

1. `session_start` with `reason: "startup"`.
2. `observe` with a named ROI to produce `gui_backend_unavailable`.
3. `quailbot_plan_and_execute` with a `sleep_seconds` step to produce an inner `plan_step_result`.
4. `cli_set` with `QUAILBOT_ALLOW_MUTATING_TOOLS` unset to produce `mutation_denied` without driver execution.
5. `session_shutdown`.

Then open the product JSONL file under `.quailbot-pi/experiments/.../events.jsonl` and verify these semantic facts:

```text
experiment_open appears first
tool_invocation_started precedes each terminal tool_result/tool_exception
observe terminal event outcome is gui_backend_unavailable
quailbot_plan_and_execute has one plan_step_result before its aggregate tool_result
cli_set denied event outcome is mutation_denied
experiment_close appears last with reason session_shutdown
workspace hash is present when a workspace loaded successfully
full result.primary_result is preserved separately from linked_observation
```

Copy the inspected JSONL to `.opencode/artifacts/a7-experiment-log/product-log-readback.jsonl`.

- [ ] **Step 3: Update `ROADMAP.md`**

Add a dated A7 closeout entry with three bullets:

```md
### A7 implementation closeout (2026-06-16)

- Delivered: append-only `.quailbot-pi/experiments/.../events.jsonl` logging, read-only `/quailbot-experiments` commands, lifecycle open/close handling, top-level tool logging, and plan-step result logging.
- Now known: JSONL is sufficient for first-slice local audit/readback; missing close events are visible as `interrupted_unknown`; logging failures are warning-only and do not alter tool results.
- Later phases: A8 can replay by `(experiment_id, sequence)` without changing the event envelope; remote replication/auth/retention remain explicit non-goals until a later phase.
```

- [ ] **Step 4: Commit Task 7**

```bash
git add ROADMAP.md
git commit -m "docs: close A7 experiment log implementation"
```

---

## Final verification before handoff

- [ ] **Step 1: Run the full project gate that is meaningful for this repo**

Run:

```bash
npm run dev:release && npm run typecheck && npm test -- tests/experiment-log/classify-outcome.test.ts tests/experiment-log/experiment-log-service.test.ts tests/experiment-log/experiment-log-reader.test.ts tests/experiment-log/register-experiment-commands.test.ts tests/tools/experiment-log-tool-wrapper.test.ts tests/tools/cli-tools.test.ts tests/tools/quailbot-plan-and-execute.test.ts tests/e2e/dev-release-adoption.test.ts && npm run dev:check && git diff --check
```

Expected: PASS.

- [ ] **Step 2: Inspect git state and recent commits**

Run:

```bash
git status --short && git log --oneline -10
```

Expected: only intended tracked changes remain, or the working tree is clean after the final commit. Recent commits should show the small A7 task commits.

---

## Plan self-review

- Spec coverage: covered storage shape, event envelope, outcome taxonomy, hook placement, plan-step logging, lifecycle semantics, read commands, fail-soft logging, and real readback evidence.
- Placeholder scan: no deferred implementation holes and no generic "add tests" step without concrete test content.
- Type consistency: `PlanStepResultPayload`, `PlanStepResultRecord`, command root helpers, runtime `experimentLog`, and log-service methods are named consistently across tasks.
