
## Product Boundary And Mutation Policy (2026-06-02)
- The tracked GitHub/remote product for `D:/quailbot-pi` should contain only Quailbot Pi plugin product code.
- Internal construction scaffolding such as the RPC bridge, task packets, dummy drivers, import helpers, and other development-only assets live under `.opencode/artifacts/...` and remain untracked.
- Do not track `scripts/run-pi.mjs`, `scripts/import-nanonis-workspace.mjs`, or other task/instrument-specific helper scripts as product code.
- Real imported workspaces may exist locally/gitignored for verification, but product logic must stay workspace/driver/instrument agnostic.
- Mutation gating is domain-generic: the allow/deny control gates mutating tools (`cli_set`, `cli_ramp`, `cli_action`, `click_anchor`, `set_field`) rather than hardcoding a specific instrument, task, or driver name.
- Tools are fixed product surface under `src/tools/`; workspace data informs prompt/runtime contracts and driver/parameter selection, but does not generate tool names.
- Linked-observable forced readback is separate from ordinary tool results: after mutating actions, resolve workspace-declared linked observables, perform readback, and inject/return those observations separately.
- `quailbot_planwrite` and `quailbot_plan_and_execute` are product tools under `src/tools/`; `quailbot_plan_and_execute` runs programmatically and sequentially after submission, performs per-step linked-observable readback for mutating steps, and returns one final ordered tool result.

## A1 System Prompt Recon (2026-06-08)
- Start A1 from `ROADMAP`.
- Before changing the quailbot-pi system prompt, inspect three sources: the current quailbot-pi prompt seam, the original `D:/quailbot` prompt, and `D:/qdevbot`'s approach.
- Borrow mindset and structure selectively, but do not copy qdevbot or qspmbot scope assumptions about memory, soul, or workspace into quailbot-pi.
- A1 is a full Quailbot system-prompt rewrite, not an append/overlay. The prompt should express Quailbot's identity as a quantum uncertain action-outcome instrument loop agent and should not mention Pi or internal engineering decisions.
- Do not reconstruct generated support sections such as `Available tools` or generic coding/file-editing guidelines inside the rewritten prompt; active tools are model-visible through provider-native tool schemas, and dynamic workspace/plan facts belong in hidden Quailbot context. If support-tool guidance is needed, write Quailbot-owned wording that makes CLI-driver priority explicit.
- Use "allowed quantum instrument CLI parameters" wording for WORKSPACE authority. Treat uncertainty as primarily measurement/action-outcome uncertainty: actions such as AWG pulses or STM tip pulses need follow-up measurement/readback to determine what actually happened. Temporary instrument problems are a secondary uncertainty case to diagnose and recover from, not the main Quailbot identity. Omit legacy narration/chain-of-thought constraints.
## A1 Quailbot Prompt Correction
- Latest correction supersedes earlier overlay guidance: A1 is a full Quailbot system-prompt rewrite, not a Pi append or overlay.
- The final runtime prompt must not mention Pi, a general coding-assistant identity, or internal engineering rationale about why the team chose the design.
- The WORKSPACE authority line should say `allowed quantum instrument CLI parameters`.
- Frame uncertainty primarily as measurement and action-outcome uncertainty that requires follow-up measurement/readback; temporary instrument trouble is only one subset of the uncertainty model.
- Do not turn transient instrument problems into an immediate stop rule. Quailbot is expected to work through temporary instrument issues instead of immediately reporting failure.
- Do not reintroduce legacy narration-shortness or hidden-reasoning lines from older Quailbot prompts.
- Do not render `BuildSystemPromptOptions.toolSnippets` or `promptGuidelines` into Quailbot's runtime system prompt; those are construction metadata, not the live tool context. `selectedTools` may be used only as an availability gate for Quailbot-owned guidance, not as wording to copy.
- Once the load-bearing A1 prompt decisions are fixed, continue autonomously without additional approval gates.

