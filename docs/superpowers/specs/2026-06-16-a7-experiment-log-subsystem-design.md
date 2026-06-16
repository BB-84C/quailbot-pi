# A7 Experiment Log Subsystem

Date: 2026-06-16

## Status

Design approved for planning. Implementation has not started.

Phase A6 was intentionally skipped: Pi already exposes aggregate context pressure in the TUI footer, and a provider-token component breakdown is not credible at the quailbot-pi plugin layer. A7 is the next active operability phase.

## Goal

Add a durable Quailbot experiment log for local Pi runs.

The log is product runtime evidence. It is separate from Pi chat/session history and separate from OpenCode construction artifacts. It records the actions Quailbot attempted, the workspace revision they were bound to, the primary tool result, linked-observable readback, policy-denied actions, validation failures, runtime failures, and interruption states.

A7 does not invent a second instrument-result schema. It persists the existing `QuailbotToolResult` evidence, including `primary_result` and `linked_observation`, with a small append-only event envelope around it.

## Substrate findings

### Tool result contract

`src/tools/tool-result.ts` defines the canonical result shape:

```ts
export type QuailbotToolResult = {
  ok: boolean;
  action: string;
  action_input: unknown;
  primary_result: unknown;
  linked_observation?: unknown;
};
```

Every A7 event that records an action result uses this result shape as the evidence source. A7 may add envelope metadata such as experiment id, sequence, timestamp, workspace hash, and outcome class, but it must not re-encode `primary_result` or merge linked readback into the primary result.

### CLI and linked-observable evidence

The CLI driver already preserves:

- `ok`
- `exitCode`
- `stdout`
- `stderr`
- parsed `payload` when strict JSON parsing succeeds
- `argv`
- `error_type` / `error_message` for timeout and spawn errors

The direct CLI tools copy these fields into `primary_result`.

Mutating CLI tools (`cli_set`, `cli_ramp`, `cli_action`) then perform linked-observable readback through `readLinkedObservables(...)`. That readback is a separate `linked_observation` object with CLI and ROI channels plus unresolved refs. This separation is load-bearing: action result and measured readback answer different questions.

### Mutation policy evidence

Mutation policy is controlled by `QUAILBOT_ALLOW_MUTATING_TOOLS` and gates:

- `cli_set`
- `cli_ramp`
- `cli_action`
- `click_anchor`
- `set_field`

When disabled, the direct mutating tools return a normal `QuailbotToolResult` with:

```text
primary_result.error_type = "mutation_policy_disabled"
```

A7 treats this as an auditable `mutation_denied` outcome. It is not the same as driver failure and not the same as plan validation failure.

### Plan execution evidence

`quailbot_plan_and_execute` validates the entire submitted program before side effects. A validation failure returns:

```text
primary_result.stopped_reason = "validation_failed"
primary_result.steps = []
```

When validation passes, steps run sequentially. Each completed step is represented in the aggregate result as:

```text
index
kind
args
primary_result
linked_observation
```

The current aggregate result is enough to prove final ordering when the tool returns normally. A7 also needs durable step events during plan execution so a process interruption after an already-applied step does not erase evidence of that step.

### Workspace identity

`LoadedWorkspace` already carries:

- selected workspace path
- selection source (`explicit`, `settings`, or `starter`)
- parsed workspace
- SHA-256 hash of the workspace file bytes
- summary readback

A7 uses the SHA-256 workspace hash as the current workspace revision. It does not invent a separate revision counter.

### Existing local state boundary

Project-local Quailbot state already lives under `.quailbot-pi/`. A7 logs live under:

```text
.quailbot-pi/experiments/
```

They do not live under `.pi-state/` and do not live under `.opencode/artifacts/`.

## Design

### Storage shape

Each experiment is a directory:

```text
.quailbot-pi/experiments/YYYY/MM/DD/<experiment_id>/
  events.jsonl
  blobs/
```

`events.jsonl` is the append-only source of truth. Each line is one complete JSON object with a trailing newline. The reader parses complete lines and treats a partial trailing line as interrupted/corrupt tail evidence, not as a valid event.

`blobs/` is reserved for future or oversized raw payloads. The first implementation may not need sidecars for ordinary CLI payloads, but the directory is part of the storage contract so GUI screenshots, large stdout/stderr, or future remote-host artifacts can be referenced without changing experiment identity.

### Experiment id

Experiment ids are time-sortable and collision-resistant:

```text
exp_<YYYYMMDD-HHMMSSZ>_<short-random>
```

The exact random suffix generator is an implementation detail. The id must be safe as a directory name on Windows.

### Event envelope

Every event has:

```ts
type ExperimentLogEvent = {
  schema_version: 1;
  event_id: string;
  experiment_id: string;
  sequence: number;
  timestamp_utc: string;
  event_kind: string;
  workspace?: {
    path: string;
    hash: string;
    source: "explicit" | "settings" | "starter" | "written" | "candidate";
  };
  mutation_policy?: {
    mutating_tools_enabled: boolean;
    enable_env_var: "QUAILBOT_ALLOW_MUTATING_TOOLS";
  };
};
```

