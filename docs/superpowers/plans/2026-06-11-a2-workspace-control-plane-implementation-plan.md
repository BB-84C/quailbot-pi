# A2 Workspace Control-Plane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build A2 as a reusable workspace control-plane substrate, then expose it through a Pi slash-command adapter that persists selection and reloads Quailbot context.

**Architecture:** Add a focused `WorkspaceService` over the existing workspace loader/state helpers. The Pi extension registers one `/quailbot-workspace` command whose subcommands call the service; local activation persists settings and calls `ctx.reload()` so `session_start` and hidden `quailbot-context` are refreshed. The service remains transport-neutral so A4 can reuse the same validation/hash/activation semantics from a future host.

**Tech Stack:** TypeScript, Node `fs`/`path`/`crypto`, Pi extension command API (`registerCommand`, `ExtensionCommandContext.reload()`), Vitest.

---

## File structure

- Create `src/workspace/workspace-service.ts`
  - Transport-neutral workspace operations: validate, load active, summarize, select, hash, atomic candidate write.
- Create `src/workspace/register-workspace-commands.ts`
  - Pi slash-command adapter for `/quailbot-workspace show|read|validate|load|write`.
- Modify `src/extension.ts`
  - Register the workspace command adapter.
  - Use the workspace service for `session_start` loading.
- Create `tests/workspace/workspace-service.test.ts`
  - Unit coverage for validation, hash stability, selection persistence, invalid preservation, atomic write behavior.
- Modify `tests/e2e/dev-release-adoption.test.ts`
  - Extend the Pi stub to capture commands.
  - Assert the command is registered.
  - Exercise `/quailbot-workspace load` through the built extension and prove settings + reload + fresh hidden context.
- Modify `ROADMAP.md`
  - After implementation only: add a round closeout for what A2 delivered and what A4 must reuse.

---

### Task 1: Add workspace service tests first

**Files:**
- Create: `tests/workspace/workspace-service.test.ts`
- Later implementation target: `src/workspace/workspace-service.ts`

- [ ] **Step 1: Write the failing service test file**

Create `tests/workspace/workspace-service.test.ts` with this content:

```ts
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  loadActiveWorkspace,
  selectWorkspace,
  validateWorkspaceCandidate,
  workspaceFileHash,
  writeWorkspaceCandidate,
} from "../../src/workspace/workspace-service.js";
import { loadLastWorkspace, settingsPath } from "../../src/workspace/workspace-state.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("workspace service", () => {
  it("validates a candidate without mutating selected workspace settings", () => {
    const cwd = makeTempDir();
    const workspacePath = writeWorkspace(cwd, "candidate.workspace.json", minimalWorkspace("nqctl"));

    const result = validateWorkspaceCandidate(workspacePath, { cwd });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected valid workspace candidate");
    }
    expect(result.selection.path).toBe(workspacePath);
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.summary.path).toBe(workspacePath);
    expect(result.summary.cli.enabled).toBe(true);
    expect(result.summary.cli.default_cli_name).toBe("nqctl");
    expect(result.summary.cli.parameter_count).toBe(1);
    expect(existsSync(settingsPath(cwd))).toBe(false);
  });

  it("returns a non-throwing validation failure for missing or malformed candidates", () => {
    const cwd = makeTempDir();
    const missing = validateWorkspaceCandidate("missing.workspace.json", { cwd });
    expect(missing).toEqual(
      expect.objectContaining({
        ok: false,
        path: join(cwd, "missing.workspace.json"),
      }),
    );
    if (missing.ok) {
      throw new Error("missing workspace unexpectedly validated");
    }
    expect(missing.error).toContain("workspace file does not exist");

    const malformedPath = writeRaw(cwd, "malformed.workspace.json", "{ not json");
    const malformed = validateWorkspaceCandidate(malformedPath, { cwd });
    expect(malformed.ok).toBe(false);
    if (malformed.ok) {
      throw new Error("malformed workspace unexpectedly validated");
    }
    expect(malformed.error.length).toBeGreaterThan(0);
  });

  it("selects a valid candidate by persisting settings and exposes active readback", () => {
    const cwd = makeTempDir();
    const workspacePath = writeWorkspace(cwd, "selected.workspace.json", minimalWorkspace("nqctl"));

    const selected = selectWorkspace(workspacePath, { cwd });

    expect(selected.ok).toBe(true);
    if (!selected.ok) {
      throw new Error("expected workspace selection to pass");
    }
    expect(loadLastWorkspace(cwd)).toBe(workspacePath);
    expect(selected.summary.source).toBe("explicit");

    const active = loadActiveWorkspace({ cwd });
    expect(active.selection.source).toBe("settings");
    expect(active.selection.path).toBe(workspacePath);
    expect(active.hash).toBe(selected.hash);
    expect(active.summary.cli.parameter_count).toBe(1);
  });

  it("does not replace the previously selected workspace when selection validation fails", () => {
    const cwd = makeTempDir();
    const originalPath = writeWorkspace(cwd, "original.workspace.json", minimalWorkspace("nqctl"));
    const badPath = writeRaw(cwd, "bad.workspace.json", JSON.stringify({ cli_params: [] }));

    const original = selectWorkspace(originalPath, { cwd });
    expect(original.ok).toBe(true);

    const rejected = selectWorkspace(badPath, { cwd });

    expect(rejected.ok).toBe(false);
    expect(loadLastWorkspace(cwd)).toBe(originalPath);
  });

  it("computes stable hashes over exact workspace file bytes", () => {
    const cwd = makeTempDir();
    const workspacePath = writeRaw(cwd, "hash.workspace.json", "{\"rois\":[],\"anchors\":[]}\n");

    expect(workspaceFileHash(workspacePath)).toBe(workspaceFileHash(workspacePath));
    writeRaw(cwd, "hash.workspace.json", "{\"rois\":[],\"anchors\":[{\"name\":\"a\"}]}\n");
    expect(workspaceFileHash(workspacePath)).not.toBe("e3b0c44298fc1c149afbf4c8996fb924");
  });

  it("atomically writes a validated candidate to a target without activating it by default", () => {
    const cwd = makeTempDir();
    const candidatePath = writeWorkspace(cwd, "candidate.workspace.json", minimalWorkspace("qctl"));
    const targetPath = join(cwd, ".quailbot-pi", "workspace.json");

    const result = writeWorkspaceCandidate({ candidatePath, targetPath, cwd });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected workspace write to pass");
    }
    expect(existsSync(targetPath)).toBe(true);
    expect(result.summary.path).toBe(targetPath);
    expect(result.summary.cli.default_cli_name).toBe("qctl");
    expect(loadLastWorkspace(cwd)).toBeUndefined();
  });

  it("does not overwrite the target when the candidate is invalid", () => {
    const cwd = makeTempDir();
    const targetPath = writeWorkspace(cwd, "target.workspace.json", minimalWorkspace("nqctl"));
    const before = readFileSync(targetPath, "utf8");
    const candidatePath = writeRaw(cwd, "bad-candidate.workspace.json", JSON.stringify({ cli_params: [] }));

    const result = writeWorkspaceCandidate({ candidatePath, targetPath, cwd });

    expect(result.ok).toBe(false);
    expect(readFileSync(targetPath, "utf8")).toBe(before);
  });
});

function minimalWorkspace(cliName: string): Record<string, unknown> {
  return {
    rois: [{ name: "current", active: true }],
    anchors: [{ name: "bias-field", active: true, linked_ROIs: ["current"] }],
    cli_params: {
      cli_name: cliName,
      enabled: true,
      parameters: {
        items: [{ name: "bias_v", readable: true, writable: true, set_cmd: { command: "set" } }],
      },
      action_commands: { items: [] },
    },
  };
}

function writeWorkspace(cwd: string, fileName: string, workspace: unknown): string {
  return writeRaw(cwd, fileName, `${JSON.stringify(workspace, null, 2)}\n`);
}

function writeRaw(cwd: string, fileName: string, content: string): string {
  const path = join(cwd, fileName);
  writeFileSync(path, content, "utf8");
  return path;
}

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "quailbot-workspace-service-"));
  tempDirs.push(dir);
  return dir;
}
```

- [ ] **Step 2: Run the test and verify it fails on missing module**

Run:

```bash
npx vitest --run tests/workspace/workspace-service.test.ts
```

Expected: failure mentioning `../../src/workspace/workspace-service.js` cannot be resolved.

- [ ] **Step 3: Commit the RED test if working in a branch**

```bash
git add tests/workspace/workspace-service.test.ts
git commit -m "test: cover workspace control-plane service"
```

---

### Task 2: Implement the workspace service

**Files:**
- Create: `src/workspace/workspace-service.ts`
- Test: `tests/workspace/workspace-service.test.ts`

