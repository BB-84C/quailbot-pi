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

## Implementation round: A1 Quailbot system prompt rewrite

Date: 2026-06-09

### Delivered

- Replaced the default coding-agent identity with a Quailbot system prompt centered on quantum uncertain action-outcome instrument loops.
- Corrected the prompt transport boundary: the system prompt no longer reconstructs `Available tools` or SDK-authored generic guideline sections, because active tools are sent through provider-native tool schemas; Quailbot-owned support-tool boundaries make CLI-driver priority explicit.
- Kept workspace and plan facts in the hidden `quailbot-context` message while the static prompt explains WORKSPACE authority and the action -> measured outcome -> next allowed action loop.
- Added tests proving the rewritten prompt contains Quailbot measurement/readback identity, excludes deprecated/internal wording, ignores unsafe dynamic prompt-construction metadata, and preserves hidden workspace context.

### Now known

- `before_agent_start` can return a full replacement `systemPrompt` and still return the hidden Quailbot context message.
- The prompt can be reconstructed from `BuildSystemPromptOptions` without parsing or appending the assembled base prompt.
- A1 must treat uncertainty primarily as measurement/action-outcome uncertainty: AWG pulses, STM tip pulses, and other interventions need follow-up measurement/readback to determine what actually happened. Transient instrument trouble is a secondary recovery case.
- `BuildSystemPromptOptions` fields such as `toolSnippets` and `promptGuidelines` are construction metadata only. They should not be rendered into Quailbot's runtime system prompt; `selectedTools` is only an availability gate for Quailbot-owned support-tool bullets. Active tool schemas and hidden `quailbot-context` are the live model-visible dynamic channels.

### Later phases must do differently

- Future prompt/context work must avoid leaking Pi, coding-agent identity, qspmbot memory/soul/workspace scope, or internal engineering decisions into the runtime Quailbot identity.
- If project context files or skills need to re-enter the rewritten prompt later, they need an explicit neutralization contract first.
- A2 and later instrument-operation phases should use the prompt's action -> measured outcome -> next allowed action loop as the behavioral baseline.

## Implementation round: A2 workspace control-plane substrate

Date: 2026-06-11

### Delivered

- Added a transport-neutral workspace service for validation, selection, readback summary, SHA-256 revision metadata, and atomic candidate writes.
- Added the `/quailbot-workspace` Pi command adapter for show/read, validate, load, and write operations.
- Kept local activation reload-driven: workspace selection persists to settings and then requests Pi reload so `session_start` and hidden `quailbot-context` refresh from the selected workspace.
- Added service and built-extension tests proving invalid candidates do not replace the selected workspace, command-driven selection refreshes hidden workspace context, active show/read preserves the selected source/hash, reload failures do not report false activation success, and workspace writes return before/after hash readback.

### Now known

- Workspace selection can be represented as a reusable control-plane service instead of a TUI-only picker.
- Pi command handlers can call `ctx.reload()`, while tool handlers cannot; reload-triggering workspace activation belongs in the command adapter.
- Workspace revision metadata can be computed from workspace file bytes and carried forward into A4 job-binding design.
- Runtime must keep the loaded workspace metadata as well as the parsed workspace object; otherwise command readback can lose whether the active workspace came from settings, starter state, or an explicit candidate.
- The A2 write service is intentionally path-policy neutral for local operator commands. Remote exposure must add an approved-destination/auth policy around it rather than reusing the raw write primitive directly.

### Later phases must do differently

- A3 calibration/editing must call the A2 workspace service rather than writing its own workspace activation path.
- A4 remote host must reuse the A2 validation/hash/activation semantics and add host-side approved-destination policy, auth, job queue, cancellation, supervisor policy, and durable experiment evidence around them.
- A2A remains deferred as a possible peer-agent facade; it is not the core host/workspace API.

## Implementation round: A3 browser workspace calibrator responsive shell

Date: 2026-06-14

### Delivered

- Expanded the browser workspace calibrator client from a summary placeholder into a responsive three-panel editor with a full workspace tree, real PNG capture-image canvas substrate, ROI/anchor geometry editing, add-group/add-ROI/add-anchor actions, group collapse/expand controls, validate/save/request-activation controls, and a CLI import conflict table.
- Kept the browser layout viewport-bound with hidden outer overflow and internally scrolling panels/bounded regions, so the UI tracks the window instead of relying on fixed outer pixel boxes.
- Extended `GET /api/workspace` to return canonical editable workspace JSON alongside the existing active-workspace summary so the browser editor can load the real draft substrate instead of reconstructing it from summary-only metadata.
- Added layout/server tests proving the responsive CSS contract and the browser-control surface, plus server coverage for editable workspace JSON readback.

