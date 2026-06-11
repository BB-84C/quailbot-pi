# Quailbot Support-Tool Boundaries Design

## Goal

Add back useful read/write/edit/bash usage guidance without restoring Pi's generated `Available tools` inventory or raw SDK `promptGuidelines` wording.

## Runtime finding

The SDK does not expose a global hook for rewriting tool `promptGuidelines`. `before_agent_start` can inspect `BuildSystemPromptOptions` and return a replacement `systemPrompt`, but it cannot mutate the SDK's aggregated guideline strings in place.

## Design

Quailbot owns a short support-tool boundary section in the stable system prompt.

- Instrument operations use WORKSPACE-declared Quailbot tools first, especially CLI-driver tools and plan execution when available.
- File and shell tools are support tools for local files, source code, workspace inspection, diagnostics, and user-requested project edits.
- File/shell tools must not bypass WORKSPACE capability, mutation policy, CLI-driver validation, or linked-observable readback.
- `read`, `edit`, `write`, and `bash` get concise Quailbot-authored usage bullets when those tool names appear in `BuildSystemPromptOptions.selectedTools`.

The section may use `selectedTools` as an availability gate only. It must not render raw `toolSnippets`, raw `promptGuidelines`, or an `Available tools:` inventory.

## Acceptance criteria

- With `selectedTools` containing `read`, `edit`, `write`, and `bash`, the prompt contains `Quailbot support-tool boundaries`, `Instrument operations use WORKSPACE-declared Quailbot tools first`, `File and shell tools are support tools`, and per-tool bullets for those four support tools.
- With only `read` selected, only the `read` bullet appears.
- Poisoned `toolSnippets` and `promptGuidelines` do not appear in the runtime prompt.
- The prompt still does not contain `Available tools:`, `Other runtime tools`, Pi/coding-agent identity, `ReAct`, `Plan+Execute`, `wait_until`, `chain-of-thought`, or `be concise` wording.
- Built extension E2E sees the Quailbot-owned boundary section and still sees hidden `quailbot-context`.

## Non-goals

- Do not override built-in Pi tools.
- Do not modify provider-native tool schemas.
- Do not parse arbitrary guideline prose with regex transformations.
- Do not make file or shell tools valid instrument-control bypasses.
