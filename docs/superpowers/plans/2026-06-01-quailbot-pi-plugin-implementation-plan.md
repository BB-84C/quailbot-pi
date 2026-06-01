# Quailbot Pi Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Quailbot successor as a Pi plugin with fixed tools, real workspace loading, driver-agnostic CLI execution, linked-observable readback, plan tools, and bridge-driven semantic E2E tests.

**Architecture:** Product code lives in package-style TypeScript under `src/`; OpenCode RPC bridge, Pi runner, task packets, and dummy cryo driver stay in `.opencode/artifacts/...` as construction scaffolding. The Pi extension registers fixed tools from `src/tools/`, injects workspace summaries into context, validates all instrument operations against the active workspace, and returns linked-observable observations separately from primary tool results.

**Tech Stack:** Node 24+, TypeScript, Vitest, `@earendil-works/pi-coding-agent@0.74.2`, Pi extension API, `typebox`, repo-local OpenCode artifact scaffold for semantic E2E.

---

## File structure map

Create or modify these tracked product files:

```text
package.json
tsconfig.json
vitest.config.ts
src/extension.ts
src/index.ts
src/workspace/types.ts
src/workspace/load-workspace.ts
src/workspace/workspace-state.ts
src/prompt/workspace-summary.ts
src/prompt/plan-context.ts
src/cli/cli-driver.ts
src/linked-observables/resolve-linked-observables.ts
src/linked-observables/read-linked-observables.ts
src/tools/tool-context.ts
src/tools/tool-result.ts
src/tools/register-tools.ts
src/tools/cli_get.ts
src/tools/cli_set.ts
src/tools/cli_ramp.ts
src/tools/cli_action.ts
src/tools/sleep_seconds.ts
src/tools/observe.ts
src/tools/click_anchor.ts
src/tools/set_field.ts
src/tools/quailbot_planwrite.ts
src/tools/quailbot_plan_and_execute.ts
tests/workspace/load-workspace.test.ts
tests/prompt/workspace-summary.test.ts
tests/tools/cli-tools.test.ts
tests/linked-observables/resolve-linked-observables.test.ts
tests/linked-observables/read-linked-observables.test.ts
tests/tools/quailbot-planwrite.test.ts
tests/tools/quailbot-plan-and-execute.test.ts
tests/e2e/semantic-e2e.test.ts
```

Construction-only files under `.opencode/artifacts/...` may be created or changed by implementation workers, but must not be tracked as product code:

```text
.opencode/artifacts/pi-rpc-bridge/scaffold/run-pi.mjs
.opencode/artifacts/pi-rpc-bridge/scaffold/pi-rpc-bridge.mjs
.opencode/artifacts/pi-rpc-bridge/scaffold/pi-rpc-client.mjs
.opencode/artifacts/quailbot-pi-e2e/tasks/*.md
.opencode/artifacts/quailbot-pi-e2e/jobs/*
.opencode/artifacts/quailbot-pi-e2e/dummy-cryocli/*
```

Do not create `fixtures/workspaces/`. Test workspace JSON files must either live under `tests/workspaces/` and load through the product workspace resolver, or be written into `.opencode/artifacts/...` by semantic E2E setup and then loaded through the same resolver.

---

### Task 1: Product boundary and TypeScript test harness

**Files:**
- Modify: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Delete from tracked product tree: `scripts/run-pi.mjs`
- Create construction copy if needed: `.opencode/artifacts/pi-rpc-bridge/scaffold/run-pi.mjs`

- [ ] **Step 1: Write the product-boundary verification test**

Create `tests/product-boundary.test.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("product boundary", () => {
  it("does not track the OpenCode Pi runner as product code", () => {
    expect(existsSync(join(root, "scripts", "run-pi.mjs"))).toBe(false);
  });

  it("keeps package scripts focused on product tests and build", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(pkg.scripts.pi).toBeUndefined();
    expect(pkg.scripts.test).toBe("vitest --run");
    expect(pkg.scripts.typecheck).toBe("tsc --noEmit");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
npx vitest --run tests/product-boundary.test.ts
```

Expected before implementation: failure because Vitest is not configured and/or `scripts/run-pi.mjs` still exists.

- [ ] **Step 3: Update package scripts and dev dependencies**

Modify `package.json` to this script/dev-dependency shape while preserving existing package metadata and `@earendil-works/pi-coding-agent` dependency:

```json
{
  "scripts": {
    "test": "vitest --run",
    "typecheck": "tsc --noEmit",
    "build": "tsc -p tsconfig.json",
    "test:e2e": "vitest --run tests/e2e/semantic-e2e.test.ts"
  },
  "devDependencies": {
    "@types/node": "^24.3.0",
    "typescript": "^5.7.3",
    "vitest": "^3.2.4"
  }
}
```

If dev dependencies are absent from `package-lock.json`, run:

```powershell
npm install --save-dev typescript@^5.7.3 vitest@^3.2.4 @types/node@^24.3.0
```

- [ ] **Step 4: Add TypeScript configuration**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": ".",
    "types": ["node", "vitest"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"],
  "exclude": ["node_modules", "dist", ".opencode", ".pi-state"]
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
```

- [ ] **Step 5: Move Pi runner out of tracked product code**

Copy the current `scripts/run-pi.mjs` content into `.opencode/artifacts/pi-rpc-bridge/scaffold/run-pi.mjs` for internal bridge use, then remove tracked `scripts/run-pi.mjs`. Leave `.opencode/` ignored.

- [ ] **Step 6: Run product-boundary test**

Run:

```powershell
npm test -- tests/product-boundary.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit product-boundary setup**

Run:

```powershell
git add package.json package-lock.json tsconfig.json vitest.config.ts tests/product-boundary.test.ts
git rm scripts/run-pi.mjs
git commit -m "chore: set up plugin TypeScript harness"
```

---

### Task 2: Workspace model and real resolver

**Files:**
- Create: `src/workspace/types.ts`
- Create: `src/workspace/load-workspace.ts`
- Create: `src/workspace/workspace-state.ts`
- Create: `tests/workspace/load-workspace.test.ts`
- Create: `tests/workspaces/nanonis-minimal.workspace.json`

- [ ] **Step 1: Write failing workspace loader tests**

Create `tests/workspaces/nanonis-minimal.workspace.json`:

```json
{
  "rois": [],
  "anchors": [],
  "cli_params": {
    "cli_name": "nqctl",
    "enabled": true,
    "parameters": {
      "items": [
        {
          "name": "zctrl_setpnt",
          "label": "Z Controller Setpoint",
          "description": "STM Z controller current setpoint.",
          "readable": true,
          "writable": true,
          "has_ramp": false,
          "enabled": true,
          "linked_observables": ["current"],
          "get_cmd": { "command": "ZCtrl_SetpntGet" },
          "set_cmd": {
            "command": "ZCtrl_SetpntSet",
            "arg_fields": [{ "name": "setpoint", "required": true }]
          },
          "safety": { "ramp_enabled": false },
          "actions": { "get": true, "set": true, "ramp": false }
        },
        {
          "name": "current",
          "label": "Current",
          "description": "Measured tunneling current.",
          "readable": true,
          "writable": false,
          "enabled": true,
          "get_cmd": { "command": "Current_Get" },
          "actions": { "get": true, "set": false, "ramp": false }
        }
      ]
    },
    "action_commands": {
      "items": [
        {
          "name": "Scan_Action",
          "description": "Start or stop scan.",
          "enabled": true,
          "safety_mode": "guarded",
          "linked_observables": ["scan_status", "scan_buffer", "scan_speed"],
          "action_cmd": { "command": "Scan_Action", "arg_fields": [{ "name": "action", "required": true }] }
        }
      ]
    }
  }
}
```

Create `tests/workspace/load-workspace.test.ts`:

```ts
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadWorkspace } from "../../src/workspace/load-workspace.js";

describe("loadWorkspace", () => {
  it("loads cli_params from a real workspace JSON path", () => {
    const workspace = loadWorkspace(join(process.cwd(), "tests/workspaces/nanonis-minimal.workspace.json"));
    expect(workspace.sourcePath.endsWith("nanonis-minimal.workspace.json")).toBe(true);
    expect(workspace.cli.enabled).toBe(true);
    expect(workspace.cli.defaultCliName).toBe("nqctl");
    expect(workspace.cli.parameters.get("nqctl:zctrl_setpnt")?.linkedObservables).toEqual(["current"]);
    expect(workspace.cli.actions.get("nqctl:Scan_Action")?.linkedObservables).toEqual([
      "scan_status",
      "scan_buffer",
      "scan_speed",
    ]);
  });

  it("rejects missing workspace files with a clear error", () => {
    expect(() => loadWorkspace(join(process.cwd(), "tests/workspaces/missing.workspace.json"))).toThrow(
      /workspace file does not exist/,
    );
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```powershell
npm test -- tests/workspace/load-workspace.test.ts
```

Expected: fail because `src/workspace/load-workspace.ts` does not exist.

- [ ] **Step 3: Implement workspace types**

Create `src/workspace/types.ts`:

```ts
export type CliActionPermissions = {
  get: boolean;
  set: boolean;
  ramp: boolean;
};

export type CliParameter = {
  name: string;
  cliName: string;
  ref: string;
  label: string;
  description: string;
  enabled: boolean;
  actions: CliActionPermissions;
  linkedObservables: string[];
  schema: Record<string, unknown>;
};

export type CliAction = {
  name: string;
  cliName: string;
  ref: string;
  description: string;
  enabled: boolean;
  safetyMode: "alwaysAllowed" | "guarded" | "blocked" | string;
  linkedObservables: string[];
  actionCmd: Record<string, unknown>;
};

export type WorkspaceRoi = {
  name: string;
  description: string;
  active: boolean;
};

export type WorkspaceAnchor = {
  name: string;
  description: string;
  active: boolean;
  linkedObservables: string[];
};

export type Workspace = {
  sourcePath: string;
  rois: WorkspaceRoi[];
  anchors: WorkspaceAnchor[];
  cli: {
    enabled: boolean;
    defaultCliName: string;
    parameters: Map<string, CliParameter>;
    actions: Map<string, CliAction>;
  };
};
```

- [ ] **Step 4: Implement workspace loader**

Create `src/workspace/load-workspace.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CliAction, CliParameter, Workspace, WorkspaceAnchor, WorkspaceRoi } from "./types.js";

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
}

