
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