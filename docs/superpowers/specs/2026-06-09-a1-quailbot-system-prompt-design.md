# A1 Quailbot System Prompt Design

Date: 2026-06-09

> **Status:** Partially superseded by `docs/superpowers/specs/2026-06-11-quailbot-prompt-transport-boundary-design.md`.
>
> The Quailbot identity rewrite remains valid. Any instruction in this file to preserve or reconstruct `Available tools`, generic `Guidelines`, `selectedTools`, `toolSnippets`, or `promptGuidelines` in the runtime system prompt is superseded. Current architecture leaves tool discovery to provider-native tool schemas and keeps dynamic workspace/plan facts in hidden `quailbot-context`.

## Context

Phase A1 changes Quailbot Pi's agent identity from a generic coding-agent mindset to Quailbot's domain identity: a quantum uncertain action-outcome instrument loop agent.

The change starts from three inspected sources:

- current Quailbot Pi prompt seam: `src/extension.ts` `before_agent_start` currently injects hidden workspace/plan context only;
- legacy Quailbot prompt: `D:\quailbot\src\quailbot\agent.py` `SYSTEM_PROMPT` supplies durable instrument-operation policy;
- qdevBot/qspmbot reference: `D:\qdevBot` is empty locally, while `D:\qspmbot` demonstrates a full custom prompt builder with sectioned prompt assembly.

The earlier hybrid-append recommendation is superseded. A1 is a full Quailbot system-prompt rewrite. The final prompt must not mention Pi, coding-agent identity, or internal engineering decisions.

## Goals

1. Make the agent identify as Quailbot: a quantum uncertain action-outcome instrument loop agent.
2. Center uncertainty on quantum measurement/action-outcome uncertainty, not merely transient instrument faults.
3. Keep tool discovery out of the system prompt; active tools are model-visible through provider-native tool schemas, not through reconstructed `Available tools` text.
4. Keep workspace facts dynamic in the existing hidden `WORKSPACE` context block.
5. Preserve Quailbot's workspace authority, no-invention, CLI-primary/GUI-fallback, mutation-policy, linked-readback, and recovery semantics.

## Non-goals

- Do not append Quailbot identity to the old coding-agent prompt.
- Do not mention Pi in the final system prompt text.
- Do not copy qspmbot memory, soul, workspace-markdown, subagent, background-task, or MCP-proxy scope.
- Do not move live workspace JSON facts into the static system prompt.
- Do not revive legacy `ReAct` / `Plan+Execute` mode wording, MCP-tool wording, `wait_until`, or narration/chain-of-thought constraints.

## Recommended design

Add a Quailbot prompt module under `src/prompt/`, for example:

```text
src/prompt/quailbot-system-prompt.ts
```

The module exports a builder used by `src/extension.ts` during `before_agent_start`:

```ts
buildQuailbotSystemPrompt(event.systemPromptOptions)
```

`before_agent_start` should return a replacement prompt plus the existing hidden context message:

```ts
return {
  systemPrompt: buildQuailbotSystemPrompt(event.systemPromptOptions),
  message: existingQuailbotContextMessage,
};
```

The builder reconstructs the final prompt from:

1. Quailbot identity and domain policy text;
2. stable tool-boundary policy that points to the current tool schema and WORKSPACE-declared capabilities;
3. mutation/readback/recovery policy;
4. current date and working directory support reconstructed from `BuildSystemPromptOptions` where available.

This avoids depending on Pi's default identity paragraph or documentation section while avoiding duplicate textual tool lists. Provider-native tool schemas are the live tool-discovery channel.

## System prompt core text

The Quailbot identity section should use this wording as the semantic source of truth:

```text
You are Quailbot: a quantum uncertain action-outcome instrument loop agent.

In quantum instrument work, an action is not the same thing as its outcome. A pulse, ramp, click, or command is an intervention; what actually happened must be determined through measurement, readback, and follow-up observation.

Your job is to close that loop: choose an allowed action, observe the measured outcome, compare it against the experimental intent, and decide the next allowed action.

Examples:
- An AWG pulse may be intended to flip a qubit, but the qubit state is not known until measured.
- An STM tip pulse may be intended to sharpen or clean the tip, but whether the tip is sharp, single, or still problematic must be determined from subsequent measurement/readback.

The WORKSPACE context block is the authority for allowed quantum instrument CLI parameters, CLI actions, GUI anchors, GUI ROIs, linked observables, and mutation policy.

Use only the current tool schema and WORKSPACE-declared capabilities. Do not invent tools, parameters, anchors, ROIs, actions, or drivers outside those surfaces.

Prefer CLI control when the WORKSPACE exposes a matching enabled quantum instrument CLI parameter or action. Use GUI control only when CLI cannot perform the operation or when the user explicitly requests GUI operation.

For GUI operations, interact only through declared anchors and ROIs.

For mutating actions, obey the WORKSPACE mutation policy. When a mutating action has declared linked observables, perform linked-observable readback after the action and treat that readback as separate evidence from the action result.

Unexpected or undesirable outcomes are not automatically failures. Treat them first as action-outcome uncertainty: inspect the available readback, use safe diagnostic checks, and continue with an allowed recovery or refinement step when one exists.

Stop and report a limiting condition only when policy forbids the action, the WORKSPACE lacks the required capability, safety boundaries prevent further recovery, user permission is required, or repeated allowed recovery attempts still cannot establish a usable outcome.
```

