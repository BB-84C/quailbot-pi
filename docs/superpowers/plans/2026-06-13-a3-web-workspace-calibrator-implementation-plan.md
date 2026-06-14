# A3 Web Workspace Calibrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Pi-launched browser workspace calibrator that supports group-tree editing, ROI/anchor visual geometry, CLI capability import/conflict handling, A2-backed save/activation, and responsive panel layout.

**Architecture:** Add a product-owned `src/workspace-ui/` module tree. Browser UI and local HTTP routes are adapters over the existing A2 workspace service; A2 remains the only authority for validation, atomic writes, selected workspace persistence, and reload-mediated hidden-context refresh. Visual geometry uses deterministic screenshot fixtures first, with coordinate transforms separated from rendered CSS size so future live capture can plug in through `CaptureFrame` metadata.

**Tech Stack:** TypeScript, Node built-ins (`node:http`, `node:crypto`, `node:fs`, `node:path`, `node:child_process`), existing Pi extension API, browser DOM/SVG/Canvas, Vitest, real Pi TUI + Chrome/Windows MCP acceptance.

---

## File structure

### Create

- `src/workspace-ui/json.ts` — shared JSON object helpers.
- `src/workspace-ui/draft.ts` — workspace draft model, group/ROI/anchor mutation helpers, cascade/cycle rules, canonical serialization.
- `src/workspace-ui/geometry.ts` — `CaptureFrame`, display/image coordinate transforms, ROI/anchor geometry helpers.
- `src/workspace-ui/cli-import.ts` — CLI capability parsing, subprocess probing, merge/conflict logic.
- `src/workspace-ui/server.ts` — localhost HTTP server lifecycle, session token, route dispatch.
- `src/workspace-ui/routes.ts` — A2-backed API handlers.
- `src/workspace-ui/page.ts` — HTML shell.
- `src/workspace-ui/styles.ts` — responsive CSS string.
- `src/workspace-ui/client.ts` — dependency-free browser UI controller.
- `tests/workspace-ui/draft.test.ts`
- `tests/workspace-ui/geometry.test.ts`
- `tests/workspace-ui/cli-import.test.ts`
- `tests/workspace-ui/layout-contract.test.ts`
- `tests/workspace-ui/server.test.ts`
- `tests/workspace-ui/fixtures/calibration-frame.svg`
- `tests/workspace-ui/fixtures/capabilities-qctl.json`
- `tests/workspace-ui/fixtures/capabilities-qctl-conflict.json`
- `docs/superpowers/specs/2026-06-13-a3-web-workspace-calibrator-acceptance-test.md`

### Modify

- `src/workspace/load-workspace.ts` — legacy `GUI` wrapper + top-level `cli_params` compatibility.
- `src/workspace/workspace-service.ts` — raw JSON candidate validation/write helpers.
- `src/extension.ts` — workspace UI runtime and shutdown cleanup.
- `src/workspace/register-workspace-commands.ts` — `open` and `activate-pending` subcommands.
- `tests/workspace/load-workspace.test.ts`
- `tests/workspace/workspace-service.test.ts`
- `tests/e2e/dev-release-adoption.test.ts`
- `ROADMAP.md`

---

## Task 1: Loader compatibility and JSON candidate helpers

**Files:**
- Modify: `src/workspace/load-workspace.ts`
- Modify: `src/workspace/workspace-service.ts`
- Modify: `tests/workspace/load-workspace.test.ts`
- Modify: `tests/workspace/workspace-service.test.ts`

- [ ] **Step 1: Add failing legacy GUI-wrapper loader test**

Append this test inside `describe("loadWorkspace", ...)` in `tests/workspace/load-workspace.test.ts`:

```ts
it("loads GUI-wrapped visual fields while preserving top-level cli_params", () => {
  const workspace = loadWorkspace(writeWorkspace({
    GUI: {
      rois: [{ name: "scan-area", active: true, x: 10, y: 20, w: 100, h: 80 }],
      anchors: [{ name: "tip-home", active: true, x: 32, y: 48, linked_ROIs: ["scan-area"] }],
      groups: [{ name: "spectroscopy", active: true }],
    },
    cli_params: {
      cli_name: "qctl",
      enabled: true,
      parameters: { items: [{ name: "bias", readable: true, enabled: true }] },
      action_commands: { items: [{ name: "Approach", action_cmd: { command: "Approach" } }] },
    },
  }));

  expect(workspace.rois.map((roi) => roi.name)).toEqual(["scan-area"]);
  expect(workspace.anchors.map((anchor) => anchor.name)).toEqual(["tip-home"]);
  expect(workspace.cli.defaultCliName).toBe("qctl");
  expect(workspace.cli.parameters.has("qctl:bias")).toBe(true);
  expect(workspace.cli.actions.has("qctl:Approach")).toBe(true);
});
```

