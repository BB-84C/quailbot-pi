# Local dev release and golden RPC design

Date: 2026-06-02

## Goal

Make `quailbot-pi` usable as a repo-local Pi plugin during normal development, then add a local golden workflow that drives a real Pi agent through the RPC bridge against the active quantum-instrument workspace.

The workflow should be low-friction:

- after each implementation or partial fix, rebuild the local dev release;
- start the repo-owned Pi agent with one simple command;
- verify that Pi loaded the current plugin release and active workspace;
- run a simulator golden task through Pi, not by calling product functions directly.

The initial golden task is a Nanonis Simulator bias ramp, but product code must remain instrument/task agnostic. Hardcoded product domain is only: controlling quantum physics experiment instruments/devices through workspace-declared contracts.

## Non-goals

- Do not track a Nanonis-specific importer such as `scripts/import-nanonis-workspace.mjs`.
- Do not hardcode Nanonis, `bias_v`, simulator paths, or ramp values into product code.
- Do not commit local real-workspace files, simulator task packets, RPC bridge jobs, generated artifacts, or session snapshots.
- Do not make GUI backends real in this round.
- Do not make semantic E2E CI-regenerate all artifacts in this round unless required by implementation discoveries.

## Local dev release

### Package shape

Add a Pi package manifest to `package.json`:

```json
{
  "pi": {
    "extensions": ["./dist/src/extension.js"]
  }
}
```

The dev release is the built `dist` extension, not the source file. This keeps the workflow release-like: Pi consumes what the package would ship, while `dist/` itself remains ignored.

### Project-local Pi config

Track `.pi/settings.json`:

```json
{
  "packages": [".."]
}
```

Paths in `.pi/settings.json` resolve relative to `.pi/`, so `..` means the repository root. Pi loads this repo as a local package and discovers the `package.json` Pi manifest.

### Scripts

Add package scripts:

```json
{
  "scripts": {
    "dev:release": "npm run build",
    "pi": "npm run dev:release && npm exec -- pi --session-dir .pi-state/sessions",
    "pi:mutating": "npm run dev:release && powershell -NoProfile -Command \"$env:QUAILBOT_ALLOW_MUTATING_TOOLS='1'; npm exec -- pi --session-dir .pi-state/sessions\"",
    "dev:check": "npm run dev:release && vitest --run tests/e2e/dev-release-adoption.test.ts"
  }
}
```

`npm run pi` is the normal read-only/observe workflow. `npm run pi:mutating` enables mutating tools for an intentional instrument-control session.

If a cross-platform command becomes necessary later, replace the PowerShell-specific script with a tiny generic runner or add `cross-env`. For this Windows development environment, the PowerShell script is acceptable and avoids adding a dependency.

### Git hygiene

Track only the project-local Pi config that defines the dev release. Ignore runtime state:

```gitignore
.pi/git/
.pi/npm/
.pi/sessions/
.pi/cache/
.quailbot-pi/
```

`dist/`, `.opencode/`, and `.pi-state/` stay ignored as they are today.

## Workspace selection and local real workspace

The plugin already resolves workspace selection from:

1. explicit path if provided by code;
2. `.quailbot-pi/settings.json`;
3. `.quailbot-pi/workspace.json`.

For local simulator work, create ignored local state:

```text
.quailbot-pi/settings.json
```

pointing at either:

```text
D:\quailbot\workspaces\workspace.json
```

or an ignored local copy/slice under:

```text
.quailbot-pi/workspaces/<local-name>.workspace.json
```

No tracked script may be Nanonis-specific. If we need a tracked helper, it must be generic, for example:

```text
scripts/workspace-use.mjs <workspace-path>
scripts/workspace-doctor.mjs
```

Those helpers may read/write `.quailbot-pi/settings.json`, validate that the active workspace loads, and report available read/mutate capabilities. They must not embed instrument-specific parameter names or task values.

## Generic mutation policy

### Policy rule

Mutating quantum-instrument/device actions are disabled by default unless explicitly enabled.

Environment variable:

```text
QUAILBOT_ALLOW_MUTATING_TOOLS=1
```

Allowed without this variable:

- `cli_get`
- `observe`
- `sleep_seconds`
- `quailbot_planwrite`
- `quailbot_plan_and_execute` when every step is read/observe/sleep-only

Blocked without this variable:

- `cli_set`
- `cli_ramp`
- `cli_action`
- `click_anchor`
- `set_field`
- `quailbot_plan_and_execute` when any step is mutating

### Failure semantics

Blocked mutating calls fail before driver/backend execution with a structured policy result. The result should include:

```text
error_type: "mutation_policy_disabled"
message: "Mutating quantum-instrument tools require QUAILBOT_ALLOW_MUTATING_TOOLS=1."
```

For `quailbot_plan_and_execute`, mutation-policy failure happens during full-program preflight and returns:

```text
stopped_reason: "validation_failed"
validation_error: "mutation policy disabled ..."
steps: []
```

No mutating step may execute before this failure.

### Context visibility

Workspace context injected into Pi should state whether mutating tools are currently enabled. This gives the model an explicit operating contract before it chooses tools.

## Golden RPC workflow

The golden task must be driven through the Pi agent via the RPC bridge, not by calling product functions directly. The RPC bridge remains construction-only under `.opencode/artifacts/...`.

### Runs

The golden task has two required RPC runs against the same active workspace contract:

1. **Individual-tools run** — Pi must perform the task without `quailbot_plan_and_execute`.
   - Expected tool pattern: `cli_get`, then `cli_ramp`, then `cli_ramp`, then final `cli_get` or linked readback inspection.
   - The RPC task prompt must explicitly forbid `quailbot_plan_and_execute`.

2. **Plan-and-execute run** — Pi must perform the same task using `quailbot_plan_and_execute`.
   - Expected tool pattern: one `quailbot_plan_and_execute` call containing the concrete serial program after any required initial read.
   - The final result must contain one ordered step list.

Both runs must go through a real Pi process/session via RPC. Both must preserve artifacts.

### Initial local task packet

The first local golden packet may reference the Nanonis Simulator workspace by contract, but it remains ignored under `.opencode/artifacts/...`.

Task intent:

```text
Use the active Quailbot workspace.
Read the current bias value.
Ramp the bias from current value to 0.5 V using 0.01 V steps at 0.1 s interval.
Then ramp the bias from 0.5 V to 1.0 V using 0.02 V steps at 0.1 s interval.
Read back or report the final bias value.
```

Local known workspace target from `D:\quailbot\workspaces\workspace.json`:

```text
cli: nqctl
parameter: bias_v
get command: Bias_Get
set command: Bias_Set
ramp enabled: true
safety range: -5.0 V to 5.0 V
```

This target is evidence for the local task packet only. It is not a product constant.

### Artifact requirements

For each golden run, preserve an artifact under:

```text
.opencode/artifacts/nanonis-simulator-golden/<timestamp>/<mode>.json
```

Required fields:

- task packet / prompt;
- RPC command stream;
- Pi events/responses/messages;
- active workspace path and hash;
- mutation policy state;
- final tool result payloads;
- driver invocation log if available;
- initial readback;
- target ramp arguments;
- final readback;
- semantic assertions.

Required assertions:

- Pi loaded the dev release plugin.
- Pi loaded the active workspace.
- Mutating tools were explicitly enabled for the run.
- Individual-tools run did not call `quailbot_plan_and_execute`.
- Plan-and-execute run called `quailbot_plan_and_execute` exactly once for the serial program.
- Requested ramp targets are `0.5 V` and `1.0 V`.
- Requested steps are `0.01 V` and `0.02 V`.
- Requested interval is `0.1 s`.
- Final readback is approximately `1.0 V`, using a tolerance defined in the task packet or artifact generator.
- No undeclared workspace parameter was mutated.

## Acceptance plan

### Dev release adoption

Pass if:

- `npm run dev:release` builds successfully.
- `npm run pi` starts Pi with the repo-local package without requiring `-e`.
- a deterministic adoption test proves Pi discovers the Quailbot tools from the package manifest.
- `before_agent_start` context includes the active workspace and mutation-policy state.

### Mutation policy

Pass if:

- read-only tools work when `QUAILBOT_ALLOW_MUTATING_TOOLS` is absent;
- each direct mutating tool fails before driver/backend execution when the variable is absent;
- mutating `quailbot_plan_and_execute` plans fail during preflight with `steps: []` when the variable is absent;
- mutating tools run when the variable is set to `1`.

### Workspace handling

Pass if:

- `.quailbot-pi/` remains ignored;
- active local workspace can point to `D:\quailbot\workspaces\workspace.json` or another user-selected file;
- no tracked Nanonis-specific import script is added;
- workspace doctor/checking, if added, remains generic.

### Golden RPC

Pass if:

- the RPC bridge starts a real Pi agent with the local dev release loaded;
- the individual-tools run completes the ramp task without `quailbot_plan_and_execute`;
- the plan-and-execute run completes the same task with `quailbot_plan_and_execute`;
- both artifacts preserve enough evidence to audit tool selection, ramp arguments, driver results, and readbacks;
- the run is against simulator/local workspace state, with no product-level Nanonis constants.

## Risks and trade-offs

- `npm run pi` rebuilds before launch, which adds startup time but prevents stale dev release adoption.
- Pointing Pi at `dist/src/extension.js` exercises release output, but TypeScript source edits require rebuild. This is intentional for the dev-release workflow.
- The first golden task is Nanonis-specific as local artifact data, but the product path stays contract-driven and instrument agnostic.
- The mutation guard may interrupt existing tests unless tests explicitly set the policy for mutating paths or assert blocked behavior.