`sequence` is monotonically increasing inside one experiment. Readers use `(experiment_id, sequence)` as the stable cursor shape for future A8 replication.

Workspace metadata is recorded on every action/result event, not only in `experiment_open`. If the workspace changes across reloads, the event stream remains self-describing.

### Event kinds

First-slice event kinds:

```text
experiment_open
tool_invocation_started
tool_result
tool_exception
plan_step_result
experiment_close
```

`experiment_open` records:

- `session_start_reason`
- `previous_session_file` if Pi exposes it
- workspace path/hash/source
- mutation policy snapshot

`tool_invocation_started` records:

- top-level Pi tool name
- top-level tool call id
- action input
- workspace path/hash/source
- mutation policy snapshot

`tool_result` records:

- full `QuailbotToolResult`
- outcome class
- duration if the wrapper can measure it cleanly

`tool_exception` records a thrown exception from a registered tool wrapper and then rethrows the original exception so existing Pi behavior is unchanged.

`plan_step_result` records a completed `quailbot_plan_and_execute` inner step during the plan loop:

- parent top-level plan event id
- step index
- step kind
- step args
- step primary result
- step linked observation
- outcome class

`experiment_close` records:

- close reason
- count summary
- last sequence written

Missing `experiment_close` is meaningful. Readers display the experiment as `interrupted_unknown`; they do not synthesize a fake close event.

### Outcome taxonomy

A7 classifies events into these outcome classes:

| Outcome | Meaning |
|---|---|
| `applied` | Mutating action returned `ok: true` |
| `measured` | Read-only measurement returned `ok: true` |
| `mutation_denied` | Mutation policy blocked the action before driver execution |
| `validation_failed` | Plan preflight failed before side effects |
| `step_failed` | A plan step failed after prior steps may have run |
| `driver_failure` | Driver ran but returned non-ok, timeout, spawn error, or non-zero exit |
| `readback_failure` | Primary action may have succeeded, but linked-observable readback failed or was unresolved |
| `gui_backend_unavailable` | Current GUI/ROI backend returned an unavailable boundary |
| `exception` | Registered tool wrapper caught a thrown exception |
| `interrupted_unknown` | Reader observed an experiment without a close event |

`readback_failure` is not allowed to erase the primary result. It is an additional uncertainty signal attached to the action/readback loop.

### Logging granularity

Direct experiment-relevant tools produce one started event and one terminal event:

- `cli_get`
- `cli_set`
- `cli_ramp`
- `cli_action`
- `observe`
- `click_anchor`
- `set_field`
- `quailbot_plan_and_execute`

`quailbot_planwrite` is plan-context mutation, not instrument evidence, and is excluded from the first slice.

Direct `sleep_seconds` is excluded from the first slice. A `sleep_seconds` step inside `quailbot_plan_and_execute` is still represented as a plan step because it is part of the submitted serial program.

`quailbot_plan_and_execute` also emits `plan_step_result` events as steps complete. The final aggregate `tool_result` still contains the full `primary_result.steps[]`. The duplicated step facts are intentional: the aggregate proves final returned shape; the step events preserve partial progress if the process stops before the aggregate can be returned.

### Logging hook placement

Use the registered tool boundary in `src/tools/register-tools.ts`.

Do not put durable experiment logging in:

- `runCli`
- `readLinkedObservables`
- `executeCliSet`
- `executeCliRamp`
- `executeCliAction`
- `executeCliGet`

Those seams either lose tool/action semantics or would double-log plan internals.

For plan step events, add a narrow plan-recorder callback to `quailbot_plan_and_execute` from the registered tool wrapper. Validation-context calls remain synthetic and must not be logged as driver evidence.

### Logging failure policy

Logging failure is fail-soft.

If writing an experiment event fails:

- warn through Pi UI when available;
- otherwise warn through a local diagnostic channel such as stderr;
- do not block the tool;
- do not convert the instrument/tool result into a logging failure;
- do not claim the action was logged.

This follows the user's decision: instrument operation should not be stopped solely because local logging failed.

### Pi session resume and reload semantics

Pi session resume does not automatically continue the old experiment log.

Rules:

| Pi lifecycle | A7 behavior |
|---|---|
| `session_start` with `startup`, `new`, `resume`, or `fork` | Open a new experiment log |
| `session_start` with `reload` and same workspace hash | Continue the current runtime experiment |
| `session_start` with `reload` and changed workspace hash | Close current experiment with `workspace_changed` and open a new experiment |
| `session_shutdown` | Write `experiment_close` with `session_shutdown` |
| Process crash / kill / hard exit | No close event; reader reports `interrupted_unknown` |
| Resume an old Pi session later | New experiment with `session_start_reason: "resume"`; no automatic continuation |

