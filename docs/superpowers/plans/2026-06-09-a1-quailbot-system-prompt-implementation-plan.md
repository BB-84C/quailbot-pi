# A1 Quailbot System Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not commit unless the user explicitly requests it.

> **Status:** Superseded for prompt support-section behavior by `docs/superpowers/plans/2026-06-11-quailbot-prompt-transport-boundary-implementation-plan.md`.
>
> Do not execute the support-section reconstruction steps below as current guidance. The current Quailbot prompt must not render `Available tools`, generic `Guidelines`, `selectedTools`, `toolSnippets`, or `promptGuidelines` into the runtime system prompt. Active tool schemas are sent through the provider-native tools channel; workspace and plan facts are sent through hidden `quailbot-context`.

**Goal:** Replace the default coding-agent system prompt with a Quailbot system prompt that expresses quantum uncertain action-outcome instrument-loop identity while relying on provider-native tool schemas and hidden `quailbot-context` for dynamic context.

**Architecture:** Add a focused prompt-builder module under `src/prompt/` and call it from the existing `before_agent_start` extension seam. Preserve the existing hidden `quailbot-context` message for workspace and plan context; replace only the system prompt. Current implementation keeps runtime metadata only and does not reconstruct neutral tool/guideline sections from `BuildSystemPromptOptions`.

**Tech Stack:** TypeScript ESM, `@earendil-works/pi-coding-agent@0.74.2` extension types, Vitest, existing Quailbot Pi prompt/test harnesses.

---

## File structure

- Create: `src/prompt/quailbot-system-prompt.ts`
  - Owns the full rewritten Quailbot system prompt and runtime metadata rendering.
  - Exports `buildQuailbotSystemPrompt(options?: Partial<BuildSystemPromptOptions>): string`.
- Create: `tests/prompt/quailbot-system-prompt.test.ts`
  - Unit-tests identity, prompt/tool transport boundary, ignored context/skills, forbidden legacy/internal wording, and ignored dynamic construction metadata.
- Modify: `src/extension.ts`
  - Imports the prompt builder.
  - Uses `event.systemPromptOptions` in `before_agent_start`.
  - Always returns a replacement `systemPrompt`; returns the hidden context message only when workspace/plan content exists.
- Modify: `tests/prompt/workspace-summary.test.ts`
  - Updates existing handler expectations to allow the added `systemPrompt` field.
  - Adds a no-workspace prompt-replacement test.
- Modify: `tests/e2e/dev-release-adoption.test.ts`
  - Asserts built extension replacement prompt is Quailbot identity, not appended base prompt.
- Modify: `ROADMAP.md`
  - End-of-round update after implementation and verification.

---

### Task 1: Prompt builder unit tests

**Files:**
- Create: `tests/prompt/quailbot-system-prompt.test.ts`
- Test command: `npx vitest --run tests/prompt/quailbot-system-prompt.test.ts`

- [ ] **Step 1: Write failing prompt-builder tests**

