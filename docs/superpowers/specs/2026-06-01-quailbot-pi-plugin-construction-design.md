# Quailbot Pi Plugin Construction Design

Date: 2026-06-01
Status: approved design direction, pending written-spec review

## Purpose

Build the Quailbot successor as a Pi agent plugin/extension package. The GitHub remote should contain the plugin product only: the Quailbot tools, workspace reader, linked-observable protocol, prompt/context injection, and supporting TypeScript code needed for Pi to operate scientific instruments through workspace-approved channels.

OpenCode remains the construction orchestrator and semantic verifier. Pi remains the execution worker and runtime substrate. The OpenCode-to-Pi RPC bridge, task packets, Pi runner wrapper, dummy cryo driver, and construction artifacts are internal scaffolding under `.opencode/artifacts/...`; they are not product code for the remote project.

## Substrate facts from the legacy project

The design follows these observed legacy facts from `D:\quailbot`:

- Fixed tools live under `src/quailbot/tools/` and are registered centrally in `src/quailbot/tool_registry.py`. The workspace does not generate one tool per parameter.
- Workspace data is loaded from real JSON files via `load_workspace(path)` and summarized into prompt/context through `_workspace_info()`. The agent sees available ROIs, anchors, CLI parameters, CLI actions, driver names, action availability, and linked observables in that workspace summary.
- CLI tools are driver-agnostic. The `cli_name` comes from workspace data and from the agent's tool arguments; tools dispatch through a generic `CliDriver(executable=cli_name)` style adapter.
- Linked readback is separate from the primary tool result. After a mutating action, Quailbot resolves workspace-defined linked observables, reads them through ROI and/or CLI channels, and injects the resulting observation into subsequent context.
- Legacy `plan_execute` is a hard runtime mode. The successor must not port the mode split; it should expose equivalent deterministic serial execution as a tool.

## Product boundary

Tracked product code should be package-style TypeScript source:

```text
src/
  extension.ts
  workspace/
  prompt/
  linked-observables/
  cli/
  tools/
    cli_get.ts
    cli_set.ts
    cli_ramp.ts
    cli_action.ts
    click_anchor.ts
    set_field.ts
    observe.ts
    sleep_seconds.ts
    quailbot_planwrite.ts
    quailbot_plan_and_execute.ts
```

Responsibilities:

- `extension.ts`: Pi extension entry point. Registers the fixed tool set and installs context hooks.
- `workspace/`: real workspace file loading, active-workspace selection, last-workspace state, starter/local workspace behavior, and normalized workspace model.
- `prompt/`: workspace summary and plan/context injection text. This is where the Pi model receives instrument parameter information.
- `linked-observables/`: resolves linked observables from workspace + tool action + tool args, then reads them through CLI/ROI channels.
- `cli/`: generic subprocess driver adapter. It must not hardcode `nqctl`, `dummy_cryocli`, or future driver names.
- `tools/`: fixed Pi tools. Workspace data is used inside these tools for validation, policy, and execution, not to generate the tool names.

Internal construction-only paths remain under `.opencode/artifacts/...`, including:

- RPC bridge and collect/smoke/prompt helper scripts.
- `run-pi.mjs` or equivalent repo-local Pi launch wrapper.
- task markdown files sent from OpenCode to Pi.
- bridge jobs, events, responses, session captures, and diffs.
- copied dummy cryo driver used for construction/testing.

## Workspace behavior

Workspace loading must be a real product flow, not a special test-only path.

Selection precedence:

1. explicit workspace path supplied by command/config/task context;
2. saved last workspace path;
3. local starter workspace path.

The workspace summary injected into Pi context should include the same semantic information as legacy `_workspace_info()`:

- `workspace_path`;
- active ROIs with descriptions;
- active anchors with descriptions and linked observables;
- enabled CLI parameters with `name`, `cli_name`, `ref`, description, actions, relevant safety/schema fields;
- enabled CLI actions with `name`, `cli_name`, `ref`, safety mode, action command details, linked observables;
- `actions_available` booleans for `cli_get`, `cli_set`, `cli_ramp`, and `cli_action`.

No `fixtures/workspaces/` convention should be introduced. Any test or construction workspace file must be loaded through the same workspace resolver used by the plugin.

## Tool model

Tools are fixed and registered by the plugin. The initial migrated set is:

- `cli_get`
- `cli_set`
- `cli_ramp`
- `cli_action`
- `click_anchor`
- `set_field`
- `observe`
- `sleep_seconds`
- `quailbot_planwrite`
- `quailbot_plan_and_execute`

Not in initial scope:

- `wait_until`
- `launch_calibrator`
- legacy `finish` / `fail` control tools
- one-tool-per-instrument-parameter generation

Each tool validates its inputs against the active workspace before doing work. For CLI tools, validation includes:

