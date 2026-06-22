# Quailbot Skill + Memory System — Design Spec

- Status: Draft (revised after @oracle review)
- Date: 2026-06-18
- Scope: A domain-organized memory system, a CLI-driver-gated skill system, a self-curation
  `AGENTS.md` constitution, and self-rendered per-turn knowledge propagation — delivered as
  quailbot-pi (Pi extension) harness code.

## 0. Revision note (post-review)

After an @oracle pass and source verification, two design changes from the first draft:
- **Auto-reload-on-write is dropped.** Pi's `sendUserMessage(..., {deliverAs})` calls
  `prompt(..., {expandPromptTemplates:false})`, which *skips* slash-command handling
  (`agent-session.js prompt()` runs `_tryExecuteExtensionCommand` only when
  `expandPromptTemplates && text.startsWith("/")`). So a tool-triggered `/quailbot-reload`
  would become a literal user message and a wasted LLM turn, with loop risk. There is no
  sound programmatic reload trigger from a tool/turn-end context.
- **Knowledge is self-rendered per turn instead.** Quailbot renders all three knowledge
  layers from disk + runtime state in `before_agent_start` every turn (mtime-cached), so
  writes take effect on the next turn automatically with no reload, no transcript
  pollution, no plan-context wipe. This serves the original "writes take effect
  automatically" goal better than reload did.

## 1. Intent

