# Quailbot Knowledge System — Semantic E2E Acceptance Spec

- Status: Draft
- Date: 2026-06-18
- Subject: Semantic end-to-end acceptance for the knowledge system (skills + memory + self-rendered prefix), on branch `feat/quailbot-knowledge-system`.
- Feature spec: `docs/superpowers/specs/2026-06-18-quailbot-skill-memory-design.md`.

## 1. Why this exists

The 343 unit tests are **support signals, not proof**. They exercise functions in isolation with mocks. Semantic acceptance requires running the **real production scenarios through the real built extension** (`dist/src/extension.js`) on the **real Pi SDK agent session**, inspecting **real readback** (the actual assembled system prompt the model would receive, the actual tool results, the actual persisted files, behavior across a real reload), and covering **negative cases**. The interactive toggle menu must be exercised on the **real Pi TUI** (per the project's Real-TUI-Acceptance rule), not shell-simulated.

## 2. Substrate (extend, do not reinvent)

The project already has a real-Pi-SDK semantic-E2E harness:
- `.opencode/artifacts/quailbot-pi-e2e/generate-semantic-e2e.mjs` (untracked construction scaffolding) builds a scaffold cwd with `.quailbot-pi/workspace.json` + a real dummy CLI driver, creates a **real** `createAgentSession({ extensionFactories: [quailbotExtension] })`, binds extensions, and exposes `emitBeforeAgentStart(task)` and `callTool(name, params)` that hit the **real registered tools**. It captures events/responses/messages/toolResults/contextSnapshots/evidence and writes `<scenario>.json` with `provenance.runtimeMode: "pi-sdk-agent-session"`, `externalLlm: false`.
- Tracked `tests/e2e/semantic-e2e.test.ts` reads those artifacts and asserts semantic pass via `expectSemanticPass`. Shared contract in `tests/e2e/e2e-artifacts.ts`.

This spec adds knowledge scenarios to the runner and a parallel tracked assertion test.

## 3. Three mechanics

1. **Knowledge prefix is in `result.systemPrompt`**, not the tail `quailbot-context` message. Assert on `contextSnapshots[].result.systemPrompt` (the real assembled prompt), not on `messages` (which is the workspace/plan tail block).
2. **"Does the model see the skill body?"** rides the `pi.on("context")` projection. Add an `emitContext(messages)` helper to the harness that invokes the runtime's registered context handler and captures the **model-visible** projected tool-result text. (If the runner exposes no direct context-emit, invoke the registered `context` handler with a synthetic message array carrying the tool-result `details`.)
3. **The `/quailbot-memory` `SettingsList` toggle menu** (`ctx.ui.custom`) cannot run headless → Layer 3 real-TUI acceptance. String subcommands (`list`/`load`/`unload`) and `/quailbot-skills window` ARE coverable headless via a command-context stub.

## 4. Layer 1 — harness scenarios (real Pi SDK; artifact-backed)

Each scenario seeds a real `.quailbot-pi/{skills,memory}` + workspace, drives the real session, and writes `<scenario>.json` with named assertions. Assertion names are the contract between the runner and the tracked test.

| # | Scenario id | Setup | Real action | Assertion names (PASS) |
|---|---|---|---|---|
| K1 | `skill-catalog-ok` | ws enables `nqctl`; `skills/change-tip` `drivers:[nqctl]` | `emitBeforeAgentStart` | `catalog-ok-rendered` (systemPrompt has `QUAILBOT SKILLS` + `change-tip … [drivers: nqctl OK]`) |
| K2 | `skill-load-body` | K1 setup | `callTool(quailbot_skill,{name:change-tip})` → `emitContext` | `skill-body-visible-to-model` (projected text has the body inside `<skill_content>`), `no-warning-when-present` |
| K3 | `skill-gate-missing` | ws cliName=`othertool` (no nqctl); `skills/change-tip drivers:[nqctl]` | emitBAS; `callTool(quailbot_skill)`; `callTool(cli_get,{cli_name:nqctl,parameter:zctrl_setpnt})` | `catalog-missing-rendered`, `warning-verbatim` (result warning == fixed text), `cli-execution-blocked` (cli_get ok:false / validation rejection), `driver-not-invoked` (driver log empty) |
| K4 | `memory-load-unload` | `memory/tip-conditioning.md` with one topic | emitBAS → `quailbot_memory_load` → emitBAS → `quailbot_memory_unload` → emitBAS | `unloaded-body-absent`, `loaded-body-rendered` (systemPrompt has `### memory: tip-conditioning` + body), `unload-removes-body`, `loaded-set-persisted` (knowledge-state.json) |
| K5 | `memory-consolidation` | empty memory | save(topic,v1); save(topic,v2,no hash); `quailbot_memory_search`; save(topic,v2,hash) | `nohash-rejected` (status `missing_hash`), `search-exposes-hash` (search match has a `hash`), `consolidated-single-section` (file has exactly one `## topic`, body=v2) |
| K6 | `skill-write-propagation` | ws nqctl | emitBAS (absent) → `quailbot_skill_write(new-skill)` → emitBAS | `new-skill-absent-before`, `new-skill-present-after-no-reload` (catalog includes it next turn, no reload), `skill-file-on-disk` |
| K7 | `reload-persistence` | harness A: `quailbot_memory_load(d)` + `/quailbot-skills window 5` | fresh harness B on the SAME cwd (re-factory + session_start) → emitBAS | `loaded-domain-survives-reload`, `window-survives-reload`, `domain-rendered-post-reload` |
| K8 | `cache-byte-stability` | ws nqctl + a skill | emitBAS ×2 (no change); `quailbot_memory_load`; emitBAS | `prompt-stable-across-nochange` (hash equal), `prompt-changes-once-after-load` |
| K9 | `projection-window` | `/quailbot-skills window 2`; skills A,B,C | `callTool(quailbot_skill)` ×3 → `emitContext` | `newest-n-full` (B,C full), `older-stub` (A is the re-invoke stub, body absent) |
| K10 | `fail-soft` | `.quailbot-pi/skills` created as a FILE | emitBAS | `before-agent-start-no-throw`, `empty-catalog-on-bad-skills-dir` |

Optional K11 `agents-constitution`: deployed `AGENTS.md` present → systemPrompt has `QUAILBOT AGENTS GUIDANCE` + content; edit the file → next emitBAS reflects it (self-read, no reload).

**Harness additions required:**
- Scaffold seeding for `skills/<name>/SKILL.md`, `memory/<domain>.md`, deployed `AGENTS.md`, and a pre-seeded `knowledge-state.json`.
- A missing-driver workspace variant (workspace cliName ≠ the skill's required driver, or driver disabled).
- `emitContext(messages)` helper (mechanic #2).
- A `{ reuse: true }` option on the scaffold builder so K7 can re-instantiate a session over the same cwd without wiping it.

## 5. Layer 2 — tracked assertion test

`tests/e2e/knowledge-semantic-e2e.test.ts`:
- a `requiredScenarios` list (K1–K10 ids) with a naming test;
- for each scenario, read `<id>.json`, assert `provenance.runtimeMode === "pi-sdk-agent-session"` and `externalLlm === false`, and `expectSemanticPass(artifact, <assertion-name>)` for every assertion above;
- additional `expect(...).toContain(...)` spot-checks on the captured `systemPrompt`/projected text for the load-bearing strings (verbatim warning, `[drivers: nqctl OK/MISSING]`, `### memory: <domain>`).
Runs inside `npm test` (vitest `tests/**/*.test.ts`).

## 6. Layer 3 — real Pi TUI acceptance (Windows MCP)

- **T1 (menu):** launch a real Pi session with the extension + a workspace + ≥2 memory domains; run `/quailbot-memory` (no args) → the `SettingsList` toggle menu renders; arrow/toggle a domain to "loaded"; confirm → next turn renders that domain's memory. Readback: screenshot + `knowledge-state.json` diff. Only the interactive menu needs this; the string subcommands are covered in Layer 1.
- **T2 (optional, fullest loop):** a real Pi session with a live model where the agent loads a skill and the body demonstrably enters its context. Manual smoke (needs an external LLM); not gating.

## 7. What counts as PASS / FAIL

- PASS = every named assertion true AND the readback strings present in the real `systemPrompt`/projected text/persisted files, with `provenance.runtimeMode: "pi-sdk-agent-session"`.
- The negative scenarios (K3 `cli-execution-blocked`/`driver-not-invoked`, K5 `nohash-rejected`, K10 no-throw) are first-class — a green happy path without them is not acceptance.
- After Layer 1+2 are green, an **@oracle reviewer** judges the preserved artifacts for *semantic* acceptance (do the readbacks mean what we claim — not just that assertions are green), per `10-semantic-proof-and-acceptance-design.md` rule 8.

## 8. Deliverables
1. K1–K10 scenarios added to `generate-semantic-e2e.mjs` (+ helpers).
2. `tests/e2e/knowledge-semantic-e2e.test.ts` (tracked).
3. Generated artifacts under `.opencode/artifacts/quailbot-pi-e2e/` (untracked).
4. `npm run typecheck && npm test && npm run build` green.
5. Oracle semantic-acceptance pass over the artifacts.
6. T1 TUI acceptance executed; screenshot preserved.

## 9. Non-goals
- No external-LLM dependency in the gating suite (T2 is optional manual smoke).
- No new product code (this is acceptance instrumentation; the harness stays untracked scaffolding under `.opencode/artifacts/`).