- workspace CLI is enabled;
- `cli_name:parameter` or `cli_name:action` exists;
- target is enabled;
- requested operation (`get`, `set`, `ramp`, `action`) is allowed;
- safety mode is not blocked;
- required args are present.

Execution remains driver-agnostic:

```text
tool args: { cli_name: "nqctl", parameter: "bias", ... }
       -> validate against workspace
       -> generic CLI driver spawns executable "nqctl"
```

The same mechanism must work for `nqctl`, construction-only `dummy_cryocli`, or future CLI drivers named by workspace data.

## Linked-observable protocol

The linked-observable protocol is the product center.

For a single mutating tool call:

```text
primary tool execution
  -> primary result
  -> resolve linked observables from workspace + action + args
  -> read observables through CLI/ROI channels
  -> produce observation payload
  -> expose primary result and observation to Pi context as distinct fields
```

Resolution sources:

- explicit linked observables supplied by the tool call;
- anchor-linked observables for GUI tools;
- CLI parameter self-readback when applicable;
- CLI parameter/action `linked_observables` declared in workspace.

Observation is not the same thing as the primary tool result. The implementation may use Pi's `tool_result` lifecycle hook as a convenient attachment point, but the semantic object must remain separate:

```text
{
  primary_result: {...},
  linked_observation: {
    channels: {
      cli: {...},
      roi: {...}
    }
  }
}
```

For non-mutating tools, linked readback is not forced unless the tool explicitly asks for observation.

## `quailbot_planwrite`

`quailbot_planwrite` is a new tool, not inherited from legacy Quailbot.

Purpose: let Pi maintain an explicit plan context without relying on hidden scratch reasoning.

Input:

```text
{
  text: string,
  mode: "system" | "ephemeral",
  clean?: boolean
}
```

Behavior:

- `mode: "system"` stores or updates persistent plan context injected into later Pi turns.
- `mode: "ephemeral"` returns the text as ordinary tool output for the current turn and does not persist it.
- `clean: true` clears the persistent plan context before applying any new text.

The tool result should clearly say whether text was stored, returned ephemerally, or cleared.

## `quailbot_plan_and_execute`

`quailbot_plan_and_execute` is a new tool that turns the old hardcoded `plan_execute` mode into a callable tool.

Pi agent responsibility:

- write a concrete serial program in tool arguments;
- choose workspace-approved `cli_name`, parameter/action names, values, ramp intervals, waits, and explicit linked observables when needed;
- submit the program once.

Tool responsibility:

- validate the entire program before execution;
- execute steps procedurally, synchronously, and sequentially;
- never call the model between steps;
- never parallelize side-effecting steps;
- after each mutating step, perform linked-observable readback;
- assemble all step results and observations into one final tool result.

The tool behaves like a blocking `bash` command from Pi's point of view: Pi submits the program, waits, and receives one returned result.

Initial step kinds:

```text
cli_get
cli_set
cli_ramp
cli_action
click_anchor
set_field
observe
sleep_seconds
```

Result shape:

```text
{
  ok: boolean,
  stopped_reason: "completed" | "validation_failed" | "step_failed" | "aborted" | "timeout",
  steps: [
    {
      index: number,
      kind: string,
      args: object,
      primary_result: object,
      linked_observation?: object
    }
  ]
}
```

No extra per-step Pi messages are required in the first implementation. If operator progress display is needed later, it must not change the core semantic contract: one submitted program returns one final tool result containing the per-step list.

## Experiment logging

Pi already has its own session history. That should remain Pi's conversational/session substrate.

The Quailbot plugin should later add a separate experiment log for real instrument runs. This is not part of the first construction phase, but the design reserves it as a future subsystem.

Experiment log target semantics:

- experiment id;
- workspace path/hash;
- operator task;
- tool actions and arguments;
- primary tool results;
- linked observations;
- timestamps;
- driver payloads/stdout/stderr where relevant;
- abort/failure records.

This log is for scientific auditability. It is not a replacement for Pi's session file and not the same as OpenCode construction artifacts.

## Acceptance plan

Acceptance must be semantic, not just type/lint success.

### Semantic E2E test harness

The implementation plan must include semantic E2E tests, not only unit tests and manual inspection gates.

These tests are construction-time acceptance tests driven by OpenCode through the internal RPC bridge under `.opencode/artifacts/...`. They may use bridge scripts, task packets, copied dummy cryo driver code, and captured Pi session artifacts from the internal scaffold, but those bridge/scaffold files remain outside the tracked product package.

Each semantic E2E test must run the real Pi extension in a real Pi session and inspect preserved artifacts. A passing test must prove the intended behavior from the outside, not merely assert that a function returned `ok`.

Required semantic E2E scenarios:

