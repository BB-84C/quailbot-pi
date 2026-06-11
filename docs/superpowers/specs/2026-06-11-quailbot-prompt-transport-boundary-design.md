# Quailbot Prompt Transport Boundary Design

## Goal

Optimize the A1 Quailbot system prompt so it describes Quailbot's stable identity and operating policy without duplicating the model transport layer's dynamic tool/schema context.

## Runtime substrate

Pi sends the model three relevant channels:

1. `systemPrompt`: one replacement string returned by `before_agent_start`.
2. `messages`: the real user message plus extension custom messages; Quailbot's hidden `quailbot-context` becomes a model-visible user-context message while remaining hidden from UI display.
3. `tools`: provider-native tool/function schemas for active tools, including Pi built-ins such as `read`, `bash`, `edit`, and `write`, plus Quailbot tools such as `cli_get`, `cli_set`, `observe`, and plan tools.

`systemPromptOptions.toolSnippets` and `promptGuidelines` are extension-side construction metadata. They are not model-visible unless Quailbot renders them into `systemPrompt`, which Quailbot should not do. `selectedTools` may be used only as an availability gate for Quailbot-owned support-tool guidance.

## Design

The system prompt becomes a stable Quailbot constitution:

- Quailbot identity as a quantum uncertain action-outcome instrument loop agent.
- WORKSPACE authority for allowed quantum instrument CLI parameters, GUI anchors/ROIs, linked observables, and mutation policy.
- Tool boundary: use only the current tool schema and WORKSPACE-declared capabilities; do not invent tools, parameters, actions, anchors, or ROIs.
- Action policy: prefer CLI when WORKSPACE exposes a matching enabled CLI parameter/action; GUI control only through declared anchors and ROIs.
- Mutation/readback policy: respect mutation policy and use linked-observable readback after mutating actions when declared.
- Uncertainty policy: action is not outcome; unexpected outcomes are treated as measurement/action-outcome uncertainty first, then diagnosed through allowed readback/recovery steps.
- Stop policy: stop only when policy, capability, safety, permission, or repeated allowed recovery limits prevent further progress.
- Quailbot-owned support-tool boundaries for file/shell tools, with CLI-driver tools primary for instrument operations.
- Runtime metadata: current date and current working directory.

The system prompt must not include an `Available tools:` list or a generic SDK-authored `Guidelines:` section reconstructed from Pi coding-agent prompt inputs. Tool names, descriptions, and schemas belong to the provider-native `tools` channel. Dynamic workspace facts and plan state remain in hidden `quailbot-context`, not in the system prompt.

## Rejected approaches

### Keep reconstructed `Available tools` and `Guidelines`

Rejected because this duplicates provider-native tool schemas, can drift from the actual active tools, and risks reintroducing coding-agent wording through inherited Pi prompt metadata.

### Move WORKSPACE JSON into system prompt

Rejected because WORKSPACE is dynamic per session and already has a model-visible hidden-message channel. Keeping it separate preserves the stable/dynamic boundary.

### Put all behavior in tool schemas

Rejected because cross-tool policy such as WORKSPACE authority, CLI-vs-GUI preference, mutation gating, and linked-observable readback is agent-level behavior, not a property of any single tool.

## Acceptance criteria

- `buildQuailbotSystemPrompt()` contains Quailbot identity, WORKSPACE authority, current tool schema boundary, mutation policy, linked-observable readback, stop conditions, date, and cwd.
- The system prompt contains Quailbot-owned support-tool boundaries for read/write/edit/bash while keeping CLI-driver tools primary.
- The system prompt does not contain `Available tools:`, SDK-authored `Guidelines:`, `Other runtime tools`, built-in tool list snippets, Pi/coding-agent identity, `MCP tool`, `ReAct`, `Plan+Execute`, `wait_until`, `chain-of-thought`, or `be concise` wording.
- Poisoned `systemPromptOptions` snippets and guidelines cannot appear in the system prompt.
- `before_agent_start` still replaces the base Pi prompt.
- `before_agent_start` still injects `quailbot-context` when a workspace or plan context exists.
- Dev release E2E still proves the built extension adopts the replacement prompt and hidden context.

## Non-goals

- Do not change registered tool schemas.
- Do not change workspace summary shape.
- Do not change mutation policy semantics.
- Do not commit automatically; commit remains user-controlled for this branch.