Two-tier knowledge plus a meta-curation layer:
- **Skills** — general, reusable instrument procedures (e.g. "how to change tip: shake vs
  pulse"). Each skill registers against one or more workspace CLI driver names. Loaded on
  demand. If a required driver is absent from the active workspace, a fixed warning is
  force-injected.
- **Memory** — per-domain situated facts (e.g. "at this FOV corner, gain ramp to X over Y
  ms worked"). Agent-written (user demand or own decision), load/unloadable, soft-linked
  (not forced) to a skill domain.
- **AGENTS.md (deployed dir)** — self-curation constitution: how Quailbot writes/consolidates
  its own skills/memory, plus permanent operating guidance.

Differentiator vs OpenCode/qdevbot/Pi-native skills: **skills are gated by CLI-driver
availability in the active workspace.** No upstream skill system has this.

## 2. Grounded substrate (verified facts)

### quailbot-pi
- A "CLI driver" is an executable-name string (e.g. `nqctl`) in workspace JSON
  (`cli_params.cli_name` or per-item `cli_name`), `spawn()`ed by `src/cli/cli-driver.ts`.
  Registration key `${cliName}:${name}`. `cli_*` tools allow-list via `requireParameter`
  and reject when `workspace.cli.enabled` is false or the param/action is disabled.
- The system prompt is authored per turn in `before_agent_start` via `result.systemPrompt`
  (`src/extension.ts`). Stable workspace authority belongs in this cached prefix. Hidden
  `quailbot-context` messages land in the conversation TAIL (`role:custom`→`user`) and
  are reserved for dynamic plan context, not the active workspace summary.
- Current `buildQuailbotSystemPrompt` (`src/prompt/quailbot-system-prompt.ts`) injects
  `new Date()` and does NOT render `contextFiles` (so AGENTS.md does not currently reach
  the model — fixed by §10/§11).
- `pi.on("context", ...)` rewrites tool-result content each turn (A5 projection:
  `tool-result-context.ts`, `tool-result-projection.ts`); currently recognizes only
  `QuailbotToolResult`-shaped `details` for `cli_*` actions.

### Pi runtime
- Pi auto-loads deployed-dir AGENTS.md into `systemPromptOptions.contextFiles`, refreshed
  only at session_start/reload (session-scoped).
- `ctx.reload()` (only on `ExtensionCommandContext`) preserves `agent.state.messages` but
  re-executes the extension factory (wiping in-memory `runtime`). Tools get
  `ExtensionContext` (no reload). `pi.sendUserMessage` skips command handling (see §0).
- Interactive menu primitive: no first-class multi-select. `ctx.ui.custom(...)` mounts the
  pi-tui `SettingsList` (rows + cycled values) — the toggle-menu primitive.

### Cache (Anthropic-family)
- Up to 4 `cache_control: ephemeral` breakpoints: first 2 system + last 2 non-system
  messages. Stable system prefix is cached; tail appends extend the moving window without
  busting the prefix. Cache identity = serialized byte content, so a per-turn-rebuilt
  system prompt is still cached iff byte-identical.

## 3. Architecture: three knowledge layers

| Layer | On disk | Reaches model via | Agent-writable |
|---|---|---|---|
| AGENTS.md (constitution) | deployed dir `AGENTS.md` | self-rendered into the cached prefix each turn | Yes (consolidate) |
| Skills | `.quailbot-pi/skills/<name>/SKILL.md` | catalog in cached prefix; body on-demand tool result | Yes (create/edit) |
| Memory | `.quailbot-pi/memory/<domain>.md` | index + loaded bodies in cached prefix | Yes (save) |

Scope: skills + memory under project-local `.quailbot-pi/` (gitignored user data; product
code stays driver/instrument-agnostic). Driver gate is evaluated against the active
workspace at render/load time.

## 4. On-disk layout

```
.quailbot-pi/
  skills/<name>/SKILL.md
  memory/<domain>.md
  knowledge-state.json        # loaded domains + skill-body window; persisted, re-hydrated at session_start
<deployed dir>/AGENTS.md       # self-curation constitution
```

`SKILL.md` frontmatter:
```yaml
---
name: change-tip                 # required
description: How to change the STM tip via shake or pulse   # required (else hidden from catalog)
drivers: [nqctl]                 # required driver name(s) — the gate; one or many
domain: tip-conditioning         # optional soft link to a memory domain
---
<markdown body: the general procedure>
```

## 5. Cache-aware placement + byte-stability guardrails

**Cached prefix** (rendered per turn in `before_agent_start` via `result.systemPrompt`):
- Quailbot identity (static)
- Active WORKSPACE summary and mutation policy (stable while the selected workspace and
  mutation gate are unchanged)
- AGENTS.md content (self-read from disk, mtime-cached)
- Skill catalog: per skill `name` + `description` + `drivers:[...]` + `[OK]`/`[MISSING]`
- Memory index (available domains; which loaded) + currently-loaded memory bodies

**Tail**: dynamic plan context and tool results. Skill bodies from `quailbot_skill` keep
newest **N=3** full, older degraded to a re-invokable stub. N runtime-settable (§8).

**Byte-stability is mandatory** (or caching collapses). Required normalization:
- Deterministic sort: skill names, domain names, `drivers` arrays, loaded-domain list.
- Stable frontmatter field order; normalized trailing whitespace/newlines on file reads.
- Date handling: do NOT inject a per-turn-volatile timestamp into the knowledge prefix;
  if a date is needed, use day-granularity and accept one rebuild per day boundary.
- Acceptance: hash the assembled system prompt across two ordinary turns → MUST be equal;
  exactly one hash change after a memory load/unload (§13).

Rejected alternative (per-turn ephemeral tail re-injection of loaded memory): reprocesses
stable content every turn and bloats the transcript. Prefix placement + rebuild-on-change
is cheaper because knowledge events are rare.

## 6. Driver-gating harness

**Driver-present predicate** (corrected): driver `D` is present iff
- an active workspace is loaded, AND
- `workspace.cli.enabled === true`, AND
- there exists at least one **enabled** parameter or action whose *effective* cliName is
  `D` (effective cliName = the item's `cli_name` override, else `defaultCliName`).

A bare `defaultCliName` match by name alone does NOT count. A driver whose params/actions
are all disabled → `[MISSING]`. No active workspace → all gated skills `[MISSING]`.

**Catalog annotation**: `drivers: nqctl [OK]` or `drivers: nqctl [MISSING]`.

**Force-injected warning** (warn+load: body still loads; execution stays blocked by the
`cli_*` allow-lists). The warning must be impossible to hide in render/projection:
```
[QUAILBOT WORKSPACE WARNING]
Skill "<name>" requires CLI driver(s): <list>.
The active workspace does NOT register: <missing-list>.
These procedures cannot run against the instrument until the workspace provides
the driver. Verify and re-select/reset your workspace before relying on this skill.
```

## 7. Tools (`pi.registerTool`)

- `quailbot_skill(name)` — load a skill body as a tool result; evaluate the gate (§6),
  prepend the warning if any required driver missing. Result `details` use a dedicated
  `quailbot_skill` envelope (distinct from `QuailbotToolResult`) so the projection (§12)
  can keep newest-3 full and stub older.
- `quailbot_skill_write(name, description, drivers[], domain?, body)` — create a new
  SKILL.md; validate frontmatter (name + description required, drivers non-empty array).
- `quailbot_skill_edit(name, targetSection, expectedOldHash, replacement)` — read-modify-
  **consolidate** (§9): rejects on stale `expectedOldHash`.
- `quailbot_memory_save(domain, { targetSection?, expectedOldHash?, replacement })` —
  replacement-oriented write into `memory/<domain>.md`. Flow: agent searches related
  sections (via `quailbot_memory_search` or a returned candidate list), then submits a
  consolidated `replacement` for `targetSection` with `expectedOldHash`. The tool:
  - rejects a stale hash (content changed since read),
    - flags (and optionally rejects) obvious append-ledger patterns (a new dated bullet
    appended without touching related content),
  - returns a before/after diff + the consolidated-section readback.
  On user demand OR the agent's own decision. Visible via `ctx.ui.notify` + experiment-log
  (never silent). NOT behind the hardware-mutation gate (local data, not an instrument
  action).
- `quailbot_memory_load(domain)` / `quailbot_memory_unload(domain)` — mutate + persist the
  loaded set (`knowledge-state.json`). Soft auto-load: loading a skill whose `domain` is
  set MAY auto-load that domain (recommended, not forced).
- `quailbot_memory_search(query)` — grep/substring search across `memory/*.md`; returns
  matching domain + section + snippet (and candidate sections for consolidation). v1 grep;
  FTS later.

## 8. Commands (slash + `ctx.ui`)

- `/quailbot-memory` — no args → `SettingsList` toggle menu (`ctx.ui.custom`) for
  loaded/unloaded per domain (mutate + persist); `list | load <domain> | unload <domain>`
  with tab-completion.
- `/quailbot-skills` — `list` (catalog with OK/MISSING); `window <n>` sets the recent-full
  skill-body window (default 3; persisted).
- `/quailbot-reload` (thin) and Pi's built-in `/reload` remain available as **manual**
  user refreshes (full Pi-resource/TUI-header re-discovery). Not required for knowledge
  propagation. User-typed, so they execute correctly.

## 9. Write discipline: consolidate, never append-ledger

All self-writes (memory, skills, AGENTS.md) are read-modify-**consolidate**, enforced by
replacement-oriented tool APIs (§7), not by guidance alone:
- The agent locates related existing content (search/candidate list).
- It submits a rewritten section (`targetSection` + `expectedOldHash` + `replacement`).
- The tool rejects stale hashes and flags append-ledger patterns; returns a diff.
- The deployed `AGENTS.md` states this as law (know-how oriented), and may hold future
  permanent instructions, consolidated the same way.

This is the explicit anti-pattern to dated append-ledger memory (the user's bad example).

## 10. Knowledge propagation: self-rendered per turn (no auto-reload)

Quailbot renders all three layers in `before_agent_start` from disk + runtime state, every
turn, into the cached prefix:
- **Skill catalog**: scan `.quailbot-pi/skills/*/SKILL.md` (mtime-cached — re-parse only
  changed files), evaluate the driver gate vs the active workspace, emit the normalized
  catalog (§5).
- **Memory index + loaded bodies**: read `loadedMemoryDomains` (runtime, persisted), read
  those domain files (mtime-cached), emit.
- **AGENTS.md**: self-read the deployed-dir AGENTS.md from disk (mtime-cached) and render
  it into the prefix. Quailbot owns this rendering so edits propagate next turn without
  reload; ensure it is rendered exactly once (do not also let Pi's `contextFiles` double-
  inject it — dedupe or suppress the Pi path).

Effect: any write (skill create/edit, memory save/load/unload, AGENTS.md edit) takes effect
on the NEXT turn automatically. Cache: the prefix is byte-identical across turns unless a
knowledge file or the loaded set changed → one rebuild on the event, cached otherwise.

**Persistence**: `loadedMemoryDomains` + skill-body `window` live in
`.quailbot-pi/knowledge-state.json`, re-hydrated at `session_start` (all reasons), so they
survive process restart and any user-initiated reload.

**Plan context**: unchanged (session-scoped as today). With no auto-reload there is no new
plan-wipe risk; a user-initiated `/reload` still resets it (documented, acceptable — it is
deliberate and rare).

**Manual reload** stays available (§8) for users who want a full Pi resource/TUI refresh.

## 11. Prompt-builder requirement (A1 follow-up)

`buildQuailbotSystemPrompt` must (a) stop injecting per-turn-volatile content into the
knowledge prefix (§5 date rule), and (b) render the self-read AGENTS.md into the prefix. If
Pi's `contextFiles` would also inject AGENTS.md, suppress/dedupe so it appears once.
contextFiles is genuine user content, distinct from the `toolSnippets`/`promptGuidelines`
construction metadata A1 intentionally omits.

## 12. Skill-body projection envelope

Define a `quailbot_skill` tool-result `details` shape distinct from `QuailbotToolResult`.
Extend `tool-result-context.ts` / `tool-result-projection.ts` to recognize it and apply a
newest-N (default 3) full / older→stub policy. Do NOT assume the existing CLI projection
catches skill results. Tests for N=3, newest-full, older-stub.

## 13. Semantic acceptance plan (real scenarios, end-to-end)

1. **Cache byte-stability**: two ordinary turns → identical assembled system-prompt hash.
2. **Memory toggle**: `load <domain>` → prefix hash changes exactly once; `unload` reverts.
3. **No-reload propagation**: a `quailbot_memory_save` / `quailbot_skill_write` mid-session
   is reflected on the NEXT turn via the prompt rebuild — with NO synthetic message in the
   transcript and NO extra LLM turn.
4. **Driver gate present**: workspace registers + enables `nqctl` → `quailbot_skill(change-tip)`
   loads with NO warning; catalog `[OK]`.
5. **Driver gate missing**: workspace with `cli.enabled=false`, OR default-only by name, OR
   all `nqctl` params disabled, OR no workspace → catalog `[MISSING]` and the verbatim
   warning is prepended on load. Multi-driver skill → warning lists exactly the missing
   subset.
6. **Consolidation**: `quailbot_memory_save` on an existing domain rewrites the related
   section (stale `expectedOldHash` rejected; append-ledger pattern flagged); readback
   shows consolidation, not duplication.
7. **Skill create**: `quailbot_skill_write` produces a parseable SKILL.md that appears in
   the catalog on the next turn (no reload).
8. **Window setting**: `/quailbot-skills window 1` then load 2 skills → newest body full,
   older degraded to stub (projection readback).
9. **Warning unhideable**: the missing-driver warning survives render/projection; exact
   text asserted.
10. **Plan context**: a memory write mid-task does NOT touch plan context; a user `/reload`
    resets it (documented behavior).

Artifacts (request/response/readback) preserved under
`.opencode/artifacts/quailbot-skill-memory/...`; an @oracle reviewer judges semantic
acceptance before completion.

## 14. Non-goals (YAGNI)

- Auto-reload-on-write (dropped after review; self-render achieves the goal).
- FTS/vector memory retrieval in v1 (grep only).
- Date-organized memory (domain-organized only).
- Global cross-project skills/memory root (`.quailbot-pi/`-local only).
- Pi-native or OpenCode-style ungated skill discovery (we own the gate).
- Per-skill permission scopes beyond the driver gate.

## 15. Risks

- **Per-turn disk re-scan cost** → mtime cache; re-parse/re-read only changed files; the
  catalog and AGENTS.md are small.
- **Cache busting from non-determinism** → the §5 normalization + scenario-1 hash test are
  the guardrail; treat any per-turn hash drift as a bug.
- **AGENTS.md double-render** → ensure a single rendering source (§11).
- **Consolidation regressing to append** → the replacement+hash API (§7/§9) is the
  enforcement; AGENTS.md guidance alone is insufficient.