- [ ] **Step 2: Verify failure**

Run:

```powershell
npx vitest --run tests/workspace/load-workspace.test.ts
```

Expected: the new test fails because `unwrapGui()` drops top-level `cli_params`.

- [ ] **Step 3: Fix `unwrapGui`**

Replace `unwrapGui` in `src/workspace/load-workspace.ts`:

```ts
function unwrapGui(value: unknown): JsonRecord {
  const root = record(value);
  const gui = root.GUI;
  if (!isRecord(gui)) return root;
  return { ...root, ...gui, cli_params: gui.cli_params ?? root.cli_params, tools: gui.tools ?? root.tools };
}
```

- [ ] **Step 4: Add failing service tests for raw JSON helpers**

Add `validateWorkspaceJson` and `writeWorkspaceJson` to the import from `workspace-service.js` in `tests/workspace/workspace-service.test.ts`, then add:

```ts
it("validates raw workspace JSON without mutating selected workspace settings", () => {
  const cwd = makeTempDir();
  const result = validateWorkspaceJson(minimalWorkspace("qctl"), { cwd });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected raw workspace JSON to validate");
  expect(result.summary.cli.default_cli_name).toBe("qctl");
  expect(existsSync(settingsPath(cwd))).toBe(false);
});

it("writes raw workspace JSON through the atomic write/readback path", () => {
  const cwd = makeTempDir();
  const targetPath = join(cwd, ".quailbot-pi", "workspace.json");
  const result = writeWorkspaceJson({ workspaceJson: minimalWorkspace("webctl"), targetPath, cwd });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected raw workspace JSON write to pass");
  expect(result.summary.cli.default_cli_name).toBe("webctl");
  expect(readFileSync(targetPath, "utf8")).toContain('"webctl"');
});

it("rejects invalid raw workspace JSON without overwriting the target", () => {
  const cwd = makeTempDir();
  const targetPath = writeWorkspace(cwd, "target.workspace.json", minimalWorkspace("nqctl"));
  const before = readFileSync(targetPath, "utf8");
  const result = writeWorkspaceJson({ workspaceJson: { cli_params: [] }, targetPath, cwd });
  expect(result.ok).toBe(false);
  expect(readFileSync(targetPath, "utf8")).toBe(before);
});
```

- [ ] **Step 5: Verify service helper failure**

Run:

```powershell
npx vitest --run tests/workspace/workspace-service.test.ts
```

Expected: failure because the helper exports do not exist.

- [ ] **Step 6: Implement raw JSON helpers**

In `src/workspace/workspace-service.ts`, change the path import to:

```ts
import { dirname, join, resolve } from "node:path";
```

Add after `writeWorkspaceCandidate`:

```ts
export function validateWorkspaceJson(workspaceJson: unknown, options: WorkspaceServiceOptions = {}): WorkspaceValidationResult {
  const cwd = options.cwd ?? process.cwd();
  const tempPath = join(cwd, `.workspace-json-candidate-${process.pid}-${Date.now()}.json`);
  try {
    writeFileSync(tempPath, `${JSON.stringify(workspaceJson, null, 2)}\n`, "utf8");
    return validateWorkspaceCandidate(tempPath, { cwd });
  } finally {
    rmSync(tempPath, { force: true });
  }
}

export function writeWorkspaceJson(options: { workspaceJson: unknown; targetPath: string; cwd?: string }): WorkspaceWriteResult {
  const cwd = options.cwd ?? process.cwd();
  const candidatePath = join(cwd, `.workspace-json-write-${process.pid}-${Date.now()}.json`);
  try {
    writeFileSync(candidatePath, `${JSON.stringify(options.workspaceJson, null, 2)}\n`, "utf8");
    return writeWorkspaceCandidate({ candidatePath, targetPath: options.targetPath, cwd });
  } finally {
    rmSync(candidatePath, { force: true });
  }
}
```