### Now known

- The A3 browser shell can stay dependency-light for now by serving raw module strings and canonical JSON through the existing local workspace UI server; it does not need a bundler or a separate frontend build step for this slice.
- Returning canonicalized workspace JSON from the server avoids the stale-`GUI` shadow-data problem that would otherwise make browser edits validate against old visual arrays.
- The existing A2 write/validate/request-activation routes are sufficient for the first browser editing loop once the client keeps its own draft state and target path/hash bookkeeping.

### Later phases must do differently

- Keep semantic browser acceptance image-backed: exercise the rendered client in a DOM/browser harness and prove ROI/anchor placement against an actual `.quailbot-pi/workspace-capture.png` image bbox and pixel samples, not against DOM/SVG target constants.
- If the browser editor grows more interaction-heavy, consider extracting shared draft/canonicalization logic into a frontend-safe seam instead of maintaining parallel helper logic inside the raw client string.
- Keep host-side authorization/path policy in the server/control-plane layer; the browser client should remain a thin editor over the existing A2 substrate rather than inventing a second activation/write contract.

## Implementation round: A3 web workspace calibrator

Date: 2026-06-14

### Delivered

- Added the browser calibrator launched from Pi through `/quailbot-workspace open`, with localhost/token guarding, pending activation staging, and shutdown cleanup.
- Added a full workspace tree editing surface for groups, ROIs, anchors, CLI parameters, and CLI actions, plus group collapse/expand, real capture-image-backed ROI/anchor geometry editing, and save/request-activation controls.
- Added CLI capability import and conflict handling so non-`nqctl` payloads merge into workspace JSON with imported entries disabled by default.
- Tightened CLI import so the browser route only probes CLI names already declared by the draft workspace; arbitrary command names are rejected before subprocess discovery.
- Hardened browser write/request-activation targets so the UI can only write the active workspace or `.quailbot-pi` state paths, rejects symlink/junction escapes, stores pending activation as an absolute authorized path, and avoids browser-blocked localhost ports.
- Kept validation, atomic write/readback, selected-workspace persistence, and reload-mediated activation under the A2 workspace service and Pi command path.

### Now known

- Browser UI is the right A3 helper shape compared with Tk because it stays inside the Pi workflow now and can later support A4 host/client preview and workspace editing.
- `ctx.reload()` remains command-bound; the web UI can stage pending activation but cannot independently refresh Quailbot hidden context.
- The earlier fixture-target acceptance was a false-positive pattern: hardcoded SVG target DOM nodes can only prove the page writes the same constants twice. A3 visual acceptance now requires an actual PNG capture substrate, overlay-to-image bbox deltas, pixel samples, and absence of `[data-fixture-target]` nodes.
- SVG letterboxing can offset saved click coordinates if browser client coordinates are mapped through the full SVG box; click acceptance now maps through the rendered PNG viewport and preserves `click-coordinate-evidence.json` as proof.
- `D:\quailbot\workspaces\workspace.json` uses root keys `anchors`, `cli_params`, `groups`, `rois`, and `tools`; the previous tiny `fixturectl` workspace was not representative because it omitted `tools` and rich CLI metadata. The web draft path preserves unknown root fields when present, but future acceptance should model the real-shaped workspace.
- Handler-level `activation-proof/*.json` artifacts prove browser write, pending activation, command activation, settings persistence, and hidden `WORKSPACE` refresh, but they remain support evidence; visible Pi TUI acceptance still requires a real terminal run when this spec is used as the final operator gate.

### Later phases must do differently

- A4 must add auth, approved destination policy, host lifecycle, job supervision, cancellation, and durable experiment evidence around the A2/A3 workspace substrate rather than exposing the raw local write server remotely.
- Live capture should enter through `CaptureFrame` metadata so browser display coordinates remain separate from saved image/instrument coordinates.
- Experiment logs remain outside A3; they should record workspace path/hash, actions, linked-observable readback, driver payloads, and failure/abort records in a later phase.

## Implementation round: A3 Tk parity and real-substrate browser acceptance

Date: 2026-06-15

### Delivered