- [ ] **Step 1: Implement the service**

Create `src/workspace/workspace-service.ts` with this content:

```ts
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { loadWorkspace } from "./load-workspace.js";
import type { Workspace } from "./types.js";
import { resolveWorkspaceSelection, saveLastWorkspace } from "./workspace-state.js";
import type { WorkspaceSelection } from "./workspace-state.js";

export type WorkspaceServiceOptions = {
  cwd?: string;
};

export type WorkspaceSummaryReadback = {
  path: string;
  source: WorkspaceSelection["source"] | "candidate" | "written";
  hash: string;
  active_rois: string[];
  active_anchors: string[];
  cli: {
    enabled: boolean;
    default_cli_name: string;
    parameter_count: number;
    action_count: number;
  };
};

export type WorkspaceValidationResult =
  | {
      ok: true;
      selection: WorkspaceSelection;
      workspace: Workspace;
      hash: string;
      summary: WorkspaceSummaryReadback;
    }
  | {
      ok: false;
      path: string;
      error: string;
    };

export type LoadedWorkspace = {
  selection: WorkspaceSelection;
  workspace: Workspace;
  hash: string;
  summary: WorkspaceSummaryReadback;
};

export type WorkspaceWriteResult =
  | {
      ok: true;
      candidatePath: string;
      targetPath: string;
      previousHash?: string;
      hash: string;
      workspace: Workspace;
      summary: WorkspaceSummaryReadback;
    }
  | {
      ok: false;
      candidatePath: string;
      targetPath: string;
      error: string;
    };

export function loadActiveWorkspace(options: WorkspaceServiceOptions = {}): LoadedWorkspace {
  const cwd = options.cwd ?? process.cwd();
  const selection = resolveWorkspaceSelection({ cwd });
  const workspace = loadWorkspace(selection.path);
  const hash = workspaceFileHash(selection.path);
  return {
    selection,
    workspace,
    hash,
    summary: summarizeWorkspace(workspace, hash, selection.source),
  };
}

export function validateWorkspaceCandidate(
  path: string,
  options: WorkspaceServiceOptions = {},
): WorkspaceValidationResult {
  const cwd = options.cwd ?? process.cwd();
  const selection = resolveWorkspaceSelection({ explicitPath: path, cwd });

  try {
    const workspace = loadWorkspace(selection.path);
    const hash = workspaceFileHash(selection.path);
    return {
      ok: true,
      selection,
      workspace,
      hash,
      summary: summarizeWorkspace(workspace, hash, selection.source),
    };
  } catch (error) {
    return {
      ok: false,
      path: selection.path,
      error: errorMessage(error),
    };
  }
}

export function selectWorkspace(path: string, options: WorkspaceServiceOptions = {}): WorkspaceValidationResult {
  const cwd = options.cwd ?? process.cwd();
  const validation = validateWorkspaceCandidate(path, { cwd });
  if (!validation.ok) {
    return validation;
  }

  saveLastWorkspace(validation.selection.path, cwd);
  return validation;
}

export function writeWorkspaceCandidate(options: {
  candidatePath: string;
  targetPath: string;
  cwd?: string;
}): WorkspaceWriteResult {
  const cwd = options.cwd ?? process.cwd();
  const candidatePath = resolve(cwd, options.candidatePath);
  const targetPath = resolve(cwd, options.targetPath);
  const candidate = validateWorkspaceCandidate(candidatePath, { cwd });

  if (!candidate.ok) {
    return {
      ok: false,
      candidatePath,
      targetPath,
      error: candidate.error,
    };
  }

  const previousHash = existsSync(targetPath) ? workspaceFileHash(targetPath) : undefined;
  const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;

  try {
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(tempPath, readFileSync(candidatePath, "utf8"), "utf8");
    const writtenWorkspace = loadWorkspace(tempPath);
    renameSync(tempPath, targetPath);
    const workspace = loadWorkspace(targetPath);
    const hash = workspaceFileHash(targetPath);

    return {
      ok: true,
      candidatePath,
      targetPath,
      previousHash,
      hash,
      workspace,
      summary: summarizeWorkspace(workspace, hash, "written"),
    };
  } catch (error) {
    rmSync(tempPath, { force: true });
    return {
      ok: false,
      candidatePath,
      targetPath,
      error: errorMessage(error),
    };
  }
}

export function workspaceFileHash(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function summarizeWorkspace(
  workspace: Workspace,
  hash = workspaceFileHash(workspace.sourcePath),
  source: WorkspaceSummaryReadback["source"] = "candidate",
): WorkspaceSummaryReadback {
  return {
    path: workspace.sourcePath,
    source,
    hash,
    active_rois: workspace.rois.filter((roi) => roi.active).map((roi) => roi.name ?? roi.ref),
    active_anchors: workspace.anchors.filter((anchor) => anchor.active).map((anchor) => anchor.name ?? anchor.ref),
    cli: {
      enabled: workspace.cli.enabled,
      default_cli_name: workspace.cli.defaultCliName,
      parameter_count: workspace.cli.parameters.size,
      action_count: workspace.cli.actions.size,
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
```