## Prompt Transport Boundary (2026-06-11)
- Treat dynamically registered tool schemas as the authoritative tool surface. `systemPromptOptions.selectedTools`, `toolSnippets`, and `promptGuidelines` are construction metadata unless they are explicitly rendered into prompt text.
- Do not reconstruct generic `Available tools` or SDK-authored `Guidelines` sections in the system prompt from those metadata fields. Keep the prompt focused on stable Quailbot identity/policy and Quailbot-owned support-tool boundaries that are not already carried by the real tool schema.

## Quailbot Support-Tool Guidance (2026-06-11)
- Keep provider-native tool schemas as the canonical tool surface. Do not copy raw SDK `Available tools`, `Guidelines`, `toolSnippets`, or `promptGuidelines` text into the runtime system prompt.
- If file/shell guidance is still useful, render a Quailbot-authored support-tool boundary section, gated only by tool availability, and word it so CLI driver / WORKSPACE tools remain primary for instrument operations.

## System Prompt / Tool Context Notes (2026-06-12)
- For quailbot-pi identity shifts, rewrite the system prompt instead of appending a small preface to the old Pi prompt.
- The finished prompt should not frame the agent as "Pi"; `quail` means `quantum uncertain action-outcome instrument loop`.
- Describe uncertainty primarily as measurement/readback uncertainty and experiment confirmation, not only transient instrument faults.
- If tool/guideline context is dynamically injected, keep it authoritative; do not hardcode a generic `Available tools` block when the real tool context already comes from the runtime.
- If custom guidance is still needed, keep CLI driver / quantum instrument tools primary and treat generic `read` / `write` / `edit` / `bash` guidance as secondary and constrained.

## Real TUI Acceptance (2026-06-12)
- For Pi TUI acceptance work, interact with the real TUI surface rather than substituting shell or PowerShell automation.
- On this machine, when the user asks for real TUI interaction, use the opened terminal via Windows MCP snapshot/vision instead of bash-driven simulation.
- If the acceptance path is long or context may compact, land the test spec early under `docs/superpowers/specs/` before running the live interaction.

## A5 Tool Result Rendering (2026-06-15)
- For A5 CLI/tool-result presentation and context-retention design, ground the contract in the actual CLI driver substrate before inventing fields: inspect `D:\quail-cli-core`, `D:\Nanonis-QCodes-Controller` (`nqctl`), and quailbot-pi's current `cli_*` parsing path. Do not assume arbitrary CLI drivers or invent projection fields that the real contract cannot support.
- Map `context[0].text`, renderResult output, and retained `details` only to information that is actually parsed or preserved by current tool results; treat noisy or unparsable raw stdout as bounded diagnostics, not as semantic fields.
- Default `recentFullCliResultCount` to `2`: keep full `details` in model-visible context only for the most recent two `cli_*` tool results; older results should degrade to summary-only context while retaining full local details elsewhere.
- For the current quailbot-pi redesign track, use a subagent-driven feature-branch workflow with best-of-N sampling and frequent small commit/push steps.

## Branch Hygiene (2026-06-16)
- A3-era worktree guidance is obsolete. For ordinary feature work in this repo, use normal local feature branches in the main checkout.
- Reserve local `.worktrees` for best-of-N sampling or explicitly authorized isolation only.
- Do not leave stale milestone-specific guidance in `AGENTS.md`; remove it when it stops being live.

## Context And Diagnostic Notes (2026-06-16)
- Do not force an inaccurate Quailbot-owned context bucket breakdown. Pi already exposes aggregate context pressure in the TUI footer, and provider-specific tokenizer/accounting limits make a full per-bucket breakdown false precision unless the data is exact or clearly labeled as an estimate.
- If any `/quailbot-context`-style surface is kept, default it to read-only and non-model-visible.
- Advisory diagnostics on these surfaces should be warnings only; they must not block tool execution.