- [ ] **Step 7: Verify Task 1**

Run:

```powershell
npx vitest --run tests/workspace/load-workspace.test.ts tests/workspace/workspace-service.test.ts
```

Expected: both files pass.

- [ ] **Step 8: Commit Task 1**

```powershell
git add src/workspace/load-workspace.ts src/workspace/workspace-service.ts tests/workspace/load-workspace.test.ts tests/workspace/workspace-service.test.ts
git commit -m "feat: add workspace JSON validation helpers"
```

---

## Task 2: Workspace draft model and group tree editing

**Files:**
- Create: `src/workspace-ui/json.ts`
- Create: `src/workspace-ui/draft.ts`
- Create: `tests/workspace-ui/draft.test.ts`

- [ ] **Step 1: Write draft tests first**

Create `tests/workspace-ui/draft.test.ts` with tests for unknown-field preservation, group active cascade, cycle rejection, and ROI/anchor geometry edits. Use this assertion set:

```ts
expect(saved.rois?.[0]).toMatchObject({ name: "old-roi", vendor_note: "keep-me", x: 10, y: 20, w: 100, h: 80 });
expect(saved.groups?.map((group) => [group.name, group.active])).toEqual([["spectroscopy", false], ["child", false]]);
expect(() => assignItemGroup(draft, { kind: "group", name: "a" }, "b")).toThrow(/group cycle/);
expect(saved.anchors?.[0]).toMatchObject({ x: 50, y: 60 });
```

- [ ] **Step 2: Verify failure**

Run:

```powershell
npx vitest --run tests/workspace-ui/draft.test.ts
```

Expected: failure because `src/workspace-ui/draft.ts` does not exist.

- [ ] **Step 3: Implement JSON helpers**

Create `src/workspace-ui/json.ts`:

```ts
export type JsonRecord = Record<string, any>;
export function isRecord(value: unknown): value is JsonRecord { return typeof value === "object" && value !== null && !Array.isArray(value); }
export function record(value: unknown): JsonRecord { return isRecord(value) ? value : {}; }
export function arrayOfRecords(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter(isRecord).map((item) => ({ ...item })) : []; }
export function cloneJson<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
export function asString(value: unknown): string | undefined { return typeof value === "string" && value.length > 0 ? value : undefined; }
```

- [ ] **Step 4: Implement draft helpers**

Create `src/workspace-ui/draft.ts` exporting:

```ts
export type WorkspaceDraft = { root: JsonRecord; groups: JsonRecord[]; rois: JsonRecord[]; anchors: JsonRecord[] };
export function createWorkspaceDraft(input: unknown): WorkspaceDraft;
export function serializeWorkspaceDraft(draft: WorkspaceDraft): JsonRecord;
export function addGroup(draft: WorkspaceDraft, input: { name: string; parent?: string; active?: boolean }): void;
export function addRoi(draft: WorkspaceDraft, input: { name: string; group?: string; active?: boolean; x?: number; y?: number; w?: number; h?: number }): void;
export function addAnchor(draft: WorkspaceDraft, input: { name: string; group?: string; active?: boolean; x?: number; y?: number; linked_ROIs?: string[] }): void;
export function updateRoiGeometry(draft: WorkspaceDraft, name: string, geometry: { x: number; y: number; w: number; h: number }): void;
export function updateAnchorGeometry(draft: WorkspaceDraft, name: string, geometry: { x: number; y: number }): void;
export function setGroupActive(draft: WorkspaceDraft, name: string, active: boolean): void;
export function assignItemGroup(draft: WorkspaceDraft, item: { kind: "group" | "roi" | "anchor"; name: string }, groupName: string | undefined): void;
```

Implementation rules:

- `createWorkspaceDraft` reads visual fields from `GUI` if present but stores canonical top-level output.
- `serializeWorkspaceDraft` deletes `GUI` and returns top-level `rois`, `anchors`, `groups`, and existing `cli_params`.
- Names across groups/ROIs/anchors are unique.
- `updateRoiGeometry` rejects `w <= 0` or `h <= 0` with `ROI width and height must be positive`.
- `setGroupActive` cascades to descendants and descendant ROI/anchor records.
- `assignItemGroup` rejects group cycles with message containing `group cycle`.