- [ ] **Step 2: Run the service test and verify it passes**

Run:

```bash
npx vitest --run tests/workspace/workspace-service.test.ts
```

Expected: all tests in `workspace-service.test.ts` pass.

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: `tsc --noEmit` exits successfully.

- [ ] **Step 4: Commit the GREEN service implementation**

```bash
git add src/workspace/workspace-service.ts tests/workspace/workspace-service.test.ts
git commit -m "feat: add workspace control-plane service"
```

---

### Task 3: Add Pi workspace command tests

**Files:**
- Modify: `tests/e2e/dev-release-adoption.test.ts`
- Later implementation target: `src/workspace/register-workspace-commands.ts`, `src/extension.ts`

- [ ] **Step 1: Extend the built-extension Pi stub to capture commands**

In `tests/e2e/dev-release-adoption.test.ts`, change the command-related local types near the top to:

```ts
type PiEventName = "session_start" | "before_agent_start" | string;
type PiHandler = ExtensionHandler<any, any>;
type RegisteredTool = { name: string };
type RegisteredCommand = {
  name: string;
  description?: string;
  handler: (args: string, ctx: ExtensionContext & { reload: () => Promise<void> }) => Promise<void>;
};
```

Replace `loadBuiltExtensionWithPiStub()` with this version:

```ts
async function loadBuiltExtensionWithPiStub(): Promise<{
  handlers: Map<PiEventName, PiHandler>;
  tools: RegisteredTool[];
  commands: RegisteredCommand[];
}> {
  const extensionPath = join(root, "dist", "src", "extension.js");
  const extensionModule = await import(`${pathToFileURL(extensionPath).href}?cacheBust=${Date.now()}`);
  const handlers = new Map<PiEventName, PiHandler>();
  const tools: RegisteredTool[] = [];
  const commands: RegisteredCommand[] = [];

  extensionModule.default({
    on(event: PiEventName, handler: PiHandler) {
      handlers.set(event, handler);
    },
    registerTool(tool: RegisteredTool) {
      tools.push(tool);
    },
    registerCommand(name: string, options: Omit<RegisteredCommand, "name">) {
      commands.push({ name, ...options });
    },
  });

  return { handlers, tools, commands };
}
```

Add this helper below `createExtensionContextStub`:

```ts
function createCommandContextStub(cwd: string): ExtensionContext & {
  reload: () => Promise<void>;
  notifications: string[];
  reloads: number;
} {
  const notifications: string[] = [];
  let reloads = 0;
  const context = createExtensionContextStub(cwd) as ExtensionContext & {
    reload: () => Promise<void>;
    notifications: string[];
    reloads: number;
  };

  context.ui.notify = (message: string) => {
    notifications.push(message);
  };
  context.reload = async () => {
    reloads += 1;
  };
  Object.defineProperty(context, "notifications", { get: () => notifications });
  Object.defineProperty(context, "reloads", { get: () => reloads });

  return context;
}
```

- [ ] **Step 2: Update the existing registration assertion**

Replace the test named `registers deterministic handlers and product-agnostic tools from the built extension` with:

```ts
it("registers deterministic handlers, commands, and product-agnostic tools from the built extension", async () => {
  const { handlers, tools, commands } = await loadBuiltExtensionWithPiStub();

  expect([...handlers.keys()].sort(compareNames)).toEqual(["before_agent_start", "session_start"]);
  expect(tools.map((tool) => tool.name).sort(compareExpectedToolNames)).toEqual(expectedToolNames);
  expect(commands.map((command) => command.name)).toEqual(["quailbot-workspace"]);
});
```

- [ ] **Step 3: Add a failing command semantic test**

Add this test after the existing hidden-context lifecycle test:

```ts
it("switches workspace through the command adapter, persists settings, reloads, and refreshes hidden context", async () => {
  const tempCwd = makeTempDir();
  const candidatePath = join(tempCwd, "candidate.workspace.json");
  copyFileSync(join(root, "tests", "workspaces", "nanonis-minimal.workspace.json"), candidatePath);

  const { commands, handlers } = await loadBuiltExtensionWithPiStub();
  const workspaceCommand = commands.find((command) => command.name === "quailbot-workspace");
  expect(workspaceCommand).toBeDefined();
  if (!workspaceCommand) {
    throw new Error("workspace command was not registered");
  }

  const commandContext = createCommandContextStub(tempCwd);
  await workspaceCommand.handler(`load "${candidatePath}"`, commandContext);

  expect(commandContext.reloads).toBe(1);
  expect(commandContext.notifications.join("\n")).toContain("workspace selected");

  const savedSettings = readJson(join(tempCwd, ".quailbot-pi", "settings.json"));
  expect(savedSettings.workspace).toBe(candidatePath);

  const extensionContext = createExtensionContextStub(tempCwd);
  const sessionStartEvent = { type: "session_start", reason: "startup" } satisfies SessionStartEvent;
  const systemPromptOptions = { cwd: tempCwd } satisfies BuildSystemPromptOptions;
  const beforeAgentStartEvent = {
    type: "before_agent_start",
    prompt: "read the switched Quailbot workspace",
    systemPrompt: "base Pi system prompt",
    systemPromptOptions,
  } satisfies BeforeAgentStartEvent;

  handlers.get("session_start")?.(sessionStartEvent, extensionContext);
  const context = await handlers.get("before_agent_start")?.(beforeAgentStartEvent, extensionContext);
  const content = context?.message?.content;
  expect(typeof content).toBe("string");
  if (typeof content !== "string") {
    throw new Error("before_agent_start did not return string hidden context content");
  }
  expect(content).toContain(candidatePath);
  expect(content).toContain("nqctl:zctrl_setpnt");
});
```

Add this invalid-selection test immediately after it:

```ts
it("rejects invalid workspace command candidates without replacing the previous settings", async () => {
  const tempCwd = makeTempDir();
  const validPath = join(tempCwd, "valid.workspace.json");
  const invalidPath = join(tempCwd, "invalid.workspace.json");
  copyFileSync(join(root, "tests", "workspaces", "nanonis-minimal.workspace.json"), validPath);
  writeFileSync(invalidPath, JSON.stringify({ cli_params: [] }), "utf8");

  const { commands } = await loadBuiltExtensionWithPiStub();
  const workspaceCommand = commands.find((command) => command.name === "quailbot-workspace");
  expect(workspaceCommand).toBeDefined();
  if (!workspaceCommand) {
    throw new Error("workspace command was not registered");
  }

  const commandContext = createCommandContextStub(tempCwd);
  await workspaceCommand.handler(`load "${validPath}"`, commandContext);
  expect(readJson(join(tempCwd, ".quailbot-pi", "settings.json")).workspace).toBe(validPath);

  await workspaceCommand.handler(`load "${invalidPath}"`, commandContext);
  expect(readJson(join(tempCwd, ".quailbot-pi", "settings.json")).workspace).toBe(validPath);
  expect(commandContext.reloads).toBe(1);
  expect(commandContext.notifications.join("\n")).toContain("workspace validation failed");
});
```

- [ ] **Step 4: Run the E2E adoption test and verify it fails on missing command registration**

Run:

```bash
npm run dev:release && npx vitest --run tests/e2e/dev-release-adoption.test.ts
```

Expected: failure because `commands.map(...)` is empty or `/quailbot-workspace` is not registered.

- [ ] **Step 5: Commit the RED command tests if working in a branch**

```bash
git add tests/e2e/dev-release-adoption.test.ts
git commit -m "test: cover workspace command adapter"
```

---

### Task 4: Implement the Pi workspace command adapter

**Files:**
- Create: `src/workspace/register-workspace-commands.ts`
- Modify: `src/extension.ts`
- Test: `tests/e2e/dev-release-adoption.test.ts`

- [ ] **Step 1: Add the command adapter module**

Create `src/workspace/register-workspace-commands.ts` with this content:

```ts
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import type { QuailbotRuntime } from "../extension.js";
import {
  loadActiveWorkspace,
  selectWorkspace,
  summarizeWorkspace,
  validateWorkspaceCandidate,
  writeWorkspaceCandidate,
} from "./workspace-service.js";

export function registerWorkspaceCommands(pi: ExtensionAPI, runtime: QuailbotRuntime): void {
  pi.registerCommand("quailbot-workspace", {
    description: "Show, validate, select, or write the active Quailbot workspace",
    getArgumentCompletions(prefix) {
      const commands = ["show", "read", "validate", "load", "write"];
      const matches = commands.filter((command) => command.startsWith(prefix.trim()));
      return matches.map((command) => ({ value: command, label: command }));
    },
    async handler(args, ctx) {
      await handleWorkspaceCommand(args, ctx, runtime);
    },
  });
}

async function handleWorkspaceCommand(
  args: string,
  ctx: ExtensionCommandContext,
  runtime: QuailbotRuntime,
): Promise<void> {
  const [command = "show", ...rest] = splitCommandArgs(args);

  switch (command) {
    case "show":
    case "read": {
      if (runtime.workspace) {
        notifyJson(ctx, "Quailbot active workspace", summarizeWorkspace(runtime.workspace));
        return;
      }

      try {
        const active = loadActiveWorkspace({ cwd: ctx.cwd });
        notifyJson(ctx, "Quailbot active workspace", active.summary);
      } catch (error) {
        ctx.ui.notify(`Quailbot workspace unavailable: ${errorMessage(error)}`, "warning");
      }
      return;
    }

    case "validate": {
      const [path] = rest;
      if (!path) {
        ctx.ui.notify("usage: /quailbot-workspace validate <workspace-path>", "warning");
        return;
      }
      const validation = validateWorkspaceCandidate(path, { cwd: ctx.cwd });
      if (!validation.ok) {
        ctx.ui.notify(`workspace validation failed: ${validation.error}`, "warning");
        return;
      }
      notifyJson(ctx, "workspace validation passed", validation.summary);
      return;
    }

    case "load": {
      const [path] = rest;
      if (!path) {
        ctx.ui.notify("usage: /quailbot-workspace load <workspace-path>", "warning");
        return;
      }
      const selection = selectWorkspace(path, { cwd: ctx.cwd });
      if (!selection.ok) {
        ctx.ui.notify(`workspace validation failed: ${selection.error}`, "warning");
        return;
      }
      ctx.ui.notify(`workspace selected: ${selection.summary.path}\nsha256: ${selection.hash}\nreloading Quailbot context`, "info");
      await ctx.reload();
      return;
    }

    case "write": {
      const [candidatePath, targetPath, flag] = rest;
      if (!candidatePath || !targetPath) {
        ctx.ui.notify("usage: /quailbot-workspace write <candidate-path> <target-path> [--activate]", "warning");
        return;
      }
      const result = writeWorkspaceCandidate({ candidatePath, targetPath, cwd: ctx.cwd });
      if (!result.ok) {
        ctx.ui.notify(`workspace write failed: ${result.error}`, "warning");
        return;
      }
      if (flag === "--activate") {
        const selected = selectWorkspace(result.targetPath, { cwd: ctx.cwd });
        if (!selected.ok) {
          ctx.ui.notify(`workspace write succeeded but activation failed: ${selected.error}`, "warning");
          return;
        }
        ctx.ui.notify(`workspace written and selected: ${result.targetPath}\nsha256: ${result.hash}\nreloading Quailbot context`, "info");
        await ctx.reload();
        return;
      }
      notifyJson(ctx, "workspace written", result.summary);
      return;
    }

    default:
      ctx.ui.notify(
        `unknown workspace command: ${command}\nusage: /quailbot-workspace show|read|validate|load|write`,
        "warning",
      );
  }
}

function notifyJson(ctx: ExtensionCommandContext, title: string, value: unknown): void {
  ctx.ui.notify(`${title}\n${JSON.stringify(value, null, 2)}`, "info");
}

function splitCommandArgs(input: string): string[] {
  const result: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;

  for (const char of input.trim()) {
    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === " " || char === "\t") {
      if (current.length > 0) {
        result.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    result.push(current);
  }

  return result;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
```

- [ ] **Step 2: Wire the adapter into the extension and use the service for session start**

In `src/extension.ts`, add imports:

```ts
import { registerWorkspaceCommands } from "./workspace/register-workspace-commands.js";
import { loadActiveWorkspace } from "./workspace/workspace-service.js";
```