- Reworked the browser calibrator toward legacy Tk behavior for grouped workspace editing: child groups, grouped ROIs/anchors/CLI entries, active-state cascade, metadata/group/link editing, deletion cleanup, and double-click group collapse/expand.
- Added Tk-compatible serialization details: nested groups use `group`, anchors preserve both `linked_ROIs` and `linked_observables`, active anchors force linked ROIs active, and CLI `count` fields refresh from item lengths.
- Hardened browser save/activation UX with clean-hash-gated Request Activation, health/disconnect guidance, positive ROI geometry validation, real workspace schema compatibility checks, and passive capture/canvas layers so draw/pick events route to the SVG canvas.
- Added real-workspace CLI compatibility for legacy `tools.cli`, dict/list-shaped `cli_params`, nested action entries, source-specific enabled defaults, and browser editing of workspace CLI name/enabled state.
- Added Tk-style Add ROI/Add Anchor defaults: zero/default draft items are selected first, draw/pick modes require the correct selected item, and zero ROI dimensions are rejected by validation until the selected ROI is drawn.
- Persisted capture-frame virtual-screen origin metadata beside `workspace-capture.png` so a refresh with non-zero monitor origin survives later `/api/workspace` reloads.
- Preserved current real browser evidence using a real workspace capture under `.opencode/artifacts/a3-real-desktop-acceptance/20260614-2340/`, including schema counts from the authoritative workspace, screenshot refresh, group collapse, zero-default validation, ROI drag preview, anchor pick/link, CLI name/enabled edit, save/readback, pending activation, and hidden `WORKSPACE` activation proof.

### Now known

- The authoritative `D:/quailbot/workspaces/workspace.json` may contain empty visual arrays while still carrying large CLI sections and `tools`; schema compatibility must check the rich CLI/tool shape, not require pre-existing ROIs/anchors.
- Tk uses `linked_observables` as the primary anchor link field and `linked_ROIs` as a compatibility fallback; web edits should write both to avoid drift.
- Browser-level visible acceptance proves image-local overlay fidelity; the reload into current hidden `WORKSPACE` context remains command-mediated and is proven by the `dev-release-adoption` e2e activation test rather than by the browser alone.
- The real workspace currently exercises 328 CLI parameters, 117 CLI actions, `tools.cli`, and `tools.nqctl`; compatibility tests must keep using this rich shape instead of tiny `fixturectl` substitutes when claiming real-schema parity.
- Capture-frame origin is a two-step contract: the live screenshot refresh returns `originX/originY`, and the browser/server reload path must read the persisted sidecar metadata instead of silently reverting to `0/0`.

### Later phases must do differently

- Current browser evidence was captured on a zero-origin monitor, while tests cover non-zero-origin persistence. Do not claim physical multi-monitor visual acceptance until a real non-zero-origin capture is available.
- Replace more raw-string contract tests with DOM-level behavior tests if the client grows further; the duplicate double-click path showed that string checks alone can miss event-order bugs.
- Keep `.opencode/artifacts/...` as the evidence home for real browser captures and do not promote runtime workspace screenshots or browser-generated scratch into product code.

## Future investigation phases: Quailbot behavior still missing from Pi

Date: 2026-06-03

Status: planning guide only. These phases are not implemented yet; each needs a full implementation spec when work begins. The investigation below was re-grounded from source files, not from the previous compacted roadmap draft.

### Phase A1: Quailbot instrument-operator system prompt [DONE]

**Status:** Done. Implemented, verified, merged to `main`, and pushed 2026-06-11. The earlier hybrid-append recommendation is superseded.

**Concise spec:** Replace the default coding-agent system prompt with a Quailbot prompt that does not mention Pi or internal engineering decisions. Quailbot identifies as a quantum uncertain action-outcome instrument loop agent: actions are interventions, outcomes are established through measurement/readback, and the next action follows from that observed outcome. Keep workspace facts in the existing hidden `WORKSPACE` context block; do not reconstruct available-tool or SDK-authored generic guideline sections in the system prompt because the real tool surface is sent through provider-native tool schemas. Quailbot-owned support-tool boundaries may describe read/write/edit/bash as local support tools while keeping CLI-driver tools primary for instrument operations.

**Feasibility:** High. Pi's `before_agent_start` event exposes the assembled `systemPrompt` and can return a replacement `systemPrompt`; current Quailbot Pi only returns a hidden `quailbot-context` message from `src/extension.ts`. This is a plugin-level change.

**Options / trade-offs:**

