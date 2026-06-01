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
