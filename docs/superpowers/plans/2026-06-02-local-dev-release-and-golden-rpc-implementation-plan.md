# Local Dev Release And Golden RPC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `quailbot-pi` usable as a repo-local Pi plugin, enforce a generic mutation safety gate, and prove one local simulator golden task through Pi RPC.

**Architecture:** Pi consumes the built package entrypoint `dist/src/extension.js` declared in `package.json`, with repo-local package discovery configured by tracked `.pi/settings.json`. Mutation control is a single tool-context policy checked before direct or planned instrument/device side effects. Golden Nanonis packets, bridge code, and run artifacts remain ignored local construction state under `.opencode/artifacts/...`, not product code.

**Tech Stack:** Node 24+, TypeScript, Vitest, `@earendil-works/pi-coding-agent@0.74.2`, Pi package settings, Windows PowerShell launch script for mutating sessions, ignored Pi RPC scaffold.

---

## File structure map

Tracked files to create or modify:

```text
package.json
.gitignore
.pi/settings.json
src/extension.ts
src/prompt/workspace-summary.ts
src/tools/tool-context.ts
src/tools/mutation-policy.ts
src/tools/cli_set.ts
src/tools/cli_ramp.ts
src/tools/cli_action.ts
src/tools/click_anchor.ts
src/tools/set_field.ts
src/tools/quailbot_plan_and_execute.ts
tests/product-boundary.test.ts
tests/e2e/dev-release-adoption.test.ts
tests/prompt/workspace-summary.test.ts
tests/tools/mutation-policy.test.ts
tests/tools/cli-tools.test.ts
tests/tools/gui-tools.test.ts
tests/tools/quailbot-plan-and-execute.test.ts
ROADMAP.md
```

Ignored local files allowed during the golden run:

```text
.quailbot-pi/settings.json
.opencode/artifacts/nanonis-simulator-golden/tasks/individual-tools.md
.opencode/artifacts/nanonis-simulator-golden/tasks/plan-and-execute.md
.opencode/artifacts/nanonis-simulator-golden/<timestamp>/individual-tools.json
.opencode/artifacts/nanonis-simulator-golden/<timestamp>/plan-and-execute.json
.opencode/artifacts/pi-rpc-bridge/scaffold/*
```

Do not add tracked Nanonis-specific product source, tests, or scripts. Nanonis details are allowed only in ignored golden task packets/artifacts.

---

### Task 1: Local Pi package dev release

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Create: `.pi/settings.json`
- Modify: `tests/product-boundary.test.ts`

- [ ] **Step 1: Write failing product-boundary tests**

Replace `tests/product-boundary.test.ts` with assertions that:

```ts
expect(existsSync(join(root, "scripts", "run-pi.mjs"))).toBe(false);
expect(existsSync(join(root, "scripts", "import-nanonis-workspace.mjs"))).toBe(false);
expect(pkg.pi?.extensions).toEqual(["./dist/src/extension.js"]);
expect(pkg.scripts.pi).toBe("npm run dev:release && npm exec -- pi --session-dir .pi-state/sessions");
expect(pkg.scripts["pi:mutating"]).toContain("QUAILBOT_ALLOW_MUTATING_TOOLS");
expect(pkg.scripts.pi).not.toContain("-e");
expect(pkg.scripts.pi).not.toContain("run-pi.mjs");
expect(settings.packages).toEqual([".."]);
for (const ignored of [".pi/git/", ".pi/npm/", ".pi/sessions/", ".pi/cache/", ".quailbot-pi/"]) {
  expect(gitignore).toContain(ignored);
}
```

- [ ] **Step 2: Run the focused test and confirm red**

Run:

```powershell
npm test -- tests/product-boundary.test.ts
```

Expected before implementation: failure because the `pi` manifest/scripts and `.pi/settings.json` are absent.

- [ ] **Step 3: Add package manifest and scripts**

Modify `package.json` scripts to exactly include:

```json
{
  "test": "vitest --run",
  "typecheck": "tsc --noEmit",
  "build": "tsc -p tsconfig.json",
  "test:e2e": "vitest --run tests/e2e/semantic-e2e.test.ts",
  "dev:release": "npm run build",
  "pi": "npm run dev:release && npm exec -- pi --session-dir .pi-state/sessions",
  "pi:mutating": "npm run dev:release && powershell -NoProfile -Command \"$env:QUAILBOT_ALLOW_MUTATING_TOOLS='1'; npm exec -- pi --session-dir .pi-state/sessions\"",
  "dev:check": "npm run dev:release && vitest --run tests/e2e/dev-release-adoption.test.ts"
}
```

Add top-level package field:

```json
"pi": {
  "extensions": ["./dist/src/extension.js"]
}
```

- [ ] **Step 4: Track package settings and ignore runtime state**

Create `.pi/settings.json`:

```json
{
  "packages": [".."]
}
```

Append to `.gitignore`:

```gitignore
.pi/git/
.pi/npm/
.pi/sessions/
.pi/cache/
.quailbot-pi/
```

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm test -- tests/product-boundary.test.ts
npm run build
git add package.json package-lock.json .gitignore .pi/settings.json tests/product-boundary.test.ts
git commit -m "chore: add local pi dev release wiring"
```

---

### Task 2: Mutation policy primitive and context visibility

**Files:**
- Create: `src/tools/mutation-policy.ts`
- Modify: `src/tools/tool-context.ts`
- Modify: `src/prompt/workspace-summary.ts`
- Modify: `src/extension.ts`
- Create: `tests/tools/mutation-policy.test.ts`
- Modify: `tests/prompt/workspace-summary.test.ts`

- [ ] **Step 1: Write failing policy unit tests**

Create `tests/tools/mutation-policy.test.ts` covering these exact assertions:

```ts
expect(mutationPolicyFromEnvironment({}).mutatingToolsEnabled).toBe(false);
expect(mutationPolicyFromEnvironment({ QUAILBOT_ALLOW_MUTATING_TOOLS: "0" }).mutatingToolsEnabled).toBe(false);
expect(mutationPolicyFromEnvironment({ QUAILBOT_ALLOW_MUTATING_TOOLS: "true" }).mutatingToolsEnabled).toBe(false);
expect(mutationPolicyFromEnvironment({ QUAILBOT_ALLOW_MUTATING_TOOLS: "1" }).mutatingToolsEnabled).toBe(true);
expect(enabledMutationPolicy()).toEqual({ mutatingToolsEnabled: true, enableEnvVar: "QUAILBOT_ALLOW_MUTATING_TOOLS" });
for (const kind of ["cli_set", "cli_ramp", "cli_action", "click_anchor", "set_field"]) expect(isMutatingToolKind(kind)).toBe(true);
for (const kind of ["cli_get", "observe", "sleep_seconds", "quailbot_planwrite", "quailbot_plan_and_execute"]) expect(isMutatingToolKind(kind)).toBe(false);
expect(mutationPolicyDisabledResult("cli_set", { parameter: "bias_v", value: 1 })).toMatchObject({
  ok: false,
  action: "cli_set",
  primary_result: {
    error_type: "mutation_policy_disabled",
    message: "Mutating quantum-instrument tools require QUAILBOT_ALLOW_MUTATING_TOOLS=1.",
  },
});
expect(mutationPolicyValidationError()).toContain("mutation policy disabled");
```

- [ ] **Step 2: Confirm red**

Run:

```powershell
npm test -- tests/tools/mutation-policy.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Create the policy module**

Create `src/tools/mutation-policy.ts`:

```ts
import type { QuailbotToolResult } from "./tool-result.js";

export const MUTATION_POLICY_ENV_VAR = "QUAILBOT_ALLOW_MUTATING_TOOLS";
export const MUTATION_POLICY_DISABLED_ERROR_TYPE = "mutation_policy_disabled";
export const MUTATION_POLICY_DISABLED_MESSAGE =
  "Mutating quantum-instrument tools require QUAILBOT_ALLOW_MUTATING_TOOLS=1.";

export type MutationPolicy = {
  mutatingToolsEnabled: boolean;
  enableEnvVar: typeof MUTATION_POLICY_ENV_VAR;
};

export const MUTATING_TOOL_KINDS = ["cli_set", "cli_ramp", "cli_action", "click_anchor", "set_field"] as const;
export type MutatingToolKind = (typeof MUTATING_TOOL_KINDS)[number];

export const READ_ONLY_WITHOUT_MUTATION_ENABLE = [
  "cli_get",
  "observe",
  "sleep_seconds",
  "quailbot_planwrite",
  "quailbot_plan_and_execute_read_only",
] as const;

export function mutationPolicyFromEnvironment(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): MutationPolicy {
  return { mutatingToolsEnabled: env[MUTATION_POLICY_ENV_VAR] === "1", enableEnvVar: MUTATION_POLICY_ENV_VAR };
}

export function enabledMutationPolicy(): MutationPolicy {
  return { mutatingToolsEnabled: true, enableEnvVar: MUTATION_POLICY_ENV_VAR };
}

export function disabledMutationPolicy(): MutationPolicy {
  return { mutatingToolsEnabled: false, enableEnvVar: MUTATION_POLICY_ENV_VAR };
}

export function isMutatingToolKind(kind: unknown): kind is MutatingToolKind {
  return typeof kind === "string" && (MUTATING_TOOL_KINDS as readonly string[]).includes(kind);
}

export function mutationPolicyDisabledResult(action: MutatingToolKind, actionInput: unknown): QuailbotToolResult {
  return {
    ok: false,
    action,
    action_input: actionInput,
    primary_result: {
      error_type: MUTATION_POLICY_DISABLED_ERROR_TYPE,
      message: MUTATION_POLICY_DISABLED_MESSAGE,
    },
  };
}

export function mutationPolicyValidationError(): string {
  return `mutation policy disabled: ${MUTATION_POLICY_DISABLED_MESSAGE}`;
}
```

- [ ] **Step 4: Add policy to `ToolContext`**

Replace `src/tools/tool-context.ts` with:

```ts
import { runCli, type RunCli } from "../cli/cli-driver.js";
import type { Workspace } from "../workspace/types.js";
import { mutationPolicyFromEnvironment, type MutationPolicy } from "./mutation-policy.js";

export type ToolContext = {
  workspace: Workspace;
  runCli: RunCli;
  mutationPolicy: MutationPolicy;
};

export function createToolContext({
  workspace,
  runCli: runner = runCli,
  mutationPolicy = mutationPolicyFromEnvironment(),
}: {
  workspace: Workspace;
  runCli?: RunCli;
  mutationPolicy?: MutationPolicy;
}): ToolContext {
  return { workspace, runCli: runner, mutationPolicy };
}

export function cliRef(cliName: string | undefined, name: string): string {
  return `${cliName || "cli"}:${name}`;
}
```

- [ ] **Step 5: Surface policy in workspace context**

In `src/prompt/workspace-summary.ts`, import policy constants/types, add `mutation_policy` to `WorkspaceSummary`, and make `buildWorkspaceSummary(workspace, mutationPolicy = mutationPolicyFromEnvironment())` return:

```ts
mutation_policy: {
  mutating_tools_enabled: mutationPolicy.mutatingToolsEnabled,
  enable_env_var: mutationPolicy.enableEnvVar,
  blocked_without_enable: [...MUTATING_TOOL_KINDS],
  allowed_without_enable: [...READ_ONLY_WITHOUT_MUTATION_ENABLE],
},
```

Change `buildWorkspaceContextText` to accept and pass the same optional policy argument.

In `src/extension.ts`, import `mutationPolicyFromEnvironment` and render:

```ts
runtime.workspace ? buildWorkspaceContextText(runtime.workspace, mutationPolicyFromEnvironment()) : undefined
```

- [ ] **Step 6: Extend context tests**

In `tests/prompt/workspace-summary.test.ts`, import `disabledMutationPolicy` and `enabledMutationPolicy`. Update the existing summary test to pass `disabledMutationPolicy()` and assert:

```ts
expect(summary.mutation_policy).toEqual({
  mutating_tools_enabled: false,
  enable_env_var: "QUAILBOT_ALLOW_MUTATING_TOOLS",
  blocked_without_enable: ["cli_set", "cli_ramp", "cli_action", "click_anchor", "set_field"],
  allowed_without_enable: ["cli_get", "observe", "sleep_seconds", "quailbot_planwrite", "quailbot_plan_and_execute_read_only"],
});
```

Add a test that `buildWorkspaceContextText(workspace, enabledMutationPolicy())` contains `"mutating_tools_enabled": true` and `QUAILBOT_ALLOW_MUTATING_TOOLS`.

- [ ] **Step 7: Verify and commit**

Run:

```powershell
npm test -- tests/tools/mutation-policy.test.ts tests/prompt/workspace-summary.test.ts
npm run typecheck
git add src/tools/mutation-policy.ts src/tools/tool-context.ts src/prompt/workspace-summary.ts src/extension.ts tests/tools/mutation-policy.test.ts tests/prompt/workspace-summary.test.ts
git commit -m "feat: expose generic mutation policy"
```

---

### Task 3: Direct mutating tool guard

**Files:**
- Modify: `src/tools/cli_set.ts`
- Modify: `src/tools/cli_ramp.ts`
- Modify: `src/tools/cli_action.ts`
- Modify: `src/tools/click_anchor.ts`
- Modify: `src/tools/set_field.ts`
- Modify: `tests/tools/cli-tools.test.ts`
- Modify: `tests/tools/gui-tools.test.ts`

- [ ] **Step 1: Add blocked direct-tool tests**

In `tests/tools/cli-tools.test.ts`, import `enabledMutationPolicy` and `MUTATION_POLICY_DISABLED_ERROR_TYPE`. Add a test that calls `executeCliSet`, `executeCliRamp`, and `executeCliAction` with the default disabled context, expects `primary_result.error_type === "mutation_policy_disabled"`, and verifies `runCli` was not called.

Update all existing mutating CLI tests to create contexts with:

```ts
createToolContext({ workspace: fixtureWorkspace(), runCli, mutationPolicy: enabledMutationPolicy() })
```

In `tests/tools/gui-tools.test.ts`, import `createToolContext`, `enabledMutationPolicy`, and `MUTATION_POLICY_DISABLED_ERROR_TYPE`. Add a test that calls `executeClickAnchor` and `executeSetField` with default disabled policy and expects `mutation_policy_disabled`. Update existing `click_anchor` and `set_field` behavior tests to use `createToolContext({ workspace, mutationPolicy: enabledMutationPolicy() })`. Leave `observe` tests unchanged.

- [ ] **Step 2: Confirm red**

Run:

```powershell
npm test -- tests/tools/cli-tools.test.ts tests/tools/gui-tools.test.ts
```

Expected before implementation: blocked-policy tests fail.

- [ ] **Step 3: Guard mutating CLI tools**

In `src/tools/cli_set.ts`, `src/tools/cli_ramp.ts`, and `src/tools/cli_action.ts`, import:

```ts
import { mutationPolicyDisabledResult } from "./mutation-policy.js";
```

At the start of each executor, before target resolution or validation, add the matching guard:

```ts
if (!ctx.mutationPolicy.mutatingToolsEnabled) {
  return mutationPolicyDisabledResult("cli_set", input);
}
```

Use `"cli_ramp"` in `executeCliRamp` and `"cli_action"` in `executeCliAction`.

- [ ] **Step 4: Guard mutating GUI backup tools**

In `src/tools/click_anchor.ts` and `src/tools/set_field.ts`, import:

```ts
import { mutationPolicyDisabledResult } from "./mutation-policy.js";
import type { ToolContext } from "./tool-context.js";
```

Change executor signatures to use policy-aware contexts:

```ts
export async function executeClickAnchor(
  ctx: Pick<ToolContext, "workspace" | "mutationPolicy">,
  input: ClickAnchorInput,
): Promise<QuailbotToolResult> {
  if (!ctx.mutationPolicy.mutatingToolsEnabled) {
    return mutationPolicyDisabledResult("click_anchor", input);
  }
  const anchor = validateClickAnchorInput(ctx.workspace, input);
```

