
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

## A3 Visual Helper Direction (2026-06-13)
- A3's first slice must include a visual helper, and the full legacy group-tree UI is required because this surface is for humans.
- Evaluate the visual helper as a browser/web UI rather than Tk so it can stay in the Pi workflow and later support host/client preview and workspace editing.
- The web UI must use relative/responsive layout sizing instead of fixed pixel boundaries.
- Panels must track the browser window bounds, avoid overflow, and each panel must provide its own scrollbar.

## A3 Workflow And Visual Acceptance (2026-06-14)
- For the A3 web-workspace / visual-helper workstream, use subagent-driven implementation, best-of-N sampling for nontrivial slices, and multiple small commits with push-backed continuity when the workstream is being advanced across sessions.
- Keep A3 work on dedicated feature branches or worktrees rather than mixing it into unrelated branch state.
- Because there is no real instrument UI available yet, visual semantic acceptance for the web UI should focus on ROI and anchor fidelity: capture the actual image, compare the saved or observed image region against the ROI or anchor drawn in the web UI, and treat offset or alignment mismatch as a real failure.

## A3 Real-Substrate Acceptance (2026-06-14)
- A3 workspace-calibrator acceptance must use a real screenshot or real workspace capture image as the substrate; synthetic SVG or fixture imagery does not count.
- For ROI and anchor proof, draw the ROI and anchor over that exact captured image and preserve evidence that the overlay coordinates do not drift relative to the screenshot.
- Group tree collapse and expand must actually work in the web UI; visual acceptance must show the collapsed state, not just code-path claims.
- Acceptance must prove the real path: load existing workspace -> web edit/write -> request activation -> current agent hidden WORKSPACE context updated.
- Before claiming schema compatibility, compare the generated workspace file against the authoritative real workspace JSON under `D:/quailbot` and check for drift.
- Do not substitute mocked or synthetic evidence when the user asked for real screenshot or real workspace proof.
## Tk Parity Is Authoritative (2026-06-15)
- For the web workspace/calibrator work, `D:/quailbot` is the authoritative behavior source. Implement against the old Tk product logic directly instead of improvising a new interaction model.
- Do not limit parity work to the first failures the user happened to hit. Treat group tree behavior, ROI draw/edit flow, save/load, and the rest of the calibrator as a broad parity surface, and assume more gaps may exist until checked against the old project.
- When the target behavior is already clear from the old project, proceed with TDD and do not interrupt the user for extra review/decision gates unless you are genuinely unsure how to proceed.

## Screenshot Parity And Geometry Proof (2026-06-15)
- Tk/web parity includes visible screenshot controls. If the old tool exposes refresh or pick-on-screenshot behavior, the web UI should expose the corresponding button/control instead of hiding it.
- A3 geometry acceptance is not just "looks aligned on one machine". Prove that ROIs and anchors drawn on the screenshot round-trip to screen-space without drift, including non-zero virtual-screen origin and different screen/resolution deployments, using a verification method that does not interfere with the user's live desktop.

## A5 Tool Result Rendering (2026-06-15)
- For A5 CLI/tool-result presentation and context-retention design, ground the contract in the actual CLI driver substrate before inventing fields: inspect `D:\quail-cli-core`, `D:\Nanonis-QCodes-Controller` (`nqctl`), and quailbot-pi's current `cli_*` parsing path. Do not assume arbitrary CLI drivers or invent projection fields that the real contract cannot support.
- Map `context[0].text`, renderResult output, and retained `details` only to information that is actually parsed or preserved by current tool results; treat noisy or unparsable raw stdout as bounded diagnostics, not as semantic fields.
- Default `recentFullCliResultCount` to `2`: keep full `details` in model-visible context only for the most recent two `cli_*` tool results; older results should degrade to summary-only context while retaining full local details elsewhere.
- For the current quailbot-pi redesign track, use a subagent-driven feature-branch workflow with best-of-N sampling and frequent small commit/push steps.
