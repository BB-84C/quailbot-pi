# Quailbot Support-Tool Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Quailbot-owned read/write/edit/bash support-tool guidance while preserving provider-native tool schemas as the canonical tool surface.

**Architecture:** The prompt builder renders a static support-tool boundary section plus selected-tool-gated bullets. It uses `selectedTools` only for gating and ignores raw `toolSnippets` and `promptGuidelines` text.

**Tech Stack:** TypeScript, Pi `BuildSystemPromptOptions`, Vitest, Quailbot extension lifecycle tests.

---

## Task 1: Prompt tests

**Files:**
- Modify: `tests/prompt/quailbot-system-prompt.test.ts`

- [ ] Add failing tests asserting Quailbot-owned support-tool boundaries, per-tool gating, and continued absence of raw SDK prompt metadata.
- [ ] Run `npm test -- tests/prompt/quailbot-system-prompt.test.ts` and verify RED.

## Task 2: Prompt implementation

**Files:**
- Modify: `src/prompt/quailbot-system-prompt.ts`

- [ ] Add a support-tool boundary builder that emits general Quailbot-authored boundary text.
- [ ] Gate `read`, `edit`, `write`, and `bash` bullets on `options.selectedTools`.
- [ ] Keep `toolSnippets` and `promptGuidelines` ignored.
- [ ] Run `npm test -- tests/prompt/quailbot-system-prompt.test.ts` and verify GREEN.

## Task 3: E2E/docs updates

**Files:**
- Modify: `tests/e2e/dev-release-adoption.test.ts`
- Modify: `AGENTS.md`
- Modify: `ROADMAP.md`
- Modify: `docs/superpowers/specs/2026-06-11-quailbot-prompt-transport-boundary-design.md`

- [ ] Update E2E assertions to expect the Quailbot-owned boundary section while still rejecting `Available tools:` and raw generic sections.
- [ ] Update docs so they distinguish raw SDK guideline rendering from Quailbot-owned support-tool guidance.
- [ ] Run `npm run dev:check` and verify PASS.

## Task 4: Verification and review

**Files:** all touched files

- [ ] Run `npm run typecheck && npm test && npm run dev:check && git diff --check`.
- [ ] Request oracle review focused on support-tool guidance, prompt leakage, and doc consistency.
- [ ] Refresh `.opencode/artifacts/inspect-current-prompt/` snapshot.
- [ ] Report status without commit/merge/push.

## Self-review

- Spec coverage: tasks cover support-tool section, selected-tool gating, poisoned metadata, E2E, docs, and review.
- Placeholder scan: no placeholders remain.
- Type consistency: public prompt-builder signature remains `buildQuailbotSystemPrompt(options?: Partial<BuildSystemPromptOptions>): string`.