Use the same pattern in `executeSetField`, with `"set_field"`.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm test -- tests/tools/cli-tools.test.ts tests/tools/gui-tools.test.ts
npm run typecheck
git add src/tools/cli_set.ts src/tools/cli_ramp.ts src/tools/cli_action.ts src/tools/click_anchor.ts src/tools/set_field.ts tests/tools/cli-tools.test.ts tests/tools/gui-tools.test.ts
git commit -m "feat: guard direct mutating tools"
```

---

### Task 4: Plan-and-execute mutation-policy preflight

**Files:**
- Modify: `src/tools/quailbot_plan_and_execute.ts`
- Modify: `tests/tools/quailbot-plan-and-execute.test.ts`

- [ ] **Step 1: Add plan policy tests**

In `tests/tools/quailbot-plan-and-execute.test.ts`, import `enabledMutationPolicy`. Add one test proving a read-only plan with `cli_get` succeeds under the default disabled policy. Add one test proving a plan containing `cli_set` returns:

```ts
expect(result.primary_result).toMatchObject({
  ok: false,
  stopped_reason: "validation_failed",
  validation_error: expect.stringContaining("mutation policy disabled"),
  steps: [],
});
expect(runCli).not.toHaveBeenCalled();
```

Update existing tests that contain mutating steps and expect normal execution/validation to pass `mutationPolicy: enabledMutationPolicy()` into `createToolContext()`.

- [ ] **Step 2: Confirm red**

Run:

```powershell
npm test -- tests/tools/quailbot-plan-and-execute.test.ts
```

Expected before implementation: policy-disabled mutating plan test fails or existing mutating tests fail due direct guards.

- [ ] **Step 3: Add preflight policy check**

In `src/tools/quailbot_plan_and_execute.ts`, import:

```ts
import { isMutatingToolKind, mutationPolicyValidationError } from "./mutation-policy.js";
```

Add helper:

```ts
function isMutatingPlanStep(step: unknown): boolean {
  return isRecord(step) && isMutatingToolKind(step.kind);
}
```

Change `validatePlan()` to check policy before validating each step:

```ts
async function validatePlan(ctx: ToolContext, steps: PlanAndExecuteStep[]): Promise<string | undefined> {
  try {
    for (const step of steps) {
      if (isMutatingPlanStep(step) && !ctx.mutationPolicy.mutatingToolsEnabled) {
        throw new Error(mutationPolicyValidationError());
      }
      await validateStep(ctx, step);
    }
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
```

Preserve policy in `validationContext()`:

```ts
return {
  workspace: ctx.workspace,
  mutationPolicy: ctx.mutationPolicy,
  runCli: async (cliName, args, options) => {
    validateRunCliOptions(options);
    return {
      ok: true,
      exitCode: 0,
      stdout: "",
      stderr: "",
      payload: undefined,
      argv: [cliName, ...args],
    };
  },
};
```

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm test -- tests/tools/quailbot-plan-and-execute.test.ts
npm run typecheck
git add src/tools/quailbot_plan_and_execute.ts tests/tools/quailbot-plan-and-execute.test.ts
git commit -m "feat: preflight plan mutation policy"
```

---

### Task 5: Deterministic dev-release adoption check

**Files:**
- Create: `tests/e2e/dev-release-adoption.test.ts`
- Modify: `package.json` only if `dev:check` was not added in Task 1

- [ ] **Step 1: Add adoption test for built extension**

Create `tests/e2e/dev-release-adoption.test.ts` with three cases:

```ts
expect(pkg.pi?.extensions).toEqual(["./dist/src/extension.js"]);
expect(settings.packages).toEqual([".."]);
expect(existsSync(join(root, "dist", "src", "extension.js"))).toBe(true);
```

Then dynamically import the built extension:

```ts
const extensionPath = join(root, "dist", "src", "extension.js");
const extensionModule = await import(`${pathToFileURL(extensionPath).href}?cacheBust=${Date.now()}`);
const tools: Array<{ name: string }> = [];
const handlers = new Map<string, unknown>();
extensionModule.default({
  on: (event: string, handler: unknown) => handlers.set(event, handler),
  registerTool: (tool: { name: string }) => tools.push(tool),
});
expect(handlers.has("session_start")).toBe(true);
expect(handlers.has("before_agent_start")).toBe(true);
expect(tools.map((tool) => tool.name).sort()).toEqual([
  "click_anchor",
  "cli_action",
  "cli_get",
  "cli_ramp",
  "cli_set",
  "observe",
  "quailbot_plan_and_execute",
  "quailbot_planwrite",
  "set_field",
  "sleep_seconds",
]);
```

Finally create a temp `.quailbot-pi/workspace.json` copied from `tests/workspaces/nanonis-minimal.workspace.json`, emit `session_start` and `before_agent_start`, and assert the hidden context contains:

```text
WORKSPACE (Quailbot active workspace)
nqctl:zctrl_setpnt
mutation_policy
QUAILBOT_ALLOW_MUTATING_TOOLS
```

- [ ] **Step 2: Verify through the script**

Run:

```powershell
npm run dev:check
```

Expected: build succeeds, then the adoption test imports `dist/src/extension.js` and sees all Quailbot tools plus workspace/mutation-policy context.

- [ ] **Step 3: Commit adoption check**

Run:

```powershell
git add tests/e2e/dev-release-adoption.test.ts package.json package-lock.json
git commit -m "test: verify local pi dev release adoption"
```

---

### Task 6: Golden RPC local workflow

**Files:**
- Ignored: `.quailbot-pi/settings.json`
- Ignored: `.opencode/artifacts/nanonis-simulator-golden/tasks/individual-tools.md`
- Ignored: `.opencode/artifacts/nanonis-simulator-golden/tasks/plan-and-execute.md`
- Ignored: `.opencode/artifacts/nanonis-simulator-golden/<timestamp>/*.json`
- Optional tracked change: `ROADMAP.md` only if recording manual-golden status

- [ ] **Step 1: Point local workspace state at the real workspace**

Create ignored `.quailbot-pi/settings.json`:

```json
{
  "workspace": "D:\\quailbot\\workspaces\\workspace.json"
}
```

Run:

```powershell
npm run dev:release
```

- [ ] **Step 2: Create the individual-tools task packet**

Create `.opencode/artifacts/nanonis-simulator-golden/tasks/individual-tools.md`:

```markdown
Use the active Quailbot workspace. Mutating tools are enabled by QUAILBOT_ALLOW_MUTATING_TOOLS=1.

Read `nqctl:bias_v`. Ramp `bias_v` from the current value to `0.5` V using step `0.01` V and interval `0.1` seconds. Then ramp `bias_v` from `0.5` V to `1.0` V using step `0.02` V and interval `0.1` seconds. Read back `bias_v` and report the final value.

Hard rule: do not call `quailbot_plan_and_execute` in this run. Use individual tools only.
```

- [ ] **Step 3: Create the plan-and-execute task packet**

Create `.opencode/artifacts/nanonis-simulator-golden/tasks/plan-and-execute.md`:

```markdown
Use the active Quailbot workspace. Mutating tools are enabled by QUAILBOT_ALLOW_MUTATING_TOOLS=1.

Use exactly one `quailbot_plan_and_execute` call for the serial program that ramps `nqctl:bias_v` to `0.5` V with step `0.01` V and interval `0.1` seconds, then ramps `nqctl:bias_v` to `1.0` V with step `0.02` V and interval `0.1` seconds, then reads back `bias_v`. Report the ordered step result list.

Hard rule: the serial mutating program must be inside `quailbot_plan_and_execute`.
```

- [ ] **Step 4: Run Pi through construction-only RPC bridge**

Use or recreate the ignored bridge scaffold from `docs/handoffs/2026-05-30-pi-rpc-bridge-handoff.md` under `.opencode/artifacts/pi-rpc-bridge/scaffold/`. The bridge must start Pi in RPC mode with mutation enabled and repo-local sessions:

```powershell
$env:QUAILBOT_ALLOW_MUTATING_TOOLS = '1'
npm exec -- pi --mode rpc --session-dir .pi-state/sessions
```

If the installed Pi CLI uses a different RPC flag shape, inspect these local package files after dependencies are installed and update only the ignored scaffold:

```text
node_modules/@earendil-works/pi-coding-agent/docs/rpc.md
node_modules/@earendil-works/pi-coding-agent/dist/modes/rpc/rpc-types.d.ts
node_modules/@earendil-works/pi-coding-agent/dist/modes/rpc/rpc-client.d.ts
```

- [ ] **Step 5: Preserve and inspect both golden artifacts**

Write artifacts to:

```text
.opencode/artifacts/nanonis-simulator-golden/<timestamp>/individual-tools.json
.opencode/artifacts/nanonis-simulator-golden/<timestamp>/plan-and-execute.json
```

Each artifact must include: task packet, RPC command stream, Pi events/responses/messages, active workspace path and SHA-256 hash, mutation policy state, final tool result payloads, initial readback, target ramp arguments, final readback, and semantic assertions.

The individual-tools artifact must prove `quailbot_plan_and_execute` was not called. The plan-and-execute artifact must prove `quailbot_plan_and_execute` was called exactly once and returned one ordered step list.

Both artifacts must prove ramp targets `0.5` and `1.0`, steps `0.01` and `0.02`, interval `0.1`, final readback approximately `1.0`, and no undeclared workspace parameter mutation.

- [ ] **Step 6: Record manual golden status if needed**

If the golden runner remains ignored/manual, add this factual note to `ROADMAP.md` under this round:

```markdown
- Golden Nanonis Simulator RPC artifacts are preserved locally under `.opencode/artifacts/nanonis-simulator-golden/...`; the bridge runner is still construction-only and not part of product CI.
```

If `ROADMAP.md` changed, commit it:

```powershell
git add ROADMAP.md
git commit -m "docs: record golden rpc workflow status"
```

---

### Task 7: Final verification and review

**Files:**
- Modify: `ROADMAP.md`
- Fix product/test files only if review or verification exposes a containment breach.

- [ ] **Step 1: Run full verification**

Run:

```powershell
npm test
npm run typecheck
npm run test:e2e
npm run dev:check
```

Expected: all tests pass; typecheck passes; semantic E2E artifacts still validate; dev-release adoption imports the built extension.

- [ ] **Step 2: Re-read golden artifacts**

Open both latest golden JSON files and confirm every semantic assertion is `pass: true`, including final readback approximately `1.0` V.

- [ ] **Step 3: Refresh `ROADMAP.md`**

Add a dated closeout entry with these sections. Use the concrete facts from this run in the `Now known` and `Later phases must do differently` bullets; the examples below are valid only if the run evidence supports them:

```markdown
### 2026-06-02 — Local dev release and golden RPC workflow

Delivered:
- Repo-local Pi package dev release through `package.json` Pi manifest and `.pi/settings.json`.
- Generic mutation policy surfaced in context and enforced before direct or planned mutating instrument actions.
- Dev-release adoption verification and local golden RPC artifact workflow.

Now known:
- Pi loaded the local dev release from `dist/src/extension.js` through the package manifest.
- Pi RPC used `npm exec -- pi --mode rpc --session-dir .pi-state/sessions` without scaffold changes.

Later phases must do differently:
- Decide whether the golden RPC runner should remain ignored construction scaffolding or graduate into tracked test tooling before adding more simulator tasks.
```

- [ ] **Step 4: Request quality review**

Request an `@oracle` review over the tracked diff with this prompt:

```text
Does this implementation enforce the generic mutation policy before instrument/backend side effects, keep product code instrument-agnostic, make Pi consume the built local dev release, and leave golden Nanonis/RPC scaffolding out of tracked product code? Identify only correctness, safety, or maintainability issues that should block completion.
```

Fix blocking review issues, rerun affected tests, and commit each fix separately.

- [ ] **Step 5: Commit roadmap closeout and inspect status**

Run:

```powershell
git add ROADMAP.md
git commit -m "docs: refresh roadmap after local dev release"
git status --short
git log --oneline -10
```

Expected: no unintended tracked changes. `.opencode/`, `.quailbot-pi/`, `dist/`, `.pi-state/`, and `.pi` runtime subdirectories are not staged.