1. **Workspace-to-context E2E** — start Pi with the Quailbot plugin and a real workspace path; verify the model-visible context/session contains the workspace summary with enabled CLI parameters/actions and linked-observable declarations.
2. **Driver-agnostic CLI E2E** — execute a CLI operation using a workspace-declared `cli_name`; verify the driver executable came from the workspace/tool args, not from hardcoded product logic.
3. **Linked-observable E2E** — execute a mutating action with declared linked observables; verify the final Pi-visible result contains both the primary result and the separate linked observation payload.
4. **Blocked capability E2E** — attempt an unknown, disabled, or policy-blocked target; verify the run fails before driver execution and preserves a structured validation failure.
5. **Planwrite E2E** — call `quailbot_planwrite` in `system`, `ephemeral`, and `clean` modes; verify persistent context behavior by inspecting the next Pi turn/session messages.
6. **Plan-and-execute E2E** — submit one concrete serial program to `quailbot_plan_and_execute`; verify Pi receives one blocking final tool result containing the ordered per-step list and linked observations after mutating steps.

Each E2E test must preserve at least:

- task prompt / command packet;
- Pi events and responses;
- Pi session file or exported messages;
- final tool result payload;
- linked observation payloads;
- summary stating which semantic assertions passed or failed.

The implementation plan should still include unit tests for workspace parsing, CLI validation, linked-observable resolution, and tool argument schemas, but those are support signals. The semantic E2E suite is the completion gate for the migrated protocol.

### Gate 0: product boundary

Pass if a repository review shows tracked product code is the Quailbot Pi plugin and does not include RPC bridge, `run-pi.mjs`, dummy cryo scaffold, bridge jobs, or OpenCode task packets as product files.

### Gate 1: workspace context injection

Run Pi with the Quailbot plugin and a real workspace path. Inspect Pi context/session evidence and confirm the workspace summary includes CLI driver names, enabled parameters/actions, ROIs, anchors, and linked-observable declarations.

### Gate 2: driver-agnostic CLI tool validation

Using a workspace that names `nqctl` or construction-only `dummy_cryocli`, call `cli_get`/`cli_set`/`cli_ramp`/`cli_action`. Confirm the tools validate against workspace data and dispatch through the generic CLI adapter using the supplied `cli_name`.

### Gate 3: linked-observable readback after a mutating call

Execute a mutating CLI action whose workspace declares linked observables, such as the legacy examples:

- `zctrl_setpnt -> current`
- `Scan_Action -> scan_status, scan_buffer, scan_speed`

Pass only if the primary result and linked observation are both visible to Pi as distinct semantic fields.

### Gate 4: `quailbot_planwrite`

Call `quailbot_planwrite` in `system`, `ephemeral`, and `clean` modes. Confirm persistent plan context appears only when requested, ephemeral output does not persist, and clean removes the persistent plan.

### Gate 5: `quailbot_plan_and_execute`

Submit a concrete serial program containing at least one mutating step and one wait/read step. Pass only if the tool blocks until completion and returns one final result containing an ordered step list with primary results and linked observations for mutating steps.

### Gate 6: blocked/invalid capability

Try to use a disabled, unknown, or policy-blocked workspace target. Pass only if the tool fails before driver execution and reports a structured validation failure.

## Phase sequence

1. **Scaffold isolation pass** — keep RPC bridge, Pi runner, task packets, and dummy cryo driver under `.opencode/artifacts/...`; remove or relocate product-looking runner code from tracked source when implementation begins.
2. **Minimal plugin skeleton** — package-style `src/` extension entry, tool registration, context hook, workspace resolver shell.
3. **Semantic E2E harness** — define the bridge-driven E2E runner, artifact contract, and scenario assertions before broad implementation.
4. **Workspace summary injection** — real workspace load/selection flow and prompt/context summary, proven by Workspace-to-context E2E.
5. **Fixed tool implementations** — migrate selected tools into `src/tools/`, with driver-agnostic CLI dispatch, proven by Driver-agnostic CLI and Blocked capability E2E.
6. **Linked-observable readback** — shared resolver/readback path used by mutating tools, proven by Linked-observable E2E.
7. **`quailbot_planwrite`** — persistent/ephemeral/clean plan context tool, proven by Planwrite E2E.
8. **`quailbot_plan_and_execute`** — blocking serial program executor with final per-step result list, proven by Plan-and-execute E2E.
9. **Deferred experiment log** — design and implement after the core protocol works.

## Non-goals

- Do not port the legacy `chat/react/plan_execute` runtime mode split.
- Do not generate a Pi tool per workspace parameter.
- Do not hardcode `nqctl` into product tool implementations.
- Do not introduce `fixtures/workspaces/` or a separate test-only workspace loader.
- Do not track OpenCode RPC bridge scaffolding as product code.
- Do not build the full experiment log in the first implementation round.