function cliRef(cliName: string, name: string): string {
  return `${cliName || "cli"}:${name}`;
}

function itemArray(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== "object") return [];
  const raw = value as Record<string, unknown>;
  const items = raw.items;
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => asRecord(item, `items[${index}]`));
}

function parseActions(raw: Record<string, unknown>): { get: boolean; set: boolean; ramp: boolean } {
  const explicit = raw.actions && typeof raw.actions === "object" ? (raw.actions as Record<string, unknown>) : {};
  const readable = asBoolean(raw.readable, false);
  const writable = asBoolean(raw.writable, false);
  const hasRamp = asBoolean(raw.has_ramp, false);
  const safety = raw.safety && typeof raw.safety === "object" ? (raw.safety as Record<string, unknown>) : {};
  return {
    get: asBoolean(explicit.get, readable),
    set: asBoolean(explicit.set, writable && raw.set_cmd !== undefined),
    ramp: asBoolean(explicit.ramp, writable && hasRamp && asBoolean(safety.ramp_enabled, false)),
  };
}

export function loadWorkspace(path: string): Workspace {
  const sourcePath = resolve(path);
  if (!existsSync(sourcePath)) throw new Error(`workspace file does not exist: ${sourcePath}`);
  const raw = asRecord(JSON.parse(readFileSync(sourcePath, "utf8")), "workspace");
  const body = raw.GUI && typeof raw.GUI === "object" && !Array.isArray(raw.GUI) ? (raw.GUI as Record<string, unknown>) : raw;

  const rois: WorkspaceRoi[] = Array.isArray(body.rois)
    ? body.rois.map((item, index) => {
        const r = asRecord(item, `rois[${index}]`);
        return { name: asString(r.name), description: asString(r.description), active: asBoolean(r.active, true) };
      })
    : [];

  const anchors: WorkspaceAnchor[] = Array.isArray(body.anchors)
    ? body.anchors.map((item, index) => {
        const a = asRecord(item, `anchors[${index}]`);
        return {
          name: asString(a.name),
          description: asString(a.description),
          active: asBoolean(a.active, true),
          linkedObservables: stringArray(a.linked_observables ?? a.linked_ROIs),
        };
      })
    : [];

  const cliParams = asRecord(body.cli_params ?? {}, "cli_params");
  const defaultCliName = asString(cliParams.cli_name ?? cliParams.CLI_Name, "cli");
  const cliEnabled = asBoolean(cliParams.enabled, Boolean(body.cli_params));
  const parameters = new Map<string, CliParameter>();
  const actions = new Map<string, CliAction>();

  for (const rawParam of itemArray((cliParams.parameters as Record<string, unknown> | undefined) ?? {})) {
    const name = asString(rawParam.name);
    if (!name) throw new Error("cli parameter item is missing name");
    const cliName = asString(rawParam.cli_name ?? rawParam.CLI_Name, defaultCliName);
    const ref = cliRef(cliName, name);
    parameters.set(ref, {
      name,
      cliName,
      ref,
      label: asString(rawParam.label),
      description: asString(rawParam.description),
      enabled: asBoolean(rawParam.enabled, true),
      actions: parseActions(rawParam),
      linkedObservables: stringArray(rawParam.linked_observables ?? rawParam.linked_ROIs),
      schema: { ...rawParam },
    });
  }

  for (const rawAction of itemArray((cliParams.action_commands as Record<string, unknown> | undefined) ?? {})) {
    const name = asString(rawAction.name);
    if (!name) throw new Error("cli action item is missing name");
    const cliName = asString(rawAction.cli_name ?? rawAction.CLI_Name, defaultCliName);
    const ref = cliRef(cliName, name);
    actions.set(ref, {
      name,
      cliName,
      ref,
      description: asString(rawAction.description),
      enabled: asBoolean(rawAction.enabled, true),
      safetyMode: asString(rawAction.safety_mode, "guarded"),
      linkedObservables: stringArray(rawAction.linked_observables ?? rawAction.linked_ROIs),
      actionCmd: rawAction.action_cmd && typeof rawAction.action_cmd === "object" ? { ...(rawAction.action_cmd as Record<string, unknown>) } : {},
    });
  }

  return { sourcePath, rois, anchors, cli: { enabled: cliEnabled, defaultCliName, parameters, actions } };
}
```

- [ ] **Step 5: Implement workspace selection state**

Create `src/workspace/workspace-state.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export type WorkspaceSelection = { path: string; source: "explicit" | "settings" | "starter" };

export function quailbotStateRoot(cwd = process.cwd()): string {
  return resolve(cwd, ".quailbot-pi");
}

export function settingsPath(cwd = process.cwd()): string {
  return join(quailbotStateRoot(cwd), "settings.json");
}

export function starterWorkspacePath(cwd = process.cwd()): string {
  return join(quailbotStateRoot(cwd), "workspace.json");
}

export function saveLastWorkspace(path: string, cwd = process.cwd()): void {
  const target = settingsPath(cwd);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify({ workspace: resolve(path) }, null, 2), "utf8");
}

export function loadLastWorkspace(cwd = process.cwd()): string | undefined {
  const target = settingsPath(cwd);
  if (!existsSync(target)) return undefined;
  const raw = JSON.parse(readFileSync(target, "utf8"));
  return typeof raw.workspace === "string" && raw.workspace.trim() ? resolve(raw.workspace) : undefined;
}

export function resolveWorkspaceSelection(options: { explicitPath?: string; cwd?: string } = {}): WorkspaceSelection {
  const cwd = options.cwd ?? process.cwd();
  if (options.explicitPath) return { path: resolve(options.explicitPath), source: "explicit" };
  const last = loadLastWorkspace(cwd);
  if (last) return { path: last, source: "settings" };
  return { path: starterWorkspacePath(cwd), source: "starter" };
}
```

- [ ] **Step 6: Run workspace tests**

Run:

```powershell
npm test -- tests/workspace/load-workspace.test.ts
npm run typecheck
```

Expected: both pass.

- [ ] **Step 7: Commit workspace loader**

Run:

```powershell
git add src/workspace tests/workspace tests/workspaces
git commit -m "feat: load real Quailbot workspaces"
```

---

### Task 3: Workspace summary and Pi context injection

**Files:**
- Create: `src/prompt/workspace-summary.ts`
- Create: `src/prompt/plan-context.ts`
- Create: `src/extension.ts`
- Create: `src/index.ts`
- Create: `tests/prompt/workspace-summary.test.ts`

- [ ] **Step 1: Write failing workspace summary test**

Create `tests/prompt/workspace-summary.test.ts`:

```ts
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadWorkspace } from "../../src/workspace/load-workspace.js";
import { buildWorkspaceSummary, buildWorkspaceContextText } from "../../src/prompt/workspace-summary.js";