- [ ] **Step 5: Verify Task 2**

Run:

```powershell
npx vitest --run tests/workspace-ui/draft.test.ts && npm run typecheck
```

Expected: draft tests and typecheck pass.

- [ ] **Step 6: Commit Task 2**

```powershell
git add src/workspace-ui/json.ts src/workspace-ui/draft.ts tests/workspace-ui/draft.test.ts
git commit -m "feat: add workspace draft editing model"
```

---

## Task 3: Visual geometry transform and fixture acceptance substrate

**Files:**
- Create: `src/workspace-ui/geometry.ts`
- Create: `tests/workspace-ui/geometry.test.ts`
- Create: `tests/workspace-ui/fixtures/calibration-frame.svg`

- [ ] **Step 1: Create deterministic fixture**

Create `tests/workspace-ui/fixtures/calibration-frame.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
  <rect width="800" height="500" fill="#101820"/>
  <rect id="target-roi" x="120" y="80" width="240" height="160" fill="#26313a" stroke="#6ee27a" stroke-width="4"/>
  <circle id="target-anchor" cx="520" cy="300" r="10" fill="#ffd08a"/>
</svg>
```

- [ ] **Step 2: Write geometry tests first**

Create `tests/workspace-ui/geometry.test.ts` with tests asserting:

```ts
expect(displayRectToImageRoi(frame, small, imageRoiToDisplayRect(frame, small, roi))).toEqual(roi);
expect(displayRectToImageRoi(frame, large, imageRoiToDisplayRect(frame, large, roi))).toEqual(roi);
expect(displayPointToImagePoint(frame, { width: 400, height: 250, panX: -30, panY: 18, zoom: 1.5 }, display)).toEqual({ x: 520, y: 300 });
```

Use fixture targets `roi = { x: 120, y: 80, w: 240, h: 160 }` and anchor `{ x: 520, y: 300 }`.

- [ ] **Step 3: Verify failure**

Run:

```powershell
npx vitest --run tests/workspace-ui/geometry.test.ts
```

Expected: failure because `geometry.ts` does not exist.

- [ ] **Step 4: Implement geometry module**

Create `src/workspace-ui/geometry.ts` with these exports:

```ts
export type CaptureFrame = { imageWidth: number; imageHeight: number; originX: number; originY: number; coordinateScaleX: number; coordinateScaleY: number; coordinateSpace: "screen" | "image" | "fixture" };
export type DisplayViewport = { width: number; height: number; panX: number; panY: number; zoom: number };
export type Point = { x: number; y: number };
export type Roi = { x: number; y: number; w: number; h: number };
export type DisplayRect = { left: number; top: number; width: number; height: number };
export function imagePointToDisplayPoint(frame: CaptureFrame, viewport: DisplayViewport, point: Point): Point;
export function displayPointToImagePoint(frame: CaptureFrame, viewport: DisplayViewport, point: Point): Point;
export function imageRoiToDisplayRect(frame: CaptureFrame, viewport: DisplayViewport, roi: Roi): DisplayRect;
export function displayRectToImageRoi(frame: CaptureFrame, viewport: DisplayViewport, rect: DisplayRect): Roi;
```

Use `Math.min(viewport.width / frame.imageWidth, viewport.height / frame.imageHeight) * viewport.zoom` for scale. Round to three decimals after conversion. Saved coordinates are image/capture-frame coordinates, not CSS pixels.

- [ ] **Step 5: Verify Task 3**

Run:

```powershell
npx vitest --run tests/workspace-ui/geometry.test.ts && npm run typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 6: Commit Task 3**

```powershell
git add src/workspace-ui/geometry.ts tests/workspace-ui/geometry.test.ts tests/workspace-ui/fixtures/calibration-frame.svg
git commit -m "feat: add workspace UI geometry transforms"
```

---

## Task 4: CLI capability import and conflict handling

**Files:**
- Create: `src/workspace-ui/cli-import.ts`
- Create: `tests/workspace-ui/cli-import.test.ts`
- Create: `tests/workspace-ui/fixtures/capabilities-qctl.json`
- Create: `tests/workspace-ui/fixtures/capabilities-qctl-conflict.json`

- [ ] **Step 1: Add fixtures**

Create `capabilities-qctl.json` with `parameters.items` for `bias_v` and `current`, and `action_commands.items` for `Approach`. Create `capabilities-qctl-conflict.json` with a changed `bias_v` label and `set_cmd`. Use `CLI_Name` only after normalization; fixture payload can omit it.

- [ ] **Step 2: Write import tests first**

Create tests proving:

- new params/actions are added as disabled;
- identical re-imports are skipped;
- changed same-key imports create conflict rows;
- conflict resolution `imported` replaces existing entry while keeping `enabled: false`.

Required assertions:

```ts
expect(result.added).toEqual(["qctl:bias_v", "qctl:current", "qctl:Approach"]);
expect(result.cliParams.parameters.items).toContainEqual(expect.objectContaining({ name: "bias_v", CLI_Name: "qctl", enabled: false }));
expect(conflicted.conflicts).toEqual([expect.objectContaining({ ref: "qctl:bias_v" })]);
expect(resolved.cliParams.parameters.items[0]).toMatchObject({ label: "Bias Updated", enabled: false });
```

- [ ] **Step 3: Verify failure**

Run:

```powershell
npx vitest --run tests/workspace-ui/cli-import.test.ts
```

Expected: failure because `cli-import.ts` does not exist.

- [ ] **Step 4: Implement import module**

Create `src/workspace-ui/cli-import.ts` exporting:

```ts
export type ConflictResolution = "existing" | "imported" | "skip";
export type ImportConflict = { ref: string; existing: JsonRecord; imported: JsonRecord };
export function parseCapabilityPayload(cliName: string, payload: unknown): { cliName: string; parameters: JsonRecord[]; actions: JsonRecord[] };
export function loadCliCapabilityPayload(cliName: string): { cliName: string; parameters: JsonRecord[]; actions: JsonRecord[] };
export function mergeCliCapabilities(existingCliParams: unknown, payload: ReturnType<typeof parseCapabilityPayload>, resolutions: Record<string, ConflictResolution>): { cliParams: JsonRecord; added: string[]; skipped: string[]; conflicts: ImportConflict[] };
```

Rules:

- `loadCliCapabilityPayload` tries `<cliName> capabilities`, then `<cliName> capacities`, timeout `90_000` ms.
- `parseCapabilityPayload` reads `parameters.items[]` and `action_commands.items[]`.
- Imported entries get `CLI_Name: cliName` unless payload already has `CLI_Name`, and `enabled: false`.
- Key is `${CLI_Name}:${name}`.
- Identical entries skip.
- Changed entries conflict unless a resolution is supplied.

- [ ] **Step 5: Verify Task 4**

Run:

```powershell
npx vitest --run tests/workspace-ui/cli-import.test.ts && npm run typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 6: Commit Task 4**

```powershell
git add src/workspace-ui/cli-import.ts tests/workspace-ui/cli-import.test.ts tests/workspace-ui/fixtures/capabilities-qctl.json tests/workspace-ui/fixtures/capabilities-qctl-conflict.json
git commit -m "feat: add CLI capability import merge"
```

---

## Task 5: Local web server and A2-backed routes

**Files:**
- Create: `src/workspace-ui/server.ts`
- Create: `src/workspace-ui/routes.ts`
- Create: `src/workspace-ui/page.ts`
- Create: `src/workspace-ui/styles.ts`
- Create: `src/workspace-ui/client.ts`
- Create: `tests/workspace-ui/server.test.ts`

- [ ] **Step 1: Write server tests first**

Create `tests/workspace-ui/server.test.ts` proving:

- `GET /` contains `Quailbot Workspace Calibrator`.
- `GET /api/workspace?token=<token>` returns active workspace summary.
- `POST /api/validate` without token returns `403`.
- `POST /api/write?token=<token>` with header `x-quailbot-workspace-ui-token` writes through A2 and returns `ok: true` plus summary hash.
- `POST /api/request-activation` stages `runtime.pendingWorkspaceActivation`.

- [ ] **Step 2: Verify failure**

Run:

```powershell
npx vitest --run tests/workspace-ui/server.test.ts
```

Expected: failure because server files do not exist.

- [ ] **Step 3: Implement page and CSS**

Create `page.ts` with `renderWorkspacePage(token: string): string`. The HTML must include:

```html
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Quailbot Workspace Calibrator</title>
<div id="app" data-token="...token..."></div>
<script type="module" src="/assets/client.js?token=...token..."></script>
```

Create `styles.ts` with `workspaceUiCss`. It must include all of these strings because later tests assert them:

```css
height: 100dvh;
overflow: hidden;
.panel { min-width: 0; min-height: 0; overflow: auto; }
.workspace-main { grid-template-columns: clamp(16rem, 22vw, 26rem) minmax(22rem, 1fr) clamp(18rem, 26vw, 32rem); }
@media (max-width: 56rem)
```

- [ ] **Step 4: Implement routes and server**

Create `routes.ts` with `handleWorkspaceApi(request, backend)` for:

- `GET /api/workspace`
- `POST /api/validate`
- `POST /api/write`
- `POST /api/request-activation`
- `POST /api/import-cli`

Create `server.ts` with:

```ts
export type WorkspaceUiServer = { url: string; token: string; close: () => Promise<void> };
export async function startWorkspaceUiServer(options: { cwd: string; runtime: QuailbotRuntime }): Promise<WorkspaceUiServer>;
export async function ensureWorkspaceUiServer(runtime: QuailbotRuntime, cwd: string): Promise<WorkspaceUiServer>;
export async function stopWorkspaceUiServer(runtime: QuailbotRuntime): Promise<void>;
```

Rules:

- bind to `127.0.0.1` with port `0`;
- generate `randomBytes(24).toString("hex")` token;
- mutating requests require query token and `x-quailbot-workspace-ui-token` header;
- use `validateWorkspaceJson` and `writeWorkspaceJson` from A2 service;
- stage activation by setting `runtime.pendingWorkspaceActivation = { targetPath, expectedHash }`.

Create minimal `client.ts` that renders header, tree panel, canvas panel, inspector panel, and import panel. This version only needs to load `/api/workspace` and display summary; Task 6 expands interactions.

- [ ] **Step 5: Verify Task 5**

Run:

```powershell
npx vitest --run tests/workspace-ui/server.test.ts && npm run typecheck
```

Expected: server tests and typecheck pass.

- [ ] **Step 6: Commit Task 5**

```powershell
git add src/workspace-ui/server.ts src/workspace-ui/routes.ts src/workspace-ui/page.ts src/workspace-ui/styles.ts src/workspace-ui/client.ts tests/workspace-ui/server.test.ts
git commit -m "feat: add local workspace UI server"
```

---

## Task 6: Browser UI functionality and responsive contract

**Files:**
- Modify: `src/workspace-ui/client.ts`
- Modify: `src/workspace-ui/styles.ts`
- Create: `tests/workspace-ui/layout-contract.test.ts`

- [ ] **Step 1: Add layout contract tests**

Create `tests/workspace-ui/layout-contract.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { workspaceUiCss } from "../../src/workspace-ui/styles.js";

describe("workspace UI responsive layout contract", () => {
  it("prevents body-level overflow and gives panels internal scrollbars", () => {
    expect(workspaceUiCss).toContain("height: 100dvh");
    expect(workspaceUiCss).toContain("overflow: hidden");
    expect(workspaceUiCss).toContain(".panel");
    expect(workspaceUiCss).toContain("overflow: auto");
    expect(workspaceUiCss).toContain("min-width: 0");
    expect(workspaceUiCss).toContain("min-height: 0");
  });
});
```

- [ ] **Step 2: Implement functional browser controller**

Modify `client.ts` to maintain:

```ts
type UiState = {
  token: string;
  workspaceJson: any;
  selected?: { kind: "group" | "roi" | "anchor" | "parameter" | "action"; name: string };
  dirty: boolean;
  mode: "select" | "draw-roi" | "pick-anchor";
};
```

Implement:

- render full workspace tree with groups, ROIs, anchors, params, actions;
- render SVG fixture canvas and overlays;
- select from tree and canvas;
- edit ROI/anchor numeric fields;
- add group/ROI/anchor buttons;
- validate/save/request activation buttons;
- CLI import panel with conflict table controls.

Use event delegation with `data-action` and `data-name`. Do not use fixed outer panel pixel boundaries. Every major panel keeps `overflow: auto` or a bounded scroll child.

- [ ] **Step 3: Verify Task 6**

Run:

```powershell
npm run typecheck && npm run dev:release && npx vitest --run tests/workspace-ui/geometry.test.ts tests/workspace-ui/layout-contract.test.ts
```

Expected: typecheck, build, geometry tests, and layout contract tests pass.

- [ ] **Step 4: Commit Task 6**

```powershell
git add src/workspace-ui/client.ts src/workspace-ui/styles.ts tests/workspace-ui/layout-contract.test.ts
git commit -m "feat: add responsive workspace calibrator UI"
```

---

## Task 7: Pi command integration and pending activation

**Files:**
- Modify: `src/extension.ts`
- Modify: `src/workspace/register-workspace-commands.ts`
- Modify: `tests/e2e/dev-release-adoption.test.ts`

- [ ] **Step 1: Add failing command tests**

Modify `tests/e2e/dev-release-adoption.test.ts` so handler registration expects `session_shutdown` in addition to `session_start` and `before_agent_start`. Add tests proving:

- `/quailbot-workspace open` reports `workspace calibrator open` and a `http://127.0.0.1:` URL.
- `/quailbot-workspace activate-pending` warns when no pending activation exists.
- successful pending activation is covered through server route tests by staging `runtime.pendingWorkspaceActivation`.

- [ ] **Step 2: Verify failure**

Run:

```powershell
npm run dev:release && npx vitest --run tests/e2e/dev-release-adoption.test.ts
```

Expected: failure because commands/lifecycle are not wired.

- [ ] **Step 3: Extend runtime and lifecycle**

Modify `src/extension.ts`:

```ts
import { stopWorkspaceUiServer, type WorkspaceUiRuntime } from "./workspace-ui/server.js";

export type PendingWorkspaceActivation = { targetPath: string; expectedHash: string };
export type QuailbotRuntime = {
  workspace?: Workspace;
  activeWorkspace?: LoadedWorkspace;
  planStore: PlanContextStore;
  workspaceUi?: WorkspaceUiRuntime;
  pendingWorkspaceActivation?: PendingWorkspaceActivation;
};
```

Register shutdown:

```ts
pi.on("session_shutdown", async () => {
  await stopWorkspaceUiServer(runtime);
});
```

- [ ] **Step 4: Add commands**

Modify `register-workspace-commands.ts`:

- include `open` and `activate-pending` in completions and usage;
- `open` calls `ensureWorkspaceUiServer(runtime, ctx.cwd)` and notifies URL;
- browser launch is best-effort via `cmd /c start`; URL notification is recovery path;
- `activate-pending` validates expected hash, calls `selectWorkspace`, calls `ctx.reload()`, clears pending state only after reload success.

- [ ] **Step 5: Verify Task 7**

Run:

```powershell
npm run dev:release && npx vitest --run tests/e2e/dev-release-adoption.test.ts tests/workspace-ui/server.test.ts
```

Expected: tests pass and built extension imports cleanly.

- [ ] **Step 6: Commit Task 7**

```powershell
git add src/extension.ts src/workspace/register-workspace-commands.ts src/workspace-ui/server.ts tests/e2e/dev-release-adoption.test.ts tests/workspace-ui/server.test.ts
git commit -m "feat: wire workspace calibrator commands"
```

---

## Task 8: Semantic acceptance, review, and roadmap closeout

**Files:**
- Create: `docs/superpowers/specs/2026-06-13-a3-web-workspace-calibrator-acceptance-test.md`
- Modify: `ROADMAP.md`

- [ ] **Step 1: Write acceptance procedure doc**

Create `docs/superpowers/specs/2026-06-13-a3-web-workspace-calibrator-acceptance-test.md` covering:

- fixture ROI target `x=120 y=80 w=240 h=160`;
- fixture anchor target `x=520 y=300`;
- browser resize/scroll/zoom/pan no-offset proof;
- CLI import fake non-`nqctl` payload proof;
- A2 write hash readback;
- `/quailbot-workspace activate-pending` reload proof;
- hidden `WORKSPACE` context readback.

- [ ] **Step 2: Run automated gate**

Run:

```powershell
npm run typecheck && npm run dev:release && npx vitest --run tests/workspace/load-workspace.test.ts tests/workspace/workspace-service.test.ts tests/workspace-ui/draft.test.ts tests/workspace-ui/geometry.test.ts tests/workspace-ui/cli-import.test.ts tests/workspace-ui/layout-contract.test.ts tests/workspace-ui/server.test.ts tests/e2e/dev-release-adoption.test.ts && npm run dev:check && git diff --check
```