Explicitly resuming an old experiment, if ever needed, should be a future explicit operator command such as `/quailbot-experiments resume <experiment_id>`. It is not part of A7 first slice.

### Read surface

Add a thin command adapter over a transport-neutral reader service:

```text
/quailbot-experiments list
/quailbot-experiments show <experiment_id>
/quailbot-experiments where
```

`list` shows recent experiment ids, workspace hash prefixes, start time, close/interruption status, and counts.

`show` reads one experiment and renders its event timeline.

`where` reports the experiment-log root path.

This command is read-only. It does not mutate logs and does not send log content into model-visible context.

## Architecture options considered

| Option | Summary | Decision |
|---|---|---|
| Append-only JSONL under `.quailbot-pi/experiments` | Human-readable, low dependency, crash-friendly, A8 can replay by sequence | selected |
| One big per-experiment JSON file | Requires read-modify-write on every event; weak crash behavior | rejected |
| SQLite | Better query/concurrency, but premature before A8 multi-user host | deferred |
| Pi session history | Chat/session state is not instrument evidence | rejected |
| `.opencode/artifacts` | Construction acceptance evidence, not product runtime log | rejected |

## Explicit non-goals

- No SQLite in A7 first slice.
- No remote host API, auth, or approved-destination policy.
- No automatic log deletion or retention policy.
- No replay/re-execution from logs.
- No operator signatures or non-repudiation.
- No encryption-at-rest.
- No cross-experiment analytics.
- No web dashboard.
- No workspace snapshot by default; path + SHA-256 hash is the first-slice revision contract.
- No logging of arbitrary shell/file support tools.

## Acceptance plan

### Unit acceptance

Use temp log roots, deterministic clocks/ids, and mocked `RunCli` where possible.

Required checks:

1. `ExperimentLogService` writes complete JSONL lines with increasing `sequence` values.
2. Reader parses complete lines and reports missing close as `interrupted_unknown`.
3. Outcome classification distinguishes:
   - `applied`
   - `measured`
   - `mutation_denied`
   - `validation_failed`
   - `step_failed`
   - `driver_failure`
   - `readback_failure`
   - `gui_backend_unavailable`
   - `exception`
4. Large raw fields are either preserved in ordinary rows or spilled to sidecar pointers without truncating semantic `payload`.
5. Logging write errors are warning-only and do not change tool return values.

### Tool wrapper acceptance

Use existing workspace fixtures and mocked drivers.

Scenarios:

1. Direct `cli_get` success logs a measured result with CLI `argv`/payload.
2. Direct `cli_set` success logs primary result and separate linked-observable readback.
3. Direct mutation with disabled policy logs `mutation_denied` and driver invocation count remains zero.
4. Direct validation exception logs `tool_exception` and rethrows the original error.
5. GUI unavailable result logs `gui_backend_unavailable` without pretending GUI evidence exists.

### Plan acceptance

Scenarios:

1. Successful `quailbot_plan_and_execute` logs one top-level plan invocation, per-step `plan_step_result` events in order, and one aggregate final `tool_result`.
2. Plan validation failure logs the submitted plan and `validation_failed`; no plan step events and no real driver calls appear.
3. Plan step failure logs only completed steps and the failed step; later steps are absent.
4. A simulated logging failure during a step emits a warning but the plan execution continues according to existing tool semantics.

### Lifecycle acceptance

Scenarios:

1. `session_start` with `resume` creates a new experiment and records `session_start_reason: "resume"`.
2. `reload` with unchanged workspace hash continues the current runtime experiment.
3. `reload` with changed workspace hash closes the old experiment and opens a new one.
4. A log file without `experiment_close` is read as `interrupted_unknown`, not retroactively repaired.

### Real acceptance

Preserve acceptance evidence under `.opencode/artifacts/a7-experiment-log/...` while the product log itself lives under `.quailbot-pi/experiments/...`.

Run or replay a real-shaped session against the existing Nanonis simulator substrate:

- `cli_set bias_v` with linked readback
- `cli_ramp bias_v` with linked readback
- denied mutation with policy disabled
- plan validation failure before side effects
- plan step failure

Acceptance requires opening the product JSONL log and verifying event order, workspace hash, primary result preservation, linked-observation separation, and failure taxonomy.

## Implementation notes for planning

Likely files:

- new `src/experiment-log/experiment-log-types.ts`
- new `src/experiment-log/classify-outcome.ts`
- new `src/experiment-log/experiment-log-service.ts`
- new `src/experiment-log/experiment-log-reader.ts`
- new `src/experiment-log/register-experiment-commands.ts`
- edit `src/extension.ts`
- edit `src/tools/register-tools.ts`
- edit `src/tools/quailbot_plan_and_execute.ts` for a narrow plan-recorder callback
- tests under `tests/experiment-log/`, `tests/tools/`, and `tests/e2e/`

Implementation should be test-driven. Start with the pure outcome classifier and JSONL writer/reader before wiring the registered tool boundary.