## Dreaming Updates (2026-06-16)
- In best-of-N review/judge prompts, bind stable candidate labels (`A/B/C/...`) and explicitly tell reviewers to ignore directory, branch, and worktree names. Per-judge path permutations are acceptable only if the candidate labels stay stable.
- For multi-task feature branches, per-task spec/code-quality approvals are not enough by themselves. Before handoff, run one final whole-branch review focused on cross-task integration coherence, fail-soft warning paths, lifecycle reload/close semantics, and schema stability.

## Dreaming Updates (2026-06-18)
- For the quailbot-pi memory system, default to domain-organized memory rather than date-organized memory unless the user explicitly changes that direction.
- Split reusable know-how into `skills` and context-specific tuning into `memory`: general operational concepts/methods belong in skills, while scenario-specific parameters and empirical effectiveness notes belong in memory.
- Skills in this repo should register against workspace CLI driver names. A skill may require multiple CLI drivers.
- If the current workspace does not provide a CLI driver required by a skill, invoking that skill must surface a fixed warning that the required CLI is missing from the current workspace and the user should verify/reset the workspace before relying on the skill.

## Dreaming Updates (2026-06-18)
- For the Pi-agent memory/skill system here, support runtime load/unload control through slash-command-style UX and a simple CLI/TUI menu rather than treating memory activation as fixed at startup.
- Memory retrieval v1 should stay domain-oriented and also expose a search tool.
- The Pi agent itself should be able to create and edit skills, not just consume them.
- The recent full skill-body window defaults to 3 and should be made user-settable from the Pi agent UI/command surface.
- The deployed Pi-agent-owned `AGENTS.md` should guide memory/skill maintenance in a know-how-oriented rewrite style: update or rewrite the relevant paragraph when new understanding overlaps prior guidance, rather than growing an append-only ledger.
- The faithful web calibrator port is A3, not A6. Its canonical tie-breaker is the legacy Python in `D:\quailbot\src\quailbot\calibration\gui.py`, `cli_import.py`, and `D:\quailbot\src\quailbot\capture.py`.
- Treat the TypeScript + web implementation as a 1:1 port of all Python behavior, including behavior not explicitly enumerated in task text. Surface-level UI parity is not sufficient.
- `Set agent workspace` / activation-request support was explicitly dropped for this port. Treat residual `/api/request-activation`, `pendingWorkspaceActivation`, or activation UI as regression residue to remove, not scope to preserve.