- Full rewrite with prompt/tool transport separation: implemented; strongest identity shift while leaving tool discovery to provider-native schemas and workspace facts to hidden context.
- Append/hybrid overlay: rejected; it preserves the old coding-agent identity and internal substrate wording.
- Copy qspmbot/qdevbot full prompt system: rejected; its memory/soul/workspace/subagent/MCP scope is broader than Quailbot Pi's extension scope.

**Implemented default:** Full rewrite. Do not copy legacy tool inventories into the prompt; use tool schemas and the hidden `WORKSPACE` block as the live capability authorities.

### Phase A2: Workspace control-plane substrate and Pi command adapter

**Concise spec:** Build a transport-neutral workspace control-plane substrate first, then expose it through Pi-native commands. The substrate owns workspace selection, validation, read/show summaries, supported atomic writes, persistence, workspace hash/revision metadata, and reload handoff semantics. Pi slash commands and any later TUI picker are adapters over this substrate, not the source of workspace truth. After a local switch, persist the selected workspace and run Pi reload so `session_start` reloads the workspace from settings.

**Feasibility:** High. Current `src/workspace/workspace-state.ts` already has settings/starter resolution and save/load helpers; `src/workspace/load-workspace.ts` already provides the real workspace loader; `src/extension.ts` already loads the workspace on `session_start`. Pi exposes `registerCommand(...)` and command-context `ctx.reload()`. The missing seam is a small reusable workspace service that Pi commands, future TUI picker/editing, and later remote host code can all call.

**Options / trade-offs:**

- Transport-neutral workspace service plus Pi command adapter: recommended. Slightly more design than inline commands, but prevents A4 remote host from reimplementing workspace semantics later.
- Inline Pi slash commands only: fastest local A2, but too TUI/session-local and likely to create a second workspace contract for A4.
- In-memory hot switch without reload: faster, but easier to leave stale plan/context/tool state unless every runtime field is reset correctly.
- TUI picker/list command: useful UX adapter; needs a fallback for RPC/remote mode and should come after the service/command substrate.
- A2A-first remote workspace protocol: deferred. A2A is a possible later agent-to-agent facade, but the current core need is host-owned workspace/job control with explicit authorization, revisions, and durable evidence.

**Recommended default:** Build A2 as a workspace control-plane service with Pi commands as the first adapter: validate/load/show/select/write supported updates, persist selection, compute workspace hash/revision, and hard-reload after local switches. Add picker/watch behavior after the service is semantically proven. Let A4 reuse the service from a separate supervised host rather than putting the remote protocol inside the Pi extension.

### Phase A3: Workspace edit/calibration UI

**Concise spec:** Bring the legacy calibration tool's behavior into the Pi workflow so users can create/import/edit workspace files without leaving Pi if feasible. Required behavior includes ROI/anchor editing, CLI capability import, load/export workspace, set current agent workspace, validation, and save. Coordinate with A2 so edits update the same selected workspace and trigger the same reload path.

**Feasibility:** Medium. Legacy `D:\quailbot\src\quailbot\calibration\gui.py` is a large standalone Tk/Python tool with its own load/export/set-agent-workspace/save logic. Pi has TUI custom components and commands, but pixel-oriented ROI/anchor drawing may be awkward inside the terminal. External GUI launch is already a proven legacy pattern.

**Options / trade-offs:**

- Native Pi TUI calibration commands/forms: best integrated workflow; likely good for JSON fields and CLI import, uncertain for screenshot/ROI drawing.
- Direct external GUI import/launch: fastest way to preserve the existing visual calibration behavior; adds Python/Tk/Pillow runtime and a separate window.
- Split approach: implement file selection, CLI import, validation, and save in Pi TUI; keep visual screenshot ROI/anchor picking as an external GUI helper.

**Recommended default:** Probe the split approach. Use A2 as the state/reload contract so either TUI edits or external GUI writes converge on the same workspace selection path.

### Phase A4: Remote instrument host, client, and MCP surface

**Concise spec:** Rebuild the remote operation model around Pi: a human supervisor launches a host on the instrument server; the host connects to one or more instruments; remote users submit jobs/tasks from their laptops through a client; that client also exposes MCP so a user's agent can submit/status/cancel/fetch jobs through MCP.