Remove these imports:

```ts
import { loadWorkspace } from "./workspace/load-workspace.js";
import { resolveWorkspaceSelection } from "./workspace/workspace-state.js";
```

Then update `quailbotExtension` to register commands and use the service:

```ts
  registerQuailbotTools(pi, runtime);
  registerWorkspaceCommands(pi, runtime);

  pi.on("session_start", (_event, ctx) => {
    runtime.planStore.clear();

    try {
      runtime.workspace = loadActiveWorkspace({ cwd: ctx.cwd }).workspace;
    } catch (error) {
      runtime.workspace = undefined;
      notifyWarning(ctx, `Quailbot workspace unavailable: ${errorMessage(error)}`);
    }
  });
```

- [ ] **Step 3: Run the E2E adoption test and verify it passes**

Run:

```bash
npm run dev:release && npx vitest --run tests/e2e/dev-release-adoption.test.ts
```

Expected: all tests in `dev-release-adoption.test.ts` pass.

- [ ] **Step 4: Run command-adjacent unit tests**

Run:

```bash
npx vitest --run tests/workspace/workspace-service.test.ts tests/prompt/workspace-summary.test.ts tests/e2e/dev-release-adoption.test.ts
```

Expected: all listed tests pass.

- [ ] **Step 5: Commit the command adapter implementation**

```bash
git add src/extension.ts src/workspace/register-workspace-commands.ts tests/e2e/dev-release-adoption.test.ts
git commit -m "feat: add workspace command adapter"
```

---

### Task 5: Full verification and roadmap closeout

**Files:**
- Modify: `ROADMAP.md`
- Verify: full package checks

- [ ] **Step 1: Run full verification**

Run:

```bash
npm run typecheck && npm test && npm run dev:check && git diff --check
```

Expected:

```text
typecheck exits 0
all Vitest files pass
dev:check exits 0
git diff --check exits 0
```

- [ ] **Step 2: Add A2 implementation round closeout to ROADMAP**

Append this section after the A1 implementation round and before `Future investigation phases`:

```md
## Implementation round: A2 workspace control-plane substrate

Date: 2026-06-11

### Delivered

- Added a transport-neutral workspace service for validation, selection, readback summary, SHA-256 revision metadata, and atomic candidate writes.
- Added the `/quailbot-workspace` Pi command adapter for show/read, validate, load, and write operations.
- Kept local activation reload-driven: workspace selection persists to settings and then requests Pi reload so `session_start` and hidden `quailbot-context` refresh from the selected workspace.
- Added service and built-extension tests proving invalid candidates do not replace the selected workspace and command-driven selection refreshes hidden workspace context.

### Now known

- Workspace selection can be represented as a reusable control-plane service instead of a TUI-only picker.
- Pi command handlers can call `ctx.reload()`, while tool handlers cannot; reload-triggering workspace activation belongs in the command adapter.
- Workspace revision metadata can be computed from workspace file bytes and carried forward into A4 job-binding design.

### Later phases must do differently

- A3 calibration/editing must call the A2 workspace service rather than writing its own workspace activation path.
- A4 remote host must reuse the A2 validation/hash/activation semantics and add host-side auth, job queue, cancellation, supervisor policy, and durable experiment evidence around them.
- A2A remains deferred as a possible peer-agent facade; it is not the core host/workspace API.
```

- [ ] **Step 3: Run full verification again after roadmap update**

Run:

```bash
npm run typecheck && npm test && npm run dev:check && git diff --check
```

Expected: same successful result as Step 1.

- [ ] **Step 4: Commit closeout docs**

```bash
git add ROADMAP.md
git commit -m "docs: close out A2 workspace control plane"
```

- [ ] **Step 5: Final status check**

Run:

```bash
git status --short
git log --oneline -5
```

Expected:

```text
git status --short is empty
latest commits include A2 service, command adapter, and roadmap closeout
```

---

## Plan self-review checklist

- Spec coverage: service substrate, Pi adapter, reload contract, hash/revision, invalid-preservation, atomic write, and A2A deferral are each covered by a task.
- Scope control: no remote host, MCP client, A2A server, auth system, queue, or calibration UI is implemented in this plan.
- Semantic proof: command-level test proves settings persistence, reload request, and fresh hidden context after `session_start`.
- Type consistency: service result types are reused by commands; command handler returns `Promise<void>` as required by Pi `RegisteredCommand`.