Expected: all commands pass.

- [ ] **Step 3: Run browser geometry acceptance**

Use Chrome DevTools browser tooling against the local calibrator page. Preserve evidence under `.opencode/artifacts/a3-web-workspace-calibrator-e2e/<timestamp>/`:

```text
fixture/calibration-frame.svg
screenshots/wide-before.png
screenshots/wide-after.png
screenshots/narrow-after.png
workspace/before.json
workspace/after.json
http/write-request.json
http/write-response.json
coordinate-comparison.json
observations.md
```

`coordinate-comparison.json` must include zero deltas for ROI and anchor:

```json
{
  "roi": { "expected": { "x": 120, "y": 80, "w": 240, "h": 160 }, "saved": { "x": 120, "y": 80, "w": 240, "h": 160 }, "delta": { "x": 0, "y": 0, "w": 0, "h": 0 } },
  "anchor": { "expected": { "x": 520, "y": 300 }, "saved": { "x": 520, "y": 300 }, "delta": { "x": 0, "y": 0 } }
}
```

- [ ] **Step 4: Run real Pi TUI activation acceptance**

Use Windows MCP visible UI interaction, not shell simulation:

```text
1. Open visible terminal.
2. Type: Set-Location D:\quailbot-pi; npm run pi
3. Wait for Pi TUI.
4. Run /quailbot-workspace open.
5. Use browser to save and request activation.
6. Run /quailbot-workspace activate-pending.
7. Run /quailbot-workspace show.
8. Ask normal prompt: "What active Quailbot workspace path, ROI names, anchor names, and CLI refs are loaded? Answer from context only."
```

Preserve observations in `.opencode/artifacts/a3-web-workspace-calibrator-e2e/<timestamp>/tui-observations.md`.

- [ ] **Step 5: Request code review**

Use `requesting-code-review`. Ask reviewer to check:

- A2 remains the only validation/write/selection/reload authority.
- Web UI is localhost/token guarded and cannot mutate external state.
- Responsive panel requirements are represented in code and acceptance.
- Visual geometry acceptance proves no offset after resize/zoom/pan.
- Tests are semantic, not surface-only.

- [ ] **Step 6: Fix review findings and rerun gate**

For each accepted review finding, add/update tests first, implement, then rerun the automated gate from Step 2.

- [ ] **Step 7: Update ROADMAP**

Add `Implementation round: A3 web workspace calibrator` with:

- delivered: browser calibrator, full group tree, ROI/anchor fixture geometry, CLI import/conflicts, pending activation;
- now known: browser is better than Tk for Pi/A4 reuse, `ctx.reload()` remains command-bound, fixture images prove coordinate correctness without real instrument UI;
- later phases: A4 auth/approved destination/host lifecycle, live capture through `CaptureFrame`, experiment logs outside A3.

- [ ] **Step 8: Commit Task 8**

```powershell
git add docs/superpowers/specs/2026-06-13-a3-web-workspace-calibrator-acceptance-test.md ROADMAP.md
git commit -m "docs: close A3 web calibrator acceptance"
```

---

## Overall completion gate

Before claiming A3 complete, run:

```powershell
npm run typecheck
npm run dev:release
npx vitest --run tests/workspace/load-workspace.test.ts tests/workspace/workspace-service.test.ts tests/workspace-ui/draft.test.ts tests/workspace-ui/geometry.test.ts tests/workspace-ui/cli-import.test.ts tests/workspace-ui/layout-contract.test.ts tests/workspace-ui/server.test.ts tests/e2e/dev-release-adoption.test.ts
npm run dev:check
git diff --check
```

The preserved E2E evidence must show:

- fixture ROI maps to saved `x=120 y=80 w=240 h=160` with zero delta;
- fixture anchor maps to saved `x=520 y=300` with zero delta;
- browser resize/scroll/zoom/pan do not change saved coordinates;
- panels remain viewport-bounded and internally scrollable;
- web save returns before/after hash from A2;
- Pi `activate-pending` performs reload;
- hidden `WORKSPACE` context reflects edited workspace after reload.