Create `tests/prompt/quailbot-system-prompt.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import type { BuildSystemPromptOptions } from "@earendil-works/pi-coding-agent";

import { buildQuailbotSystemPrompt } from "../../src/prompt/quailbot-system-prompt.js";

describe("Quailbot system prompt", () => {
  it("builds Quailbot identity around quantum action-outcome uncertainty", () => {
    const prompt = buildQuailbotSystemPrompt({
      cwd: "D:\\vault-lab",
      selectedTools: ["read", "edit", "write", "bash", "grep", "cli_get"],
      toolSnippets: {
        read: "Read file contents",
        edit: "Make precise file edits",
        write: "Create or overwrite files",
        bash: "Execute shell commands",
        grep: "Search file contents",
        cli_get: "Read a workspace-approved quantum instrument CLI parameter",
      },
      promptGuidelines: ["Use edit for surgical file changes"],
    } satisfies BuildSystemPromptOptions);

    expect(prompt).toContain("You are Quailbot: a quantum uncertain action-outcome instrument loop agent.");
    expect(prompt).toContain("an action is not the same thing as its outcome");
    expect(prompt).toContain("An AWG pulse may be intended to flip a qubit");
    expect(prompt).toContain("An STM tip pulse may be intended to sharpen or clean the tip");
    expect(prompt).toContain("allowed quantum instrument CLI parameters");
    expect(prompt).toContain("Unexpected or undesirable outcomes are not automatically failures");
    expect(prompt).toContain("Stop and report a limiting condition only when policy forbids the action");
  });

  it("renders neutral available-tool and guideline support sections", () => {
    const prompt = buildQuailbotSystemPrompt({
      cwd: "D:\\vault-lab",
      selectedTools: ["read", "edit", "write", "bash", "grep"],
      toolSnippets: {
        read: "Read file contents",
        edit: "Make precise file edits",
        write: "Create or overwrite files",
        bash: "Execute shell commands",
        grep: "Search file contents",
      },
      promptGuidelines: ["Use edit for surgical file changes"],
    } satisfies BuildSystemPromptOptions);

    expect(prompt).toContain("Available tools:\n- read: Read file contents");
    expect(prompt).toContain("- bash: Execute shell commands");
    expect(prompt).toContain("Guidelines:\n");
    expect(prompt).toContain("- Prefer grep/find/ls tools over bash for file exploration");
    expect(prompt).toContain("- Use the read tool to examine files before editing");
    expect(prompt).toContain("- Use precise edit operations for targeted file changes");
    expect(prompt).toContain("- Use write only for new files or complete rewrites");
    expect(prompt).toContain("- Use edit for surgical file changes");
    expect(prompt).toContain("- Show file paths clearly when working with files");
    expect(prompt).toContain("Current working directory: D:/vault-lab");
    expect(prompt).not.toContain("Be concise in your responses");
  });

  it("does not include legacy or internal identity wording", () => {
    const prompt = buildQuailbotSystemPrompt({ cwd: "D:\\vault-lab" });

    for (const forbidden of [
      "Pi",
      "coding assistant",
      "MCP tool",
      "ReAct",
      "Plan+Execute",
      "wait_until",
      "chain-of-thought",
      "Keep narration short",
    ]) {
      expect(prompt).not.toContain(forbidden);
    }
  });

  it("ignores context files and skills that could reintroduce internal project text", () => {
    const prompt = buildQuailbotSystemPrompt({
      cwd: "D:\\vault-lab",
      contextFiles: [
        {
          path: "AGENTS.md",
          content: "Pi coding assistant ReAct wait_until internal engineering decision",
        },
      ],
      skills: [
        {
          name: "internal-pi-skill",
          description: "coding assistant helper",
          filePath: "D:/quailbot-pi/.opencode/skills/internal/SKILL.md",
        } as BuildSystemPromptOptions["skills"] extends Array<infer Skill> ? Skill : never,
      ],
    });

    expect(prompt).not.toContain("internal engineering decision");
    expect(prompt).not.toContain("internal-pi-skill");
    expect(prompt).not.toContain("coding assistant helper");
    expect(prompt).not.toContain("Pi");
    expect(prompt).not.toContain("wait_until");
  });

  it("filters unsafe tool snippets and prompt guidelines before rendering support sections", () => {
    const prompt = buildQuailbotSystemPrompt({
      cwd: "D:\\vault-lab",
      selectedTools: ["read", "bash", "cli_get"],
      toolSnippets: {
        read: "Read file contents",
        bash: "Pi coding assistant shell helper",
        cli_get: "MCP tool for ReAct Plan+Execute wait_until chain-of-thought",
      },
      promptGuidelines: [
        "Use dedicated tools for file exploration",
        "Pi coding assistant should keep narration short",
        "Be concise in your responses",
      ],
    });

    expect(prompt).toContain("- read: Read file contents");
    expect(prompt).toContain("- Use dedicated tools for file exploration");
    for (const forbidden of [
      "Pi",
      "coding assistant",
      "MCP tool",
      "ReAct",
      "Plan+Execute",
      "wait_until",
      "chain-of-thought",
      "keep narration short",
      "Be concise in your responses",
    ]) {
      expect(prompt).not.toContain(forbidden);
    }
  });

  it("renders a stable empty available-tools section when snippets are absent", () => {
    const prompt = buildQuailbotSystemPrompt({
      cwd: "D:\\vault-lab",
      selectedTools: ["read", "bash"],
    });

    expect(prompt).toContain("Available tools:\n(none)");
    expect(prompt).toContain("Guidelines:\n");
    expect(prompt).toContain("Current date: ");
  });
});
```

- [ ] **Step 2: Run the prompt-builder tests and confirm they fail**

Run:

```powershell
npx vitest --run tests/prompt/quailbot-system-prompt.test.ts
```

Expected: fail because `src/prompt/quailbot-system-prompt.ts` does not exist yet.

---

### Task 2: Prompt builder implementation

**Files:**
- Create: `src/prompt/quailbot-system-prompt.ts`
- Test command: `npx vitest --run tests/prompt/quailbot-system-prompt.test.ts`

- [ ] **Step 1: Create the prompt builder**