describe("workspace summary", () => {
  it("summarizes enabled CLI parameters/actions for model-visible context", () => {
    const workspace = loadWorkspace(join(process.cwd(), "tests/workspaces/nanonis-minimal.workspace.json"));
    const summary = buildWorkspaceSummary(workspace);
    expect(summary.cli.enabledParameters[0]).toMatchObject({
      name: "current",
      cli_name: "nqctl",
      ref: "nqctl:current",
    });
    expect(summary.cli.enabledActions[0]).toMatchObject({
      name: "Scan_Action",
      cli_name: "nqctl",
      linked_observables: ["scan_status", "scan_buffer", "scan_speed"],
    });
    expect(summary.cli.actionsAvailable.cli_get).toBe(true);
    expect(summary.cli.actionsAvailable.cli_set).toBe(true);
  });

  it("renders a stable WORKSPACE block", () => {
    const workspace = loadWorkspace(join(process.cwd(), "tests/workspaces/nanonis-minimal.workspace.json"));
    const text = buildWorkspaceContextText(workspace);
    expect(text).toContain("WORKSPACE (Quailbot active workspace)");
    expect(text).toContain("nqctl:zctrl_setpnt");
    expect(text).toContain("linked_observables");
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```powershell
npm test -- tests/prompt/workspace-summary.test.ts
```

Expected: fail because `workspace-summary.ts` does not exist.

- [ ] **Step 3: Implement workspace summary renderer**

Create `src/prompt/workspace-summary.ts`:

```ts
import type { Workspace } from "../workspace/types.js";

export type WorkspaceSummary = {
  workspace_path: string;
  rois: { name: string; description: string }[];
  anchors: { name: string; description: string; linked_observables: string[] }[];
  cli: {
    enabled: boolean;
    enabledParameters: Record<string, unknown>[];
    enabledActions: Record<string, unknown>[];
    actionsAvailable: { cli_get: boolean; cli_set: boolean; cli_ramp: boolean; cli_action: boolean };
  };
};

export function buildWorkspaceSummary(workspace: Workspace): WorkspaceSummary {
  const enabledParameters = [...workspace.cli.parameters.values()]
    .filter((p) => p.enabled)
    .sort((a, b) => a.ref.localeCompare(b.ref))
    .map((p) => ({
      name: p.name,
      cli_name: p.cliName,
      ref: p.ref,
      description: p.description,
      schema: p.schema,
      linked_observables: p.linkedObservables,
    }));
  const enabledActions = [...workspace.cli.actions.values()]
    .filter((a) => a.enabled)
    .sort((a, b) => a.ref.localeCompare(b.ref))
    .map((a) => ({
      name: a.name,
      cli_name: a.cliName,
      ref: a.ref,
      description: a.description,
      safety_mode: a.safetyMode,
      action_cmd: a.actionCmd,
      linked_observables: a.linkedObservables,
      blocked: a.safetyMode === "blocked",
    }));
  return {
    workspace_path: workspace.sourcePath,
    rois: workspace.rois.filter((r) => r.active).map((r) => ({ name: r.name, description: r.description })),
    anchors: workspace.anchors
      .filter((a) => a.active)
      .map((a) => ({ name: a.name, description: a.description, linked_observables: a.linkedObservables })),
    cli: {
      enabled: workspace.cli.enabled,
      enabledParameters,
      enabledActions,
      actionsAvailable: {
        cli_get: enabledParameters.some((p) => Boolean((p.schema as { actions?: { get?: boolean } }).actions?.get)),
        cli_set: enabledParameters.some((p) => Boolean((p.schema as { actions?: { set?: boolean } }).actions?.set)),
        cli_ramp: enabledParameters.some((p) => Boolean((p.schema as { actions?: { ramp?: boolean } }).actions?.ramp)),
        cli_action: enabledActions.some((a) => a.safety_mode !== "blocked"),
      },
    },
  };
}

export function buildWorkspaceContextText(workspace: Workspace): string {
  return `WORKSPACE (Quailbot active workspace)\n${JSON.stringify(buildWorkspaceSummary(workspace), null, 2)}`;
}
```

- [ ] **Step 4: Implement plan context holder**

Create `src/prompt/plan-context.ts`:

```ts
export type PlanContextState = { text: string };

export class PlanContextStore {
  #text = "";

  set(text: string): void {
    this.#text = text;
  }

  append(text: string): void {
    this.#text = this.#text ? `${this.#text}\n\n${text}` : text;
  }

  clear(): void {
    this.#text = "";
  }

  get(): string {
    return this.#text;
  }

  render(): string | undefined {
    return this.#text ? `QUAILBOT PLAN CONTEXT\n${this.#text}` : undefined;
  }
}
```

- [ ] **Step 5: Implement extension entry skeleton with context injection**

Create `src/extension.ts`:

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildWorkspaceContextText } from "./prompt/workspace-summary.js";
import { PlanContextStore } from "./prompt/plan-context.js";
import { registerQuailbotTools } from "./tools/register-tools.js";
import { loadWorkspace } from "./workspace/load-workspace.js";
import { resolveWorkspaceSelection } from "./workspace/workspace-state.js";
import type { Workspace } from "./workspace/types.js";

export type QuailbotRuntime = {
  workspace?: Workspace;
  planStore: PlanContextStore;
};

export default function quailbotExtension(pi: ExtensionAPI): void {
  const runtime: QuailbotRuntime = { planStore: new PlanContextStore() };
  registerQuailbotTools(pi, runtime);

  pi.on("session_start", () => {
    const selected = resolveWorkspaceSelection();
    runtime.workspace = loadWorkspace(selected.path);
  });

  pi.on("before_agent_start", () => {
    const parts: string[] = [];
    if (runtime.workspace) parts.push(buildWorkspaceContextText(runtime.workspace));
    const plan = runtime.planStore.render();
    if (plan) parts.push(plan);
    if (!parts.length) return undefined;
    return { message: { customType: "quailbot-context", content: parts.join("\n\n"), display: false } };
  });
}
```

Create `src/index.ts`:

```ts
export { default } from "./extension.js";
```

- [ ] **Step 6: Add temporary tool registry shell for compilation**

Create `src/tools/register-tools.ts`:

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { QuailbotRuntime } from "../extension.js";

export function registerQuailbotTools(_pi: ExtensionAPI, _runtime: QuailbotRuntime): void {
  void _pi;
  void _runtime;
}
```

This shell compiles before the concrete tool registrations are introduced in the later tool tasks.

- [ ] **Step 7: Run prompt tests and typecheck**

Run:

```powershell
npm test -- tests/prompt/workspace-summary.test.ts
npm run typecheck
```

Expected: pass.

- [ ] **Step 8: Commit workspace context injection**

Run:

```powershell
git add src/extension.ts src/index.ts src/prompt src/tools/register-tools.ts tests/prompt
git commit -m "feat: inject workspace context into Pi"
```

---

### Task 4: Semantic E2E harness contract

**Files:**
- Create: `tests/e2e/semantic-e2e.test.ts`
- Create: `tests/e2e/e2e-artifacts.ts`
- Modify construction scaffold as needed under `.opencode/artifacts/...`

- [ ] **Step 1: Write E2E artifact contract test**

Create `tests/e2e/e2e-artifacts.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type SemanticE2EArtifact = {
  scenario: string;
  task: string;
  events: unknown[];
  responses: unknown[];
  messages: unknown[];
  finalToolResult?: unknown;
  linkedObservations: unknown[];
  assertions: { name: string; pass: boolean; detail: string }[];
};

export function semanticArtifactRoot(): string {
  return join(process.cwd(), ".opencode", "artifacts", "quailbot-pi-e2e");
}

export function writeSemanticArtifact(name: string, artifact: SemanticE2EArtifact): string {
  const path = join(semanticArtifactRoot(), `${name}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(artifact, null, 2), "utf8");
  return path;
}

export function readSemanticArtifact(path: string): SemanticE2EArtifact {
  if (!existsSync(path)) throw new Error(`semantic E2E artifact not found: ${path}`);
  return JSON.parse(readFileSync(path, "utf8")) as SemanticE2EArtifact;
}
```

Create `tests/e2e/semantic-e2e.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readSemanticArtifact, writeSemanticArtifact } from "./e2e-artifacts.js";

describe("semantic E2E artifact contract", () => {
  it("preserves the fields required for OpenCode semantic acceptance", () => {
    const path = writeSemanticArtifact("contract-smoke", {
      scenario: "contract-smoke",
      task: "prove artifact contract",
      events: [],
      responses: [],
      messages: [],
      finalToolResult: { ok: true },
      linkedObservations: [{ channels: { cli: { results: {} }, roi: { results: {} } } }],
      assertions: [{ name: "contract", pass: true, detail: "artifact includes semantic fields" }],
    });
    const artifact = readSemanticArtifact(path);
    expect(artifact.linkedObservations).toHaveLength(1);
    expect(artifact.assertions.every((x) => x.pass)).toBe(true);
  });
});
```

- [ ] **Step 2: Run E2E contract test**

Run:

```powershell
npm run test:e2e
```

Expected: pass. This validates the artifact contract before real Pi-session scenarios are wired.

- [ ] **Step 3: Record the bridge-driven scenario list in the test file**

Extend `tests/e2e/semantic-e2e.test.ts` with a scenario name check:

```ts
const requiredScenarios = [
  "workspace-to-context",
  "driver-agnostic-cli",
  "linked-observable",
  "blocked-capability",
  "planwrite",
  "plan-and-execute",
] as const;

describe("semantic E2E scenarios", () => {
  it("names every semantic scenario from the design spec", () => {
    expect(requiredScenarios).toEqual([
      "workspace-to-context",
      "driver-agnostic-cli",
      "linked-observable",
      "blocked-capability",
      "planwrite",
      "plan-and-execute",
    ]);
  });
});
```

Real bridge execution for each scenario is added after the corresponding feature exists.

- [ ] **Step 4: Run E2E contract test again**

Run:

```powershell
npm run test:e2e
```

Expected: pass.

- [ ] **Step 5: Commit semantic E2E harness contract**

Run:

```powershell
git add tests/e2e
git commit -m "test: define semantic e2e artifact contract"
```

---

### Task 5: Generic CLI driver and fixed CLI tools

**Files:**
- Create: `src/cli/cli-driver.ts`
- Create: `src/tools/tool-context.ts`
- Create: `src/tools/tool-result.ts`
- Create: `src/tools/cli_get.ts`
- Create: `src/tools/cli_set.ts`
- Create: `src/tools/cli_ramp.ts`
- Create: `src/tools/cli_action.ts`
- Create: `src/tools/sleep_seconds.ts`
- Modify: `src/tools/register-tools.ts`
- Create: `tests/tools/cli-tools.test.ts`

- [ ] **Step 1: Write failing CLI tool tests**

Create `tests/tools/cli-tools.test.ts`:

```ts
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadWorkspace } from "../../src/workspace/load-workspace.js";
import { createToolContext } from "../../src/tools/tool-context.js";
import { executeCliGet } from "../../src/tools/cli_get.js";
import { executeCliSet } from "../../src/tools/cli_set.js";

function workspace() {
  return loadWorkspace(join(process.cwd(), "tests/workspaces/nanonis-minimal.workspace.json"));
}

describe("fixed CLI tools", () => {
  it("validates workspace targets before dispatching cli_get", async () => {
    const calls: string[][] = [];
    const ctx = createToolContext({
      workspace: workspace(),
      runCli: async (file, args) => {
        calls.push([file, ...args]);
        return { ok: true, exitCode: 0, stdout: '{"value":1}', stderr: "", payload: { value: 1 }, argv: [file, ...args] };
      },
    });
    const result = await executeCliGet(ctx, { cli_name: "nqctl", parameter: "current" });
    expect(result.ok).toBe(true);
    expect(calls[0]).toEqual(["nqctl", "get", "current"]);
  });

  it("fails disabled or unknown targets before driver execution", async () => {
    let dispatched = false;
    const ctx = createToolContext({
      workspace: workspace(),
      runCli: async () => {
        dispatched = true;
        throw new Error("driver should not run");
      },
    });
    await expect(executeCliSet(ctx, { cli_name: "nqctl", parameter: "missing", value: 1 })).rejects.toThrow(
      /unknown cli parameter: nqctl:missing/,
    );
    expect(dispatched).toBe(false);
  });
});
```

- [ ] **Step 2: Run CLI tool tests and verify failure**

Run:

```powershell
npm test -- tests/tools/cli-tools.test.ts
```

Expected: fail because CLI tool modules do not exist.

- [ ] **Step 3: Implement CLI driver and shared result types**

Create `src/cli/cli-driver.ts`:

```ts
import { spawn } from "node:child_process";

export type CliRunResult = {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  payload: unknown;
  argv: string[];
};

export type RunCli = (file: string, args: string[], options?: { timeoutMs?: number }) => Promise<CliRunResult>;

export const runCli: RunCli = async (file, args, options = {}) => {
  const timeoutMs = options.timeoutMs ?? 60_000;
  return await new Promise<CliRunResult>((resolvePromise) => {
    const child = spawn(file, args, { stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => child.kill(), timeoutMs);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += String(chunk)));
    child.stderr.on("data", (chunk) => (stderr += String(chunk)));
    child.on("close", (code) => {
      clearTimeout(timer);
      let payload: unknown = undefined;
      try {
        payload = stdout.trim() ? JSON.parse(stdout) : undefined;
      } catch {
        payload = undefined;
      }
      resolvePromise({ ok: code === 0, exitCode: code ?? -1, stdout, stderr, payload, argv: [file, ...args] });
    });
  });
};
```

Create `src/tools/tool-result.ts`:

```ts
export type QuailbotToolResult = {
  ok: boolean;
  action: string;
  action_input: Record<string, unknown>;
  primary_result: Record<string, unknown>;
  linked_observation?: unknown;
};
```

Create `src/tools/tool-context.ts`:

```ts
import type { RunCli } from "../cli/cli-driver.js";
import { runCli } from "../cli/cli-driver.js";
import type { Workspace } from "../workspace/types.js";

export type ToolContext = {
  workspace: Workspace;
  runCli: RunCli;
};

export function createToolContext(input: { workspace: Workspace; runCli?: RunCli }): ToolContext {
  return { workspace: input.workspace, runCli: input.runCli ?? runCli };
}

export function cliRef(cliName: string, name: string): string {
  return `${cliName || "cli"}:${name}`;
}
```

- [ ] **Step 4: Implement `cli_get` and `cli_set`**

Create `src/tools/cli_get.ts`:

```ts
import type { ToolContext } from "./tool-context.js";
import { cliRef } from "./tool-context.js";
import type { QuailbotToolResult } from "./tool-result.js";

export type CliGetInput = { cli_name: string; parameter: string; timeout_ms?: number };

export async function executeCliGet(ctx: ToolContext, input: CliGetInput): Promise<QuailbotToolResult> {
  if (!ctx.workspace.cli.enabled) throw new Error("cli is disabled in workspace");
  const ref = cliRef(input.cli_name, input.parameter);
  const param = ctx.workspace.cli.parameters.get(ref);
  if (!param) throw new Error(`unknown cli parameter: ${ref}`);
  if (!param.enabled) throw new Error(`disabled cli parameter: ${ref}`);
  if (!param.actions.get) throw new Error(`action 'get' is not allowed for cli parameter: ${ref}`);
  const out = await ctx.runCli(input.cli_name, ["get", input.parameter], { timeoutMs: input.timeout_ms });
  return {
    ok: out.ok,
    action: "cli_get",
    action_input: { ...input },
    primary_result: {
      parameter: input.parameter,
      ok: out.ok,
      exit_code: out.exitCode,
      stdout: out.stdout,
      stderr: out.stderr,
      payload: out.payload,
      argv: out.argv,
    },
  };
}
```

Create `src/tools/cli_set.ts`:

```ts
import type { ToolContext } from "./tool-context.js";
import { cliRef } from "./tool-context.js";
import type { QuailbotToolResult } from "./tool-result.js";

export type CliSetInput = { cli_name: string; parameter: string; value?: unknown; args?: Record<string, unknown>; timeout_ms?: number };

function valueArgs(input: CliSetInput): string[] {
  if (input.args && Object.keys(input.args).length) {
    return Object.entries(input.args).flatMap(([key, value]) => ["--arg", `${key}=${String(value)}`]);
  }
  if (input.value !== undefined) return [String(input.value)];
  throw new Error("cli_set requires value or args");
}

export async function executeCliSet(ctx: ToolContext, input: CliSetInput): Promise<QuailbotToolResult> {
  if (!ctx.workspace.cli.enabled) throw new Error("cli is disabled in workspace");
  const ref = cliRef(input.cli_name, input.parameter);
  const param = ctx.workspace.cli.parameters.get(ref);
  if (!param) throw new Error(`unknown cli parameter: ${ref}`);
  if (!param.enabled) throw new Error(`disabled cli parameter: ${ref}`);
  if (!param.actions.set) throw new Error(`action 'set' is not allowed for cli parameter: ${ref}`);
  const out = await ctx.runCli(input.cli_name, ["set", input.parameter, ...valueArgs(input)], { timeoutMs: input.timeout_ms });
  return {
    ok: out.ok,
    action: "cli_set",
    action_input: { ...input },
    primary_result: {
      parameter: input.parameter,
      value: input.value,
      args: input.args ?? {},
      ok: out.ok,
      exit_code: out.exitCode,
      stdout: out.stdout,
      stderr: out.stderr,
      payload: out.payload,
      argv: out.argv,
    },
  };
}
```

- [ ] **Step 5: Implement `cli_ramp`, `cli_action`, and `sleep_seconds`**

Create `src/tools/cli_ramp.ts`:

```ts
import type { ToolContext } from "./tool-context.js";
import { cliRef } from "./tool-context.js";
import type { QuailbotToolResult } from "./tool-result.js";

export type CliRampInput = { cli_name: string; parameter: string; start: unknown; end: unknown; step: unknown; interval_s: unknown; timeout_ms?: number };

export async function executeCliRamp(ctx: ToolContext, input: CliRampInput): Promise<QuailbotToolResult> {
  if (!ctx.workspace.cli.enabled) throw new Error("cli is disabled in workspace");
  const ref = cliRef(input.cli_name, input.parameter);
  const param = ctx.workspace.cli.parameters.get(ref);
  if (!param) throw new Error(`unknown cli parameter: ${ref}`);
  if (!param.enabled) throw new Error(`disabled cli parameter: ${ref}`);
  if (!param.actions.ramp) throw new Error(`action 'ramp' is not allowed for cli parameter: ${ref}`);
  const out = await ctx.runCli(
    input.cli_name,
    ["ramp", input.parameter, String(input.start), String(input.end), String(input.step), "--interval-s", String(input.interval_s)],
    { timeoutMs: input.timeout_ms },
  );
  return { ok: out.ok, action: "cli_ramp", action_input: { ...input }, primary_result: { ...input, ok: out.ok, exit_code: out.exitCode, stdout: out.stdout, stderr: out.stderr, payload: out.payload, argv: out.argv } };
}
```

Create `src/tools/cli_action.ts`:

```ts
import type { ToolContext } from "./tool-context.js";
import { cliRef } from "./tool-context.js";
import type { QuailbotToolResult } from "./tool-result.js";

export type CliActionInput = { cli_name: string; action_name: string; args?: Record<string, unknown>; timeout_ms?: number };

export async function executeCliAction(ctx: ToolContext, input: CliActionInput): Promise<QuailbotToolResult> {
  if (!ctx.workspace.cli.enabled) throw new Error("cli is disabled in workspace");
  const ref = cliRef(input.cli_name, input.action_name);
  const action = ctx.workspace.cli.actions.get(ref);
  if (!action) throw new Error(`unknown cli action: ${ref}`);
  if (!action.enabled) throw new Error(`disabled cli action: ${ref}`);
  if (action.safetyMode === "blocked") throw new Error(`blocked cli action: ${ref}`);
  const argList = Object.entries(input.args ?? {}).flatMap(([key, value]) => ["--arg", `${key}=${String(value)}`]);
  const out = await ctx.runCli(input.cli_name, ["act", input.action_name, ...argList], { timeoutMs: input.timeout_ms });
  return { ok: out.ok, action: "cli_action", action_input: { ...input }, primary_result: { action_name: input.action_name, args: input.args ?? {}, ok: out.ok, exit_code: out.exitCode, stdout: out.stdout, stderr: out.stderr, payload: out.payload, argv: out.argv } };
}
```

Create `src/tools/sleep_seconds.ts`:

```ts
import type { QuailbotToolResult } from "./tool-result.js";

export type SleepSecondsInput = { seconds: number };

export async function executeSleepSeconds(input: SleepSecondsInput): Promise<QuailbotToolResult> {
  if (!Number.isFinite(input.seconds) || input.seconds < 0) throw new Error("sleep_seconds requires non-negative seconds");
  await new Promise((resolve) => setTimeout(resolve, input.seconds * 1000));
  return { ok: true, action: "sleep_seconds", action_input: { ...input }, primary_result: { slept_seconds: input.seconds } };
}
```

- [ ] **Step 6: Register tools with Pi**

Replace `src/tools/register-tools.ts` with registrations using `typebox` and current runtime workspace:

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { QuailbotRuntime } from "../extension.js";
import { createToolContext } from "./tool-context.js";
import { executeCliGet } from "./cli_get.js";
import { executeCliSet } from "./cli_set.js";
import { executeCliRamp } from "./cli_ramp.js";
import { executeCliAction } from "./cli_action.js";
import { executeSleepSeconds } from "./sleep_seconds.js";

function ctx(runtime: QuailbotRuntime) {
  if (!runtime.workspace) throw new Error("Quailbot workspace is not loaded");
  return createToolContext({ workspace: runtime.workspace });
}

export function registerQuailbotTools(pi: ExtensionAPI, runtime: QuailbotRuntime): void {
  pi.registerTool({
    name: "cli_get",
    label: "CLI Get",
    description: "Read a workspace-approved CLI parameter value.",
    parameters: Type.Object({ cli_name: Type.String(), parameter: Type.String(), timeout_ms: Type.Optional(Type.Number()) }),
    async execute(_id, params) {
      const result = await executeCliGet(ctx(runtime), params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
    },
  });
  pi.registerTool({
    name: "cli_set",
    label: "CLI Set",
    description: "Set a workspace-approved CLI parameter.",
    parameters: Type.Object({ cli_name: Type.String(), parameter: Type.String(), value: Type.Optional(Type.Any()), args: Type.Optional(Type.Record(Type.String(), Type.Any())), timeout_ms: Type.Optional(Type.Number()) }),
    async execute(_id, params) {
      const result = await executeCliSet(ctx(runtime), params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
    },
  });
  pi.registerTool({
    name: "cli_ramp",
    label: "CLI Ramp",
    description: "Ramp a workspace-approved CLI parameter with explicit start, end, step, and interval_s.",
    parameters: Type.Object({ cli_name: Type.String(), parameter: Type.String(), start: Type.Any(), end: Type.Any(), step: Type.Any(), interval_s: Type.Any(), timeout_ms: Type.Optional(Type.Number()) }),
    async execute(_id, params) {
      const result = await executeCliRamp(ctx(runtime), params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
    },
  });
  pi.registerTool({
    name: "cli_action",
    label: "CLI Action",
    description: "Invoke a workspace-approved CLI action command.",
    parameters: Type.Object({ cli_name: Type.String(), action_name: Type.String(), args: Type.Optional(Type.Record(Type.String(), Type.Any())), timeout_ms: Type.Optional(Type.Number()) }),
    async execute(_id, params) {
      const result = await executeCliAction(ctx(runtime), params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
    },
  });
  pi.registerTool({
    name: "sleep_seconds",
    label: "Sleep Seconds",
    description: "Sleep for a fixed duration in seconds.",
    parameters: Type.Object({ seconds: Type.Number() }),
    async execute(_id, params) {
      const result = await executeSleepSeconds(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
    },
  });
}
```

- [ ] **Step 7: Run CLI tests and typecheck**

Run:

```powershell
npm test -- tests/tools/cli-tools.test.ts
npm run typecheck
```

Expected: pass.

- [ ] **Step 8: Commit fixed CLI tools**

Run:

```powershell
git add src/cli src/tools tests/tools
git commit -m "feat: add driver-agnostic cli tools"
```

---

### Task 6: Linked-observable resolver and readback

**Files:**
- Create: `src/linked-observables/resolve-linked-observables.ts`
- Create: `src/linked-observables/read-linked-observables.ts`
- Modify: `src/tools/cli_set.ts`
- Modify: `src/tools/cli_ramp.ts`
- Modify: `src/tools/cli_action.ts`
- Create: `tests/linked-observables/resolve-linked-observables.test.ts`
- Create: `tests/linked-observables/read-linked-observables.test.ts`

- [ ] **Step 1: Write failing resolver tests**

Create `tests/linked-observables/resolve-linked-observables.test.ts`:

```ts
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadWorkspace } from "../../src/workspace/load-workspace.js";
import { resolveLinkedObservables } from "../../src/linked-observables/resolve-linked-observables.js";

const workspace = () => loadWorkspace(join(process.cwd(), "tests/workspaces/nanonis-minimal.workspace.json"));

describe("resolveLinkedObservables", () => {
  it("adds self-readback and declared linked observables for cli_set", () => {
    const resolved = resolveLinkedObservables(workspace(), {
      kind: "cli_set",
      cli_name: "nqctl",
      parameter: "zctrl_setpnt",
    });
    expect(resolved.cli).toEqual(["nqctl:zctrl_setpnt", "nqctl:current"]);
    expect(resolved.roi).toEqual([]);
  });

  it("uses action-level linked observables for cli_action", () => {
    const resolved = resolveLinkedObservables(workspace(), {
      kind: "cli_action",
      cli_name: "nqctl",
      action_name: "Scan_Action",
    });
    expect(resolved.cli).toEqual([]);
    expect(resolved.unresolved).toEqual(["scan_status", "scan_buffer", "scan_speed"]);
  });
});
```

- [ ] **Step 2: Run resolver test and verify failure**

Run:

```powershell
npm test -- tests/linked-observables/resolve-linked-observables.test.ts
```

Expected: fail because resolver module does not exist.

- [ ] **Step 3: Implement resolver**

Create `src/linked-observables/resolve-linked-observables.ts`:

```ts
import type { Workspace } from "../workspace/types.js";

export type MutatingActionRef =
  | { kind: "cli_set" | "cli_ramp"; cli_name: string; parameter: string; linked_observables?: string[] }
  | { kind: "cli_action"; cli_name: string; action_name: string; linked_observables?: string[] }
  | { kind: "click_anchor" | "set_field"; anchor: string; linked_observables?: string[] };

export type ResolvedLinkedObservables = { cli: string[]; roi: string[]; unresolved: string[] };

function appendUnique(out: string[], value: string): void {
  if (value && !out.includes(value)) out.push(value);
}

function classify(workspace: Workspace, name: string, out: ResolvedLinkedObservables, defaultCliName: string): void {
  const roi = workspace.rois.find((r) => r.active && r.name === name);
  if (roi) {
    appendUnique(out.roi, name);
    return;
  }
  const ref = name.includes(":") ? name : `${defaultCliName}:${name}`;
  const param = workspace.cli.parameters.get(ref);
  if (param?.enabled && param.actions.get) {
    appendUnique(out.cli, ref);
    return;
  }
  appendUnique(out.unresolved, name);
}

export function resolveLinkedObservables(workspace: Workspace, action: MutatingActionRef): ResolvedLinkedObservables {
  const out: ResolvedLinkedObservables = { cli: [], roi: [], unresolved: [] };
  const explicit = action.linked_observables ?? [];
  for (const name of explicit) classify(workspace, name, out, "cli_name" in action ? action.cli_name : workspace.cli.defaultCliName);

  if (action.kind === "cli_set" || action.kind === "cli_ramp") {
    const ref = `${action.cli_name}:${action.parameter}`;
    const param = workspace.cli.parameters.get(ref);
    if (param?.enabled && param.actions.get) appendUnique(out.cli, ref);
    for (const name of param?.linkedObservables ?? []) classify(workspace, name, out, action.cli_name);
  }

  if (action.kind === "cli_action") {
    const ref = `${action.cli_name}:${action.action_name}`;
    const cfg = workspace.cli.actions.get(ref);
    for (const name of cfg?.linkedObservables ?? []) classify(workspace, name, out, action.cli_name);
  }

  if (action.kind === "click_anchor" || action.kind === "set_field") {
    const anchor = workspace.anchors.find((a) => a.active && a.name === action.anchor);
    for (const name of anchor?.linkedObservables ?? []) classify(workspace, name, out, workspace.cli.defaultCliName);
  }

  return out;
}
```

- [ ] **Step 4: Write readback test**

Create `tests/linked-observables/read-linked-observables.test.ts`:

```ts
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadWorkspace } from "../../src/workspace/load-workspace.js";
import { createToolContext } from "../../src/tools/tool-context.js";
import { readLinkedObservables } from "../../src/linked-observables/read-linked-observables.js";

describe("readLinkedObservables", () => {
  it("reads CLI observable refs through the generic driver", async () => {
    const workspace = loadWorkspace(join(process.cwd(), "tests/workspaces/nanonis-minimal.workspace.json"));
    const ctx = createToolContext({
      workspace,
      runCli: async (file, args) => ({ ok: true, exitCode: 0, stdout: '{"value":2}', stderr: "", payload: { value: 2 }, argv: [file, ...args] }),
    });
    const obs = await readLinkedObservables(ctx, { cli: ["nqctl:current"], roi: [], unresolved: [] });
    expect(obs.channels.cli.results["nqctl:current"].payload).toEqual({ value: 2 });
  });
});
```

- [ ] **Step 5: Implement readback**

Create `src/linked-observables/read-linked-observables.ts`:

```ts
import type { ToolContext } from "../tools/tool-context.js";
import type { ResolvedLinkedObservables } from "./resolve-linked-observables.js";

export type LinkedObservation = {
  channels: {
    cli: { observables: string[]; results: Record<string, unknown> };
    roi: { rois: string[]; results: Record<string, unknown>; unavailable: boolean };
  };
  unresolved: string[];
};

export async function readLinkedObservables(ctx: ToolContext, resolved: ResolvedLinkedObservables): Promise<LinkedObservation> {
  const cliResults: Record<string, unknown> = {};
  for (const ref of resolved.cli) {
    const [cliName, parameter] = ref.split(":", 2);
    const out = await ctx.runCli(cliName, ["get", parameter]);
    cliResults[ref] = { ok: out.ok, exit_code: out.exitCode, stdout: out.stdout, stderr: out.stderr, payload: out.payload, argv: out.argv };
  }
  const roiResults: Record<string, unknown> = {};
  for (const roi of resolved.roi) {
    roiResults[roi] = { ok: false, error_type: "roi_backend_unavailable", message: "ROI readback backend is not configured in this implementation round." };
  }
  return {
    channels: {
      cli: { observables: resolved.cli, results: cliResults },
      roi: { rois: resolved.roi, results: roiResults, unavailable: resolved.roi.length > 0 },
    },
    unresolved: resolved.unresolved,
  };
}
```

- [ ] **Step 6: Integrate linked readback into mutating CLI tools**

In `src/tools/cli_set.ts`, after primary `out`, compute linked observation and include it:

```ts
import { readLinkedObservables } from "../linked-observables/read-linked-observables.js";
import { resolveLinkedObservables } from "../linked-observables/resolve-linked-observables.js";

// inside executeCliSet after out:
const linked_observation = await readLinkedObservables(
  ctx,
  resolveLinkedObservables(ctx.workspace, { kind: "cli_set", cli_name: input.cli_name, parameter: input.parameter }),
);

// include linked_observation at top level of returned QuailbotToolResult
```

Apply equivalent integration to `cli_ramp.ts` and `cli_action.ts` using their action refs.

- [ ] **Step 7: Run linked-observable tests and CLI tests**

Run:

```powershell
npm test -- tests/linked-observables/resolve-linked-observables.test.ts tests/linked-observables/read-linked-observables.test.ts tests/tools/cli-tools.test.ts
npm run typecheck
```

Expected: pass.

- [ ] **Step 8: Commit linked-observable protocol**

Run:

```powershell
git add src/linked-observables src/tools tests/linked-observables tests/tools
git commit -m "feat: read linked observables after mutations"
```

---

### Task 7: GUI backup tools with explicit backend boundary

**Files:**
- Create: `src/tools/observe.ts`
- Create: `src/tools/click_anchor.ts`
- Create: `src/tools/set_field.ts`
- Modify: `src/tools/register-tools.ts`
- Create: `tests/tools/gui-tools.test.ts`

- [ ] **Step 1: Write GUI tool boundary tests**

Create `tests/tools/gui-tools.test.ts`:

```ts
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadWorkspace } from "../../src/workspace/load-workspace.js";
import { executeObserve } from "../../src/tools/observe.js";

describe("GUI backup tools", () => {
  it("returns a structured unavailable result when no ROI backend is configured", async () => {
    const workspace = loadWorkspace(join(process.cwd(), "tests/workspaces/nanonis-minimal.workspace.json"));
    const result = await executeObserve({ workspace }, { rois: ["missing_roi"] });
    expect(result.ok).toBe(false);
    expect(result.primary_result.error_type).toBe("roi_backend_unavailable");
  });
});
```

- [ ] **Step 2: Implement GUI tools as honest backend-boundary tools**

Create `src/tools/observe.ts`:

```ts
import type { Workspace } from "../workspace/types.js";
import type { QuailbotToolResult } from "./tool-result.js";

export type ObserveInput = { rois?: string[] };

export async function executeObserve(ctx: { workspace: Workspace }, input: ObserveInput): Promise<QuailbotToolResult> {
  const requested = input.rois ?? ctx.workspace.rois.filter((r) => r.active).map((r) => r.name);
  return {
    ok: false,
    action: "observe",
    action_input: { ...input },
    primary_result: {
      requested_rois: requested,
      error_type: "roi_backend_unavailable",
      message: "ROI screenshot/OCR backend is not configured in this plugin implementation round.",
    },
  };
}
```

Create `src/tools/click_anchor.ts`:

```ts
import type { Workspace } from "../workspace/types.js";
import type { QuailbotToolResult } from "./tool-result.js";

export type ClickAnchorInput = { anchor: string; rois?: string[] };

export async function executeClickAnchor(ctx: { workspace: Workspace }, input: ClickAnchorInput): Promise<QuailbotToolResult> {
  const anchor = ctx.workspace.anchors.find((a) => a.active && a.name === input.anchor);
  if (!anchor) throw new Error(`unknown or inactive anchor: ${input.anchor}`);
  return {
    ok: false,
    action: "click_anchor",
    action_input: { ...input },
    primary_result: { anchor: input.anchor, error_type: "gui_backend_unavailable", message: "GUI click backend is not configured in this plugin implementation round." },
  };
}
```

Create `src/tools/set_field.ts`:

```ts
import type { Workspace } from "../workspace/types.js";
import type { QuailbotToolResult } from "./tool-result.js";

export type SetFieldInput = { anchor: string; typed_text: string; submit?: "enter" | "tab"; rois?: string[] };

export async function executeSetField(ctx: { workspace: Workspace }, input: SetFieldInput): Promise<QuailbotToolResult> {
  const anchor = ctx.workspace.anchors.find((a) => a.active && a.name === input.anchor);
  if (!anchor) throw new Error(`unknown or inactive anchor: ${input.anchor}`);
  return {
    ok: false,
    action: "set_field",
    action_input: { ...input },
    primary_result: { anchor: input.anchor, error_type: "gui_backend_unavailable", message: "GUI text-entry backend is not configured in this plugin implementation round." },
  };
}
```

- [ ] **Step 3: Register GUI tools with Pi**

Add `observe`, `click_anchor`, and `set_field` to `src/tools/register-tools.ts` using TypeBox schemas and current runtime workspace. Return JSON string content exactly like the CLI tool registrations.

- [ ] **Step 4: Run GUI tool tests**

Run:

```powershell
npm test -- tests/tools/gui-tools.test.ts
npm run typecheck
```

Expected: pass.

- [ ] **Step 5: Commit GUI tool boundary**

Run:

```powershell
git add src/tools tests/tools/gui-tools.test.ts
git commit -m "feat: add gui backup tool boundaries"
```

---

### Task 8: `quailbot_planwrite`

**Files:**
- Create: `src/tools/quailbot_planwrite.ts`
- Modify: `src/tools/register-tools.ts`
- Create: `tests/tools/quailbot-planwrite.test.ts`

- [ ] **Step 1: Write failing planwrite tests**

Create `tests/tools/quailbot-planwrite.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PlanContextStore } from "../../src/prompt/plan-context.js";
import { executeQuailbotPlanwrite } from "../../src/tools/quailbot_planwrite.js";

describe("quailbot_planwrite", () => {
  it("stores system plan text and clears it", async () => {
    const store = new PlanContextStore();
    const stored = await executeQuailbotPlanwrite(store, { mode: "system", text: "Set bias then verify current." });
    expect(stored.ok).toBe(true);
    expect(store.get()).toContain("Set bias");
    const cleared = await executeQuailbotPlanwrite(store, { mode: "system", text: "", clean: true });
    expect(cleared.ok).toBe(true);
    expect(store.get()).toBe("");
  });

  it("does not persist ephemeral plan text", async () => {
    const store = new PlanContextStore();
    const result = await executeQuailbotPlanwrite(store, { mode: "ephemeral", text: "Temporary scratch" });
    expect(result.ok).toBe(true);
    expect(store.get()).toBe("");
    expect(result.primary_result.persisted).toBe(false);
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```powershell
npm test -- tests/tools/quailbot-planwrite.test.ts
```

Expected: fail because `quailbot_planwrite.ts` does not exist.

- [ ] **Step 3: Implement planwrite tool**

Create `src/tools/quailbot_planwrite.ts`:

```ts
import type { PlanContextStore } from "../prompt/plan-context.js";
import type { QuailbotToolResult } from "./tool-result.js";

export type QuailbotPlanwriteInput = { text: string; mode: "system" | "ephemeral"; clean?: boolean };

export async function executeQuailbotPlanwrite(store: PlanContextStore, input: QuailbotPlanwriteInput): Promise<QuailbotToolResult> {
  if (input.clean) store.clear();
  if (input.mode === "system" && input.text.trim()) store.set(input.text);
  const persisted = input.mode === "system" && Boolean(input.text.trim());
  return {
    ok: true,
    action: "quailbot_planwrite",
    action_input: { ...input },
    primary_result: {
      mode: input.mode,
      cleaned: Boolean(input.clean),
      persisted,
      text: input.text,
    },
  };
}
```

- [ ] **Step 4: Register planwrite with Pi**

Add to `registerQuailbotTools`:

```ts
pi.registerTool({
  name: "quailbot_planwrite",
  label: "Quailbot Planwrite",
  description: "Write, return, or clear explicit Quailbot plan context.",
  parameters: Type.Object({ text: Type.String(), mode: Type.Union([Type.Literal("system"), Type.Literal("ephemeral")]), clean: Type.Optional(Type.Boolean()) }),
  async execute(_id, params) {
    const result = await executeQuailbotPlanwrite(runtime.planStore, params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
  },
});
```

Import `executeQuailbotPlanwrite` at the top of `register-tools.ts`.

- [ ] **Step 5: Run planwrite tests and typecheck**

Run:

```powershell
npm test -- tests/tools/quailbot-planwrite.test.ts
npm run typecheck
```

Expected: pass.

- [ ] **Step 6: Commit planwrite**

Run:

```powershell
git add src/tools/quailbot_planwrite.ts src/tools/register-tools.ts tests/tools/quailbot-planwrite.test.ts
git commit -m "feat: add quailbot planwrite tool"
```

---

### Task 9: `quailbot_plan_and_execute`

**Files:**
- Create: `src/tools/quailbot_plan_and_execute.ts`
- Modify: `src/tools/register-tools.ts`
- Create: `tests/tools/quailbot-plan-and-execute.test.ts`

- [ ] **Step 1: Write failing plan-and-execute test**

Create `tests/tools/quailbot-plan-and-execute.test.ts`:

```ts
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadWorkspace } from "../../src/workspace/load-workspace.js";
import { createToolContext } from "../../src/tools/tool-context.js";
import { executeQuailbotPlanAndExecute } from "../../src/tools/quailbot_plan_and_execute.js";

describe("quailbot_plan_and_execute", () => {
  it("executes a serial program and returns one final step list", async () => {
    const workspace = loadWorkspace(join(process.cwd(), "tests/workspaces/nanonis-minimal.workspace.json"));
    const ctx = createToolContext({
      workspace,
      runCli: async (file, args) => ({ ok: true, exitCode: 0, stdout: '{"value":3}', stderr: "", payload: { value: 3 }, argv: [file, ...args] }),
    });
    const result = await executeQuailbotPlanAndExecute(ctx, {
      steps: [
        { kind: "cli_set", cli_name: "nqctl", parameter: "zctrl_setpnt", value: 1 },
        { kind: "cli_get", cli_name: "nqctl", parameter: "current" },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.primary_result.stopped_reason).toBe("completed");
    expect(result.primary_result.steps).toHaveLength(2);
    expect(result.primary_result.steps[0].linked_observation).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```powershell
npm test -- tests/tools/quailbot-plan-and-execute.test.ts
```

Expected: fail because `quailbot_plan_and_execute.ts` does not exist.

- [ ] **Step 3: Implement blocking serial executor**

Create `src/tools/quailbot_plan_and_execute.ts`:

```ts
import { executeCliAction, type CliActionInput } from "./cli_action.js";
import { executeCliGet, type CliGetInput } from "./cli_get.js";
import { executeCliRamp, type CliRampInput } from "./cli_ramp.js";
import { executeCliSet, type CliSetInput } from "./cli_set.js";
import { executeSleepSeconds, type SleepSecondsInput } from "./sleep_seconds.js";
import type { ToolContext } from "./tool-context.js";
import type { QuailbotToolResult } from "./tool-result.js";

export type PlanAndExecuteStep =
  | ({ kind: "cli_get" } & CliGetInput)
  | ({ kind: "cli_set" } & CliSetInput)
  | ({ kind: "cli_ramp" } & CliRampInput)
  | ({ kind: "cli_action" } & CliActionInput)
  | ({ kind: "sleep_seconds" } & SleepSecondsInput);

export type PlanAndExecuteInput = { steps: PlanAndExecuteStep[] };

async function runStep(ctx: ToolContext, step: PlanAndExecuteStep): Promise<QuailbotToolResult> {
  if (step.kind === "cli_get") return await executeCliGet(ctx, step);
  if (step.kind === "cli_set") return await executeCliSet(ctx, step);
  if (step.kind === "cli_ramp") return await executeCliRamp(ctx, step);
  if (step.kind === "cli_action") return await executeCliAction(ctx, step);
  if (step.kind === "sleep_seconds") return await executeSleepSeconds(step);
  const neverStep: never = step;
  throw new Error(`unsupported step: ${JSON.stringify(neverStep)}`);
}

export async function executeQuailbotPlanAndExecute(ctx: ToolContext, input: PlanAndExecuteInput): Promise<QuailbotToolResult> {
  if (!Array.isArray(input.steps) || input.steps.length === 0) throw new Error("quailbot_plan_and_execute requires at least one step");
  const steps: Record<string, unknown>[] = [];
  let ok = true;
  let stopped_reason: "completed" | "step_failed" = "completed";
  for (let index = 0; index < input.steps.length; index += 1) {
    const step = input.steps[index];
    const result = await runStep(ctx, step);
    steps.push({
      index,
      kind: step.kind,
      args: { ...step },
      primary_result: result.primary_result,
      linked_observation: result.linked_observation,
    });
    if (!result.ok) {
      ok = false;
      stopped_reason = "step_failed";
      break;
    }
  }
  return { ok, action: "quailbot_plan_and_execute", action_input: input as unknown as Record<string, unknown>, primary_result: { ok, stopped_reason, steps } };
}
```

- [ ] **Step 4: Register plan-and-execute with Pi**

Add to `registerQuailbotTools`:

```ts
pi.registerTool({
  name: "quailbot_plan_and_execute",
  label: "Quailbot Plan And Execute",
  description: "Execute a concrete serial Quailbot program and return one final result with per-step readbacks.",
  parameters: Type.Object({ steps: Type.Array(Type.Record(Type.String(), Type.Any())) }),
  async execute(_id, params) {
    const result = await executeQuailbotPlanAndExecute(ctx(runtime), params as never);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: result };
  },
});
```

Import `executeQuailbotPlanAndExecute` at the top of `register-tools.ts`.

- [ ] **Step 5: Run plan-and-execute tests and typecheck**

Run:

```powershell
npm test -- tests/tools/quailbot-plan-and-execute.test.ts
npm run typecheck
```

Expected: pass.

- [ ] **Step 6: Commit plan-and-execute**

Run:

```powershell
git add src/tools/quailbot_plan_and_execute.ts src/tools/register-tools.ts tests/tools/quailbot-plan-and-execute.test.ts
git commit -m "feat: add blocking plan execution tool"
```

---

### Task 10: Full semantic E2E scenarios

**Files:**
- Modify: `tests/e2e/semantic-e2e.test.ts`
- Modify or create construction-only bridge task packets under `.opencode/artifacts/quailbot-pi-e2e/tasks/`
- Use existing or copied construction bridge code under `.opencode/artifacts/pi-rpc-bridge/scaffold/`

- [ ] **Step 1: Add E2E assertions for preserved artifacts**

Extend `tests/e2e/semantic-e2e.test.ts` with artifact assertion helpers:

```ts
function expectSemanticPass(artifact: { assertions: { name: string; pass: boolean; detail: string }[] }, name: string): void {
  const assertion = artifact.assertions.find((x) => x.name === name);
  expect(assertion, `missing assertion ${name}`).toBeDefined();
  expect(assertion?.pass, assertion?.detail).toBe(true);
}
```

- [ ] **Step 2: Add workspace-to-context artifact test**

Add a test that reads the artifact produced by a bridge run and asserts:

```ts
it("workspace-to-context E2E preserves model-visible workspace summary", () => {
  const artifact = readSemanticArtifact(`${semanticArtifactRoot()}/workspace-to-context.json`);
  expectSemanticPass(artifact, "workspace-summary-visible");
  expect(JSON.stringify(artifact.messages)).toContain("WORKSPACE (Quailbot active workspace)");
  expect(JSON.stringify(artifact.messages)).toContain("nqctl:zctrl_setpnt");
});
```

- [ ] **Step 3: Add driver-agnostic CLI artifact test**

Add:

```ts
it("driver-agnostic CLI E2E uses cli_name from workspace/tool args", () => {
  const artifact = readSemanticArtifact(`${semanticArtifactRoot()}/driver-agnostic-cli.json`);
  expectSemanticPass(artifact, "driver-from-tool-args");
  expect(JSON.stringify(artifact.finalToolResult)).toContain("nqctl");
});
```

- [ ] **Step 4: Add linked-observable artifact test**

Add:

```ts
it("linked-observable E2E returns primary result and separate observation", () => {
  const artifact = readSemanticArtifact(`${semanticArtifactRoot()}/linked-observable.json`);
  expectSemanticPass(artifact, "primary-result-present");
  expectSemanticPass(artifact, "linked-observation-present");
  expect(artifact.linkedObservations.length).toBeGreaterThan(0);
});
```

- [ ] **Step 5: Add blocked capability artifact test**

Add:

```ts
it("blocked capability E2E fails before driver execution", () => {
  const artifact = readSemanticArtifact(`${semanticArtifactRoot()}/blocked-capability.json`);
  expectSemanticPass(artifact, "validation-failed-before-driver");
  expect(JSON.stringify(artifact.finalToolResult)).toContain("unknown cli parameter");
});
```

- [ ] **Step 6: Add planwrite artifact test**

Add:

```ts
it("planwrite E2E distinguishes system, ephemeral, and clean", () => {
  const artifact = readSemanticArtifact(`${semanticArtifactRoot()}/planwrite.json`);
  expectSemanticPass(artifact, "system-plan-persisted");
  expectSemanticPass(artifact, "ephemeral-plan-not-persisted");
  expectSemanticPass(artifact, "clean-removes-system-plan");
});
```

- [ ] **Step 7: Add plan-and-execute artifact test**

Add:

```ts
it("plan-and-execute E2E returns one final ordered step list", () => {
  const artifact = readSemanticArtifact(`${semanticArtifactRoot()}/plan-and-execute.json`);
  expectSemanticPass(artifact, "single-final-tool-result");
  expectSemanticPass(artifact, "ordered-step-list-present");
  expectSemanticPass(artifact, "mutating-step-has-linked-observation");
});
```

- [ ] **Step 8: Generate real artifacts through the internal bridge**

For each scenario, use the `.opencode/artifacts/pi-rpc-bridge/scaffold/` bridge to run Pi with the plugin against scenario task packets and write a corresponding semantic artifact JSON under `.opencode/artifacts/quailbot-pi-e2e/`.

The bridge runner must record:

```text
task prompt / command packet
Pi events and responses
Pi session file or exported messages
final tool result payload
linked observation payloads
semantic assertions
```

- [ ] **Step 9: Run semantic E2E tests**

Run:

```powershell
npm run test:e2e
```

Expected: pass after real artifacts exist. If a scenario fails, inspect `.opencode/artifacts/quailbot-pi-e2e/<scenario>.json` and fix product code or bridge extraction until the semantic assertion reflects real behavior.

- [ ] **Step 10: Commit tracked E2E tests only**

Run:

```powershell
git add tests/e2e
git commit -m "test: add semantic e2e scenarios"
```

Do not add `.opencode/artifacts/...` artifacts to git.

---

### Task 11: Final verification and roadmap refresh

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Run full verification**

Run:

```powershell
npm test
npm run typecheck
npm run test:e2e
git status --short
```

Expected:

```text
Vitest: all tests pass
TypeScript: no errors
Semantic E2E: all scenario assertions pass
git status: only intended tracked files modified; .opencode artifacts remain untracked/ignored
```

- [ ] **Step 2: Update ROADMAP.md closeout**

Append a dated entry under `ROADMAP.md` with:

```md
## Implementation round: Quailbot Pi plugin core

### Delivered

- Product code lives under package-style `src/` and excludes OpenCode/Pi RPC scaffold from tracked product files.
- Fixed Quailbot tools are registered from `src/tools/`.
- Workspace data is loaded through the real resolver and injected into Pi context.
- CLI tools dispatch through driver-agnostic `cli_name`.
- Linked-observable readback is returned separately from primary tool results.
- `quailbot_planwrite` and `quailbot_plan_and_execute` are implemented.
- Semantic E2E artifacts prove the migrated protocol through real Pi sessions.

### Now known

- Semantic E2E artifacts are the evidence source for this round; inspect `.opencode/artifacts/quailbot-pi-e2e/*.json` before making any completion claim.
- The plugin remains driver-agnostic: driver names come from workspace data and tool arguments, not from hardcoded product paths.

### Later phases must do differently

- Keep experiment logging separate from Pi session history and OpenCode construction artifacts.
- Keep GUI backend expansion behind the existing `observe`, `click_anchor`, and `set_field` boundaries instead of introducing new ad-hoc tool names.
```

Replace the bracketed lines with concrete facts from the actual implementation run before committing.

- [ ] **Step 3: Commit roadmap closeout**

Run:

```powershell
git add ROADMAP.md
git commit -m "docs: refresh roadmap after plugin core"
```

- [ ] **Step 4: Request code review**

Use the `requesting-code-review` skill. Provide the reviewer the spec path, this plan path, and the semantic E2E artifact root. Do not claim completion until the reviewer checks semantic acceptance against preserved artifacts.
