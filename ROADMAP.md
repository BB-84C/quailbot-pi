# Quailbot Pi Roadmap

Date: 2026-06-01

## This round delivered

- Settled the successor architecture: the GitHub remote should contain only the Quailbot Pi plugin product.
- Clarified that OpenCode RPC bridge, Pi runner, task packets, bridge jobs, and dummy cryo driver are internal construction scaffolding under `.opencode/artifacts/...`.
- Corrected the tool model: fixed tools live in `src/tools/`; workspace data is injected into Pi context and used for validation/execution, not for generating tools.
- Corrected CLI driver ownership: tools must be driver-agnostic; `cli_name` comes from workspace/tool arguments.
- Corrected `quailbot_plan_and_execute`: one blocking tool call executes a concrete serial program and returns one final result containing per-step primary results and linked observations.

## Now known

- Legacy Quailbot stores tools as fixed handlers under `src/quailbot/tools/` and registers them centrally.
- Legacy workspace flow loads real workspace JSON files, remembers the last workspace, and injects a workspace summary into prompt/context.
- Legacy linked-observable readback is separate from primary tool results: after mutating actions, workspace-defined linked observables are resolved, read, and injected as observations.
- `nqctl` is a real CLI driver name supplied by workspace data, not product code to hardcode.
- The cryo stage driver is the only mock driver currently needed, and it belongs in internal scaffold for construction/testing.

## What later phases must do differently

- Keep product code and construction scaffolding physically separate. Product code goes in package-style `src/`; construction control-plane code stays under `.opencode/artifacts/...`.
- Do not introduce `fixtures/workspaces/`; all workspace files used in tests or construction must go through the real workspace resolver.
- Prioritize semantic proof of `action -> linked observable readback -> observation -> next context/tool result` before broad migration.
- Add bridge-driven semantic E2E tests as the completion gate for the migrated protocol. Unit tests are support signals; E2E tests must run the real Pi extension in a real Pi session and inspect preserved artifacts.
- Add a future experiment log subsystem for real instrument runs. It should record experiment id, workspace path/hash, actions, primary results, linked observations, timestamps, driver payloads, and abort/failure records. It is separate from Pi session history and separate from OpenCode construction artifacts.

## Deferred items

- Experiment log design and implementation.
- `wait_until`, calibration UI, and legacy `finish`/`fail` tools, unless later explicitly scoped.
- Packaging/distribution decision for the Pi plugin after the local extension implementation proves the protocol.

## Implementation round: Quailbot Pi plugin core

Date: 2026-06-01

### Delivered

- Product code now lives under package-style `src/`; OpenCode/Pi RPC scaffold, task packets, dummy drivers, generated semantic artifacts, and session snapshots remain local under `.opencode/artifacts/...`.
- Fixed Quailbot tools are registered from `src/tools/`, including CLI tools, GUI boundary tools, `quailbot_planwrite`, and `quailbot_plan_and_execute`.
- Workspace data is loaded through the real resolver, remembered through project-local workspace state, and injected into Pi context through the extension's `before_agent_start` hook.
- CLI tools dispatch through driver-agnostic `cli_name` values supplied by workspace/tool arguments.
- Linked-observable readback is returned separately from primary tool results after mutating CLI operations and inside plan execution steps.
- `quailbot_plan_and_execute` validates the full serial program before side effects, distinguishes `validation_failed` from `step_failed`, supports CLI/GUI/sleep step kinds, and returns one final ordered step list.
- Semantic E2E artifacts now exercise the extension through a real Pi SDK `AgentSession`/`ExtensionRunner`, preserve session/provenance evidence, prove non-`nqctl` driver dispatch, and prove blocked plans fail before driver execution.

### Now known

- The semantic E2E evidence source for this round is `.opencode/artifacts/quailbot-pi-e2e/*.json`, plus the copied local session snapshots referenced by each artifact.
- `npm run test:e2e` validates the preserved local artifacts; it does not regenerate them from scratch. Before any completion or handoff claim, inspect or regenerate those artifacts with the construction generator.
- The plugin is driver-agnostic at the product layer: dummy/non-`nqctl` dispatch works through the same CLI adapter and workspace resolver path as `nqctl`.
- Plan preflight must stay pure across all side-effect channels. CLI validation uses an inert runner with shared timeout validation; GUI validation uses pure validators rather than production GUI execution.

### Later phases must do differently

- Keep experiment logging separate from Pi session history and OpenCode construction artifacts.
- Keep GUI backend expansion behind the existing `observe`, `click_anchor`, and `set_field` boundaries; extend validators first, then attach real backends.
- If semantic E2E needs to become CI-reproducible, promote a generator/bridge entry point into tracked test tooling or add an explicit pre-test generation step instead of relying on ignored local artifacts.
- Preserve the product/scaffold boundary: do not commit `.opencode/artifacts/...`, generated session snapshots, or dummy driver files to the plugin package.

## Implementation round: Local dev release and golden RPC workflow

Date: 2026-06-02

### Delivered

- Repo-local Pi package dev release now uses the package manifest entry `./dist/src/extension.js`, tracked `.pi/settings.json`, and `npm run dev:check` to verify the built extension is adopted.
- Generic mutation policy is surfaced in Quailbot context and enforced before direct mutating CLI/GUI tools and before planned mutating steps in `quailbot_plan_and_execute`.
- Deterministic dev-release adoption coverage imports the built extension, verifies registered tools/hooks, and exercises hidden workspace context without touching repo-local `.quailbot-pi` state.
- Golden Nanonis Simulator RPC artifacts are preserved locally under `.opencode/artifacts/nanonis-simulator-golden/20260602-173257/`; the bridge runner remains ignored construction-only scaffolding, not product CI.

### Now known

- Pi loaded the local dev release from `dist/src/extension.js` through the package manifest and repo-local `.pi/settings.json` package discovery.
- Pi RPC works with `node node_modules/@earendil-works/pi-coding-agent/dist/cli.js --mode rpc --session-dir D:\quailbot-pi\.pi-state\sessions`, with repo-local session files and empty tracked git diffs for the golden runs.
- Mutation-enabled golden runs used `D:\quailbot\workspaces\workspace.json` with workspace SHA-256 `f71800f06590228d59fd14e2160c9ce18258d4fc07a9fbe39e3d510ed23bd74f` and final `nqctl:bias_v` readback `1.0` V.
- The final golden artifacts prove both tool-call shapes: individual `cli_get`/`cli_ramp` calls without `quailbot_plan_and_execute`, and exactly one `quailbot_plan_and_execute` returning an ordered step list.

### Later phases must do differently

- Decide whether the golden RPC runner and shaper should remain ignored construction scaffolding or graduate into tracked test tooling before adding more simulator tasks.
- Preserve trajectory-level semantic assertions for future golden tasks; final-state-only readback is not enough when the intended path matters.
- Keep Nanonis-specific task packets and raw RPC evidence out of product code unless a later phase explicitly scopes simulator CI fixtures.