## State Path Policy (0.1.0 ship)
- Quailbot Pi state lives at `~/.quailbot-pi/` by default, NOT `<cwd>/.quailbot-pi/`. The cwd-coupled layout was a dev convenience while pi-coding-agent was a local dependency; it is not the product shape.
- `src/workspace/workspace-state.ts:quailbotStateRoot()` is the single source of truth. It honors `process.env.QUAILBOT_PI_STATE_DIR` first, then falls back to `~/.quailbot-pi/`. The `cwd` argument is accepted for source-compat but is no longer load-bearing for state location; a future major may remove it.
- Do not reintroduce direct `join(cwd, ".quailbot-pi", ...)` callsites in production code. Use `quailbotStateRoot()` (or the per-subsystem helpers `memoryRoot`, `skillsRoot`, `experimentLogRoot`, etc.) so the override path stays uniform.
- Tests must rely on `tests/setup.ts` to inject a per-test `QUAILBOT_PI_STATE_DIR` tmpdir. New tests that assert on state contents should read through `quailbotStateRoot()` (or the production helper), not through the test's own cwd. Two exceptions: `tests/workspace-ui/server/path-policy.test.ts` and `tests/workspace-ui/server/file-browser.test.ts` construct their own fixture state-dirs for security-policy testing -- those stay self-contained.
- Workspace JSON files themselves are user-owned and can live anywhere on disk. `settings.json` stores the absolute path; Quailbot does not copy or relocate user-selected workspace files. The default landing place for editor-created saves is `~/.quailbot-pi/workspaces/`.
- ROI screenshots from `observe` and `quailbot_plan_and_execute` write into the active experiment directory (`~/.quailbot-pi/experiments/YYYY/MM/DD/exp_*/`) with the human-readable `roi-<name>-<refHash>-<captureId>.png` scheme. The image-artifacts pass continues to copy each capture into `blobs/images/<sha256>.png` for content-addressable evidence. When no experiment is open, captures fall back to `~/.quailbot-pi/observations-orphan/`.
- Only one workspace capture is kept on disk (`workspace-capture.png` + `workspace-capture.metadata.json`); each new capture atomically overwrites. The legacy `workspace-capture.<captureId>.png` versioned snapshots are no longer written, and any leftovers from older versions are cleaned up on each publish.
- Agent-visible knowledge tools (`quailbot_memory_*`, `quailbot_skill_*`) take names/domains/topics, never paths. Do not introduce path-shaped parameters for these tools; the user-facing TUI/commands may show absolute paths but the agent's tool surface stays name-only.
- `dependencies` is empty for distribution: Pi core (`@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `typebox`) sit in `peerDependencies: "*"` per Pi's package contract. They remain in `devDependencies` for local dev/test/build.
- Each ROI capture produces exactly ONE on-disk PNG. ROI tools write directly into `<experimentDir>/blobs/images/roi-<name>-<refhash>-<captureId>.png`; the experiment-log image-artifacts pass detects that the source is already inside `blobs/images/` and records the artifact metadata (size, sha256 for integrity) without copying. Do not re-introduce sha256-named copies, and do not write ROI PNGs at the experiment-root level alongside `events.jsonl` -- both shapes were earlier-iteration duplications that the user rejected.

## Build And Reinstall Discipline (0.1.0 ship)
- After any code change to `src/`, run `npm run build` to refresh `dist/` before exercising the change through Pi. The `pi.extensions` manifest points at `./dist/src/extension.js`; without a fresh build, Pi loads stale compiled output and the new behavior will not appear even though source looks correct.
- After any code change that produces a new package version (or while validating the published artifact), reinstall the package globally: `npm pack` to produce the tarball, then `pi install ./quailbot-pi-<version>.tgz` (or `pi install npm:quailbot-pi@<version>` once published). Pi caches installed packages under `~/.pi/agent/`; without reinstalling, an end-user Pi session will keep loading the previous version.
- For local-checkout dev (the `.pi/settings.json: { "packages": [".."] }` shape), `npm run pi` and `npm run pi:mutating` chain `dev:release` (which is `npm run build`) automatically. That covers the build step. Reinstall is only needed when moving between local-checkout and installed-tarball validation.
- If a test or live session shows behavior matching the prior version, the first thing to check is "did I rebuild?" -- not "is my code wrong?" Stale `dist/` is the most common cause of false-negative behavior verification on this project.
- `quailbot-pi` 的发行态按 home-scoped state 设计：生产态根目录是 `~/.quailbot-pi/`，其中承载 `workspaces`、`captures`、`experiments`、`settings` 等用户态数据；当前 repo 内本地 state 只是一段开发期过渡形状。
- 开发脚本保持 `pi --session-dir .pi-state/sessions`；不要把这个 dev-only 会话目录和发行态 `~/.quailbot-pi/` 混为一谈。
- Gate B 决策是单一 `~/.quailbot-pi/workspaces/` 作为中心 workspace 存放区；但 workspace editor 的任意 JSON 导入能力、以及 `/quailbot-workspace load` 直接加载任意 schema-valid 路径的能力仍然要保留，不能因为中心化存放就把这些入口做死。
- ROI 截图不应继续堆在单独的 `.quailbot-pi/roi-observations/`；默认只跟随 `~/.quailbot-pi/experiments/<yy>/<mm>/<dd>/exp_*/` 保存，并沿用人类可读命名，同时仍保留 blob 存储副本。workspace 截图在 `.quailbot-pi` 下只保留一张当前图，新图直接覆盖旧图。