Create `src/prompt/quailbot-system-prompt.ts` with:

```ts
import type { BuildSystemPromptOptions } from "@earendil-works/pi-coding-agent";

const DEFAULT_TOOL_NAMES = ["read", "bash", "edit", "write"] as const;
const FORBIDDEN_SUPPORT_TEXT_PATTERNS = [
  /\bPi\b/,
  /coding assistant/i,
  /MCP tool/i,
  /\bReAct\b/,
  /Plan\+Execute/,
  /wait_until/,
  /chain-of-thought/i,
  /keep narration short/i,
  /be concise/i,
];

const QUAILBOT_IDENTITY = `You are Quailbot: a quantum uncertain action-outcome instrument loop agent.

In quantum instrument work, an action is not the same thing as its outcome. A pulse, ramp, click, or command is an intervention; what actually happened must be determined through measurement, readback, and follow-up observation.

Your job is to close that loop: choose an allowed action, observe the measured outcome, compare it against the experimental intent, and decide the next allowed action.

Examples:
- An AWG pulse may be intended to flip a qubit, but the qubit state is not known until measured.
- An STM tip pulse may be intended to sharpen or clean the tip, but whether the tip is sharp, single, or still problematic must be determined from subsequent measurement/readback.

The WORKSPACE context block is the authority for allowed quantum instrument CLI parameters, CLI actions, GUI anchors, GUI ROIs, linked observables, and mutation policy.

Do not invent parameters, anchors, ROIs, actions, drivers, or tools outside the WORKSPACE context and available tool schemas.

Prefer CLI control when the WORKSPACE exposes a matching enabled quantum instrument CLI parameter or action. Use GUI control only when CLI cannot perform the operation or when the user explicitly requests GUI operation.

For GUI operations, interact only through declared anchors and ROIs.

Unexpected or undesirable outcomes are not automatically failures. Treat them first as action-outcome uncertainty: inspect the available readback, use safe diagnostic checks, and continue with an allowed recovery or refinement step when one exists.

Stop and report a limiting condition only when policy forbids the action, the WORKSPACE lacks the required capability, safety boundaries prevent further recovery, user permission is required, or repeated allowed recovery attempts still cannot establish a usable outcome.`;

export function buildQuailbotSystemPrompt(options: Partial<BuildSystemPromptOptions> = {}): string {
  return [
    QUAILBOT_IDENTITY,
    buildAvailableToolsSection(options),
    buildGuidelinesSection(options),
    buildRuntimeMetadataSection(options),
  ].join("\n\n");
}

function buildAvailableToolsSection(options: Partial<BuildSystemPromptOptions>): string {
  const selectedTools = options.selectedTools ?? [...DEFAULT_TOOL_NAMES];
  const snippets = options.toolSnippets ?? {};
  const visibleTools = selectedTools.filter((name) => {
    const snippet = snippets[name];
    return typeof snippet === "string" && snippet.trim() !== "" && isSafeSupportText(snippet);
  });
  const toolsList = visibleTools.length > 0
    ? visibleTools.map((name) => `- ${name}: ${snippets[name].trim()}`).join("\n")
    : "(none)";

  return `Available tools:\n${toolsList}\n\nOther runtime tools may also be available through the current tool schema.`;
}

function buildGuidelinesSection(options: Partial<BuildSystemPromptOptions>): string {
  const selectedTools = options.selectedTools ?? [...DEFAULT_TOOL_NAMES];
  const guidelines: string[] = [];
  const seen = new Set<string>();
  const add = (guideline: string): void => {
    const normalized = guideline.trim();
    if (normalized.length === 0 || seen.has(normalized) || !isSafeSupportText(normalized)) {
      return;
    }
    seen.add(normalized);
    guidelines.push(normalized);
  };

  const hasBash = selectedTools.includes("bash");
  const hasGrep = selectedTools.includes("grep");
  const hasFind = selectedTools.includes("find");
  const hasLs = selectedTools.includes("ls");
  const hasRead = selectedTools.includes("read");
  const hasEdit = selectedTools.includes("edit");
  const hasWrite = selectedTools.includes("write");

  if (hasBash && !hasGrep && !hasFind && !hasLs) {
    add("Use bash for file operations like ls, rg, and find when dedicated file-search tools are unavailable");
  } else if (hasBash && (hasGrep || hasFind || hasLs)) {
    add("Prefer grep/find/ls tools over bash for file exploration");
  }

  if (hasRead && hasEdit) {
    add("Use the read tool to examine files before editing");
  }
  if (hasEdit) {
    add("Use precise edit operations for targeted file changes");
  }
  if (hasWrite) {
    add("Use write only for new files or complete rewrites");
  }
  if (hasEdit || hasWrite) {
    add("When summarizing file changes, output plain text directly rather than running commands only to display what changed");
  }

  for (const guideline of options.promptGuidelines ?? []) {
    add(guideline);
  }

  add("Show file paths clearly when working with files");

  return `Guidelines:\n${guidelines.map((guideline) => `- ${guideline}`).join("\n")}`;
}

function isSafeSupportText(value: string): boolean {
  return !FORBIDDEN_SUPPORT_TEXT_PATTERNS.some((pattern) => pattern.test(value));
}

function buildRuntimeMetadataSection(options: Partial<BuildSystemPromptOptions>): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const date = `${year}-${month}-${day}`;
  const cwd = options.cwd ? options.cwd.replace(/\\/g, "/") : process.cwd().replace(/\\/g, "/");

  return `Current date: ${date}\nCurrent working directory: ${cwd}`;
}
```