**Feasibility:** Medium. Legacy Quailbot has FastAPI host routes, a job manager, HTTP client, and FastMCP hub tools. Pi provides useful agent infrastructure through RPC mode and `AgentSession` SDK, but Pi explicitly does not include built-in MCP and does not provide a ready-made multi-user HTTP job server. This should be built on top of Pi, not embedded blindly into the extension.

**Options / trade-offs:**

- Separate supervised host service using Pi SDK or Pi RPC sessions per job: best long-term seam; clear host/client boundary; requires queueing, auth, cancellation, logs, and multi-instrument routing.
- Adapt legacy FastAPI host + HTTP client + FastMCP hub around Pi RPC: fastest behavior transplant; carries Python service dependencies and legacy route assumptions.
- New TypeScript/Node host around Pi SDK: closer to the Pi package ecosystem; more rewrite cost.
- HTTP server inside the Pi extension: avoid unless SDK constraints force it; it couples session UI/plugin code to long-lived job serving.

**Recommended default:** Design a separate host/supervisor service first, with the MCP client as a downstream wrapper over the host API. Reuse A2's workspace control-plane substrate for host-side workspace validation/revision/activation instead of inventing a second remote workspace contract. Treat A2A as an optional future facade only when Quailbot needs peer agent-to-agent delegation; do not use A2A as the core host API now. Treat legacy server-host-hub-client-MCP as behavior evidence, not code to paste wholesale.

### Phase A5: Pi TUI tool-result rendering/truncation

**Concise spec:** Stop large Quailbot tool results from flooding the Pi TUI. Render concise previews for tool calls/results, keep full structured evidence available through `details` or local artifacts, and make truncation explicit. The goal is TUI readability first; context-size reduction is a separate choice if we also truncate tool-result `content` sent back to the model.

**Feasibility:** High for Quailbot-owned tools, medium for global Pi behavior. Current `src/tools/register-tools.ts` serializes the full `QuailbotToolResult` into `content[0].text`; Pi custom tools support `renderCall` and `renderResult`, and the `tool_result` event can modify returned content/details. OpenCode's bash/tool-output precedent uses line/byte caps, writes full output to disk, and returns a preview plus recovery hint.

**Options / trade-offs:**

- Display-only `renderResult` for Quailbot tools: best for TUI readability; does not reduce model context payload.
- Content-level truncation service for Quailbot tool results: reduces TUI and model context pressure; must preserve full output in `details` or artifacts with a recovery path.
- Pi core rendering/truncation patch: only needed for built-in/global tool rendering or if plugin renderers cannot cover the desired surface.

**Recommended default:** First implement a Quailbot-owned truncation/preview service and per-tool renderers. Escalate to Pi core only if built-in rendering remains the blocker.

### Phase A6: Context usage by component and hierarchy

**Concise spec:** Add a context usage view that shows both aggregate usage and a component hierarchy for diagnosing prompt/cache pressure. It should resemble the Claude Code `/context` view in the screenshot: total tokens/free space, high-level buckets, and drill-down for Quailbot-introduced components such as operator system-prompt append, workspace summary, plan context, last action observation, and tool-result payloads.

**Feasibility:** Medium. Pi exposes aggregate `getContextUsage()` and RPC `get_session_stats`, but the SDK surface currently reports tokens/window/percent rather than a full system/tools/skills/messages hierarchy. Quailbot can measure its own generated strings and emitted tool-result payloads; exact global attribution likely needs Pi core instrumentation.

**Options / trade-offs:**

- Plugin-estimated Quailbot hierarchy: feasible now; labels estimates honestly; cannot explain Pi-owned buckets exactly.
- Hybrid view: exact Pi aggregate plus estimated Quailbot subcomponents inside the messages/context the plugin owns; best near-term diagnostic value.
- Pi core component accounting: most accurate and closest to the screenshot; highest scope because it requires core message/system/tool accounting support.

**Recommended default:** Start hybrid. Show Quailbot-owned component estimates clearly, and reserve Pi core work for exact system/tool/skills/message hierarchy.

### Sequencing notes

- A1 should land first so later behavior runs under the right instrument-operator identity.
- A2 should land before A3 because calibration/editing must share one workspace selection, validation, write, revision, and reload contract.
- A4 is a separate architecture phase after local plugin workflow is stable, but A2 must be designed as the substrate A4 will reuse for workspace validation and activation.
- A5 and A6 are operability phases and can run once real sessions produce enough tool/context volume to justify them.
- Every future implementation phase still needs semantic Pi-session acceptance; the ROADMAP is only a guide, not the detailed spec.