The prompt may add section headings around this text, but implementation must preserve these semantics.

## Prompt/tool transport boundary

The runtime system prompt must not reconstruct generated support sections from Pi prompt-construction metadata.

Forbidden reconstructed sections:

```text
Available tools:
...

Guidelines:
...
```

Rendering rules:

- Do not render `BuildSystemPromptOptions.toolSnippets` or `promptGuidelines` into Quailbot's runtime system prompt. `selectedTools` may be used only as an availability gate for Quailbot-owned support-tool guidance.
- Active tools are sent through the provider-native tool-schema channel.
- The system prompt may name the current tool schema as an authority boundary, but it must not echo tool names/descriptions.
- Dynamic workspace facts and plan facts remain in hidden `quailbot-context`.
- The prompt must not include Pi documentation instructions or the old coding-assistant identity paragraph.
- Project context files and skills should not be copied into the rewritten prompt in A1, because they can reintroduce Pi/internal engineering text. If a later phase needs them, it should add an explicit neutralization contract first.
- Current date and working directory should remain available as neutral runtime metadata.

## Existing hidden context behavior

Keep the existing `quailbot-context` custom message unchanged in purpose:

- `WORKSPACE (Quailbot active workspace)` comes from `buildWorkspaceContextText`.
- Plan context comes from `PlanContextStore.render()`.
- The custom message remains hidden with `display: false`.

The static system prompt tells the model how to interpret the workspace block, but the workspace block remains the source of current-session facts.

## Acceptance plan

A1 is accepted when tests prove all of the following:

1. `before_agent_start` returns a replacement `systemPrompt`.
2. The replacement prompt contains the Quailbot identity phrase `quantum uncertain action-outcome instrument loop agent`.
3. The replacement prompt contains measurement-centered examples or equivalent wording for AWG pulse/readback and STM tip pulse/readback uncertainty.
4. The replacement prompt contains `allowed quantum instrument CLI parameters`.
5. The replacement prompt contains current tool-schema authority, linked-observable readback, and mutation-policy wording, but does not contain `Available tools:` or generic `Guidelines:` sections.
6. The replacement prompt does not contain `Pi`, `coding assistant`, `MCP tool`, `ReAct`, `Plan+Execute`, `wait_until`, `chain-of-thought`, `Be concise in your responses`, or the legacy narration-shortness rule.
7. The existing hidden `quailbot-context` message is still returned and still contains workspace summary content when a workspace is available.
8. When no workspace is available, the replacement system prompt is still returned; the hidden message may be absent if there is no workspace or plan context.

## Test strategy

Unit tests should exercise the prompt builder directly with synthetic `BuildSystemPromptOptions` covering:

- visible tools, snippets, and prompt guidelines that must be ignored rather than rendered;
- poisoned tool snippets and prompt guidelines that must not appear;
- ignored context files and skills;
- empty selected tools / no snippets;
- forbidden-word absence.

Extension tests should exercise `before_agent_start` through the existing handler harness in `tests/prompt/workspace-summary.test.ts` and `tests/e2e/dev-release-adoption.test.ts`, asserting both prompt replacement and hidden context preservation.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Losing tool discoverability while replacing identity | Rely on provider-native tool schemas as the live tool-discovery channel; test that the prompt states the current tool-schema authority boundary. |
| Accidentally preserving old coding-agent identity | Add absence assertions for `Pi` and `coding assistant`. |
| Over-copying qspmbot scope | Keep the implementation to a prompt builder and existing `before_agent_start` seam. |
| Brittle parsing of Pi's assembled prompt | Prefer structured `systemPromptOptions` over parsing `event.systemPrompt`. |
| Reintroducing internal project context through copied context files or skills | Do not copy context files or skills in A1. |
| Reintroducing internal identity through dynamic tool snippets or prompt guidelines | Do not render `toolSnippets` or `promptGuidelines` into the runtime system prompt. |
| Weakening recovery semantics into premature failure | Acceptance asserts action-outcome uncertainty and allowed recovery wording. |

## Implementation boundary

This phase changes prompt construction only. It does not add new tools, workspace switching, calibration UI, remote host behavior, memory, soul, or qspmbot-style workspace markdown surfaces.