- [ ] **Step 2: Run prompt-builder tests and confirm they pass**

Run:

```powershell
npx vitest --run tests/prompt/quailbot-system-prompt.test.ts
```

Expected: all tests in `tests/prompt/quailbot-system-prompt.test.ts` pass.

---

### Task 3: Extension seam integration tests

**Files:**
- Modify: `tests/prompt/workspace-summary.test.ts`
- Test command: `npx vitest --run tests/prompt/workspace-summary.test.ts`

- [ ] **Step 1: Update hidden-context test to expect systemPrompt plus message**

In `tests/prompt/workspace-summary.test.ts`, replace the assertion at lines 114-120 with:

```ts
    expect(result).toEqual(
      expect.objectContaining({
        systemPrompt: expect.stringContaining("quantum uncertain action-outcome instrument loop agent"),
        message: expect.objectContaining({
          customType: "quailbot-context",
          display: false,
          content: expect.stringContaining("WORKSPACE (Quailbot active workspace)"),
        }),
      }),
    );
```

- [ ] **Step 2: Add no-workspace prompt replacement test**

Add this test before the `clears persisted plan context` test:

```ts
  it("replaces the system prompt even when no workspace context is loaded", async () => {
    const cwd = makeTempDir();
    const handlers = new Map<string, Handler>();

    quailbotExtension({
      on: (event: string, handler: Handler) => {
        handlers.set(event, handler);
      },
      registerTool: () => undefined,
    } as never);

    const result = await handlers.get("before_agent_start")?.(
      {
        type: "before_agent_start",
        prompt: "",
        systemPrompt: "base Pi coding assistant prompt",
        systemPromptOptions: { cwd },
      },
      { cwd, hasUI: false },
    );

    expect(result).toEqual(
      expect.objectContaining({
        systemPrompt: expect.stringContaining("You are Quailbot"),
      }),
    );
    expect((result as { systemPrompt?: string }).systemPrompt).not.toContain("base Pi coding assistant prompt");
    expect((result as { message?: unknown }).message).toBeUndefined();
  });
```

- [ ] **Step 3: Run the extension prompt tests and confirm they fail before integration**

Run:

```powershell
npx vitest --run tests/prompt/workspace-summary.test.ts
```

Expected: fail because `src/extension.ts` does not yet return `systemPrompt`.

---

### Task 4: Extension seam implementation

**Files:**
- Modify: `src/extension.ts`
- Test command: `npx vitest --run tests/prompt/workspace-summary.test.ts tests/prompt/quailbot-system-prompt.test.ts`

- [ ] **Step 1: Import the prompt builder**

Add this import near the other prompt imports in `src/extension.ts`:

```ts
import { buildQuailbotSystemPrompt } from "./prompt/quailbot-system-prompt.js";
```

- [ ] **Step 2: Replace the `before_agent_start` handler body**

Replace the existing handler at `src/extension.ts:35-53` with:

```ts
  pi.on("before_agent_start", (event) => {
    const mutationPolicy = mutationPolicyFromEnvironment();
    const content = [
      runtime.workspace ? buildWorkspaceContextText(runtime.workspace, mutationPolicy) : undefined,
      runtime.planStore.render(),
    ].filter((item): item is string => item !== undefined);

    const systemPrompt = buildQuailbotSystemPrompt(event.systemPromptOptions);

    if (content.length === 0) {
      return { systemPrompt };
    }

    return {
      systemPrompt,
      message: {
        customType: "quailbot-context",
        content: content.join("\n\n"),
        display: false,
      },
    };
  });
```

