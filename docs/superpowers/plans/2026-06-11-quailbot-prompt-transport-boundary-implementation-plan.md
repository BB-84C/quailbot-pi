# Quailbot Prompt Transport Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status:** Extended by `docs/superpowers/plans/2026-06-11-quailbot-support-tool-boundaries-implementation-plan.md`. The transport boundary remains: no `Available tools` inventory and no raw SDK `Guidelines:` section. The extension adds Quailbot-owned support-tool boundaries instead.

**Goal:** Remove redundant prompt-rendered tool/guideline metadata and keep Quailbot's system prompt focused on stable identity and operating policy.

**Architecture:** Provider-native `tools` schemas remain the canonical tool surface. `quailbot-context` remains the dynamic model-visible workspace/plan channel. `systemPrompt` becomes stable Quailbot policy plus runtime date/cwd only.

**Tech Stack:** TypeScript, Pi extension lifecycle, Vitest, `@earendil-works/pi-coding-agent` prompt option types.

---

## File Structure

- Modify `src/prompt/quailbot-system-prompt.ts`: remove `Available tools` and dynamic `Guidelines` builders; expand the Quailbot identity/policy text with explicit tool-schema, mutation, and linked-observable boundaries.
- Modify `tests/prompt/quailbot-system-prompt.test.ts`: replace support-section expectations with transport-boundary expectations and poisoned-options regression checks.
- Modify `tests/e2e/dev-release-adoption.test.ts`: stop expecting `Available tools:` and `Guidelines:` in the built extension prompt; assert their absence and keep hidden context checks.
- Optionally modify `ROADMAP.md`: add a short A1 follow-up note after verification.

## Task 1: Prompt builder unit tests

**Files:**
- Modify: `tests/prompt/quailbot-system-prompt.test.ts`

- [ ] **Step 1: Replace support-section positive test with absence and policy assertions**

Use `buildQuailbotSystemPrompt()` with poisoned `systemPromptOptions` containing `selectedTools`, `toolSnippets`, and `promptGuidelines`. Assert the output contains Quailbot policy text and does not contain rendered tool snippets or generic section headers.

- [ ] **Step 2: Run focused prompt tests to verify red**

Run: `npm test -- tests/prompt/quailbot-system-prompt.test.ts`

Expected before implementation: FAIL because the current prompt still renders `Available tools:` and `Guidelines:`.

## Task 2: Prompt builder implementation

**Files:**
- Modify: `src/prompt/quailbot-system-prompt.ts`

- [ ] **Step 1: Remove dynamic support-section builders**

Remove `DEFAULT_TOOL_NAMES`, `FORBIDDEN_SUPPORT_TEXT_PATTERNS`, `buildAvailableToolsSection()`, `buildGuidelinesSection()`, and `isSafeSupportText()` if no longer used.

- [ ] **Step 2: Expand stable Quailbot policy text**

Add explicit text covering current tool schema authority, mutation policy, linked-observable readback, and stop conditions.

- [ ] **Step 3: Keep runtime metadata**

Keep `buildRuntimeMetadataSection()` and `cwd` path normalization.

- [ ] **Step 4: Run focused prompt tests to verify green**

Run: `npm test -- tests/prompt/quailbot-system-prompt.test.ts`

Expected: PASS.

## Task 3: E2E expectation update

**Files:**
- Modify: `tests/e2e/dev-release-adoption.test.ts`

- [ ] **Step 1: Update built-extension prompt assertions**

Remove assertions requiring `Available tools:` and `Guidelines:`. Add assertions that those strings and tool-snippet echoes are absent while Quailbot identity and `allowed quantum instrument CLI parameters` remain present.

- [ ] **Step 2: Run E2E dev-release check**

Run: `npm run dev:check`

Expected: PASS.

## Task 4: Full verification and closeout

**Files:**
- Optionally modify: `ROADMAP.md`

- [ ] **Step 1: Run full verification**

Run:

```bash
npm run typecheck
npm test
npm run dev:check
git diff --check
```

Expected: all commands pass.

- [ ] **Step 2: Inspect final diff**

Run: `git diff -- src tests docs ROADMAP.md AGENTS.md`

Expected: diff only contains prompt-boundary optimization, tests, and documentation.

- [ ] **Step 3: Request reviewer subagent**

Ask an oracle reviewer to inspect the final diff against the design and acceptance criteria.

- [ ] **Step 4: Report status without committing**

Report verification evidence and branch state. Do not commit, merge, or push unless the user explicitly asks.

## Self-review

- Spec coverage: all design acceptance criteria map to Tasks 1-4.
- Placeholder scan: no placeholder implementation is left; concrete files and commands are named.
- Type consistency: only `buildQuailbotSystemPrompt(options?: Partial<BuildSystemPromptOptions>)` remains part of the public prompt-builder API.