- [ ] **Step 3: Run prompt tests and confirm they pass**

Run:

```powershell
npx vitest --run tests/prompt/workspace-summary.test.ts tests/prompt/quailbot-system-prompt.test.ts
```

Expected: both prompt test files pass.

---

### Task 5: Built extension adoption test

**Files:**
- Modify: `tests/e2e/dev-release-adoption.test.ts`
- Test command: `npm run dev:check`

- [ ] **Step 1: Add prompt replacement assertions to built-extension test**

In `tests/e2e/dev-release-adoption.test.ts`, after line 88 (`const context = ...`) add:

```ts
    expect(context?.systemPrompt).toContain("quantum uncertain action-outcome instrument loop agent");
    expect(context?.systemPrompt).toContain("allowed quantum instrument CLI parameters");
    expect(context?.systemPrompt).toContain("current tool schema");
    expect(context?.systemPrompt).toContain("linked-observable readback");
    expect(context?.systemPrompt).not.toContain("Available tools:");
    expect(context?.systemPrompt).not.toContain("Guidelines:");
    expect(context?.systemPrompt).not.toContain("Other runtime tools");
    expect(context?.systemPrompt).not.toContain("base Pi system prompt");
    expect(context?.systemPrompt).not.toContain("coding assistant");
    expect(context?.systemPrompt).not.toContain("MCP tool");
    expect(context?.systemPrompt).not.toContain("ReAct");
    expect(context?.systemPrompt).not.toContain("Plan+Execute");
    expect(context?.systemPrompt).not.toContain("wait_until");
```

- [ ] **Step 2: Run built-extension adoption check before rebuilding**

Run:

```powershell
vitest --run tests/e2e/dev-release-adoption.test.ts
```

Expected: may fail before `npm run build` because `dist/src/extension.js` can be stale.

- [ ] **Step 3: Build and run dev check**

Run:

```powershell
npm run dev:check
```

Expected: build succeeds, then `tests/e2e/dev-release-adoption.test.ts` passes against `dist/src/extension.js`.

---

### Task 6: Full verification and roadmap refresh

**Files:**
- Modify: `ROADMAP.md`
- Commands: `npm run typecheck`, `npm test`, `npm run dev:check`

- [ ] **Step 1: Run typecheck**

Run:

```powershell
npm run typecheck
```

Expected: TypeScript exits successfully with no errors.

- [ ] **Step 2: Run unit test suite**

Run:

```powershell
npm test
```

Expected: Vitest exits successfully.

- [ ] **Step 3: Run dev-release adoption check**

Run:

```powershell
npm run dev:check
```

Expected: build succeeds and dev-release adoption test passes.

- [ ] **Step 4: Update `ROADMAP.md` closeout**

Add a dated A1 implementation-round section after the existing implementation rounds and before future phases if that keeps chronology readable, with:

```md
## Implementation round: A1 Quailbot system prompt rewrite

Date: 2026-06-09

### Delivered

- Replaced the default coding-agent identity with a Quailbot system prompt centered on quantum uncertain action-outcome instrument loops.
- Corrected the prompt transport boundary: active tools are model-visible through provider-native tool schemas, so the runtime prompt does not reconstruct `Available tools` or SDK-authored generic guideline sections. Quailbot-owned support-tool boundaries may still describe read/write/edit/bash as local support tools while keeping CLI-driver tools primary.
- Kept workspace and plan facts in the hidden `quailbot-context` message while the static prompt explains the WORKSPACE authority and action-outcome loop.

### Now known

- `before_agent_start` can return a full replacement `systemPrompt` and still return the hidden Quailbot context message.
- The prompt can be reconstructed from `BuildSystemPromptOptions` without parsing the assembled base prompt.
- A1 must treat uncertainty primarily as measurement/action-outcome uncertainty; transient instrument trouble is a secondary recovery case.

### Later phases must do differently

- Future prompt/context work must avoid leaking Pi, coding-agent identity, qspmbot memory/soul/workspace scope, or internal engineering decisions into the runtime Quailbot identity.
- If project context files or skills need to re-enter the rewritten prompt later, they need an explicit neutralization contract first.
- A2 and later instrument-operation phases should use the prompt's action -> measured outcome -> next allowed action loop as the behavioral baseline.
```

- [ ] **Step 5: Inspect final diff**

Run:

```powershell
git diff -- src tests ROADMAP.md docs/superpowers/specs docs/superpowers/plans AGENTS.md
```

Expected: diff contains only A1 prompt rewrite, tests, docs, and roadmap/memory-router updates. Do not commit unless explicitly requested.
