# A3 Web Workspace Calibrator Design

Date: 2026-06-13

Status: approved design direction, awaiting written-spec review before implementation planning.

## Summary

A3 adds a human-facing browser workspace calibrator for Quailbot Pi. The calibrator replaces the earlier Tk/Python-helper idea with a TypeScript-first web UI launched from Pi. It lets an operator create, inspect, import, edit, validate, save, and activate workspace files while preserving the A2 workspace control plane as the only write/activation authority.

The web UI is not a second runtime. It is an adapter over the same workspace service used by `/quailbot-workspace`. It may stage candidate workspace JSON, but validation, hash readback, atomic write, selected-workspace persistence, and reload/context refresh still go through A2.

## User-approved load-bearing decisions

- A3 first slice includes the visual helper.
- The visual helper is a browser UI, not Tk/Python.
- The full legacy group tree UI is in first-slice scope because this is a UI for humans, not only a machine API.
- Canonical saved workspace output uses top-level `rois`, `anchors`, `groups`, and `cli_params`; do not dual-write legacy `tools.cli` unless later compatibility evidence forces it.
- Browser UI code is product code, not construction scaffolding.
- The browser UI has no independent activation authority; A2 remains the gate.
- The browser UI must be responsive: no hardcoded panel pixel boundaries, panels follow viewport bounds, body-level overflow is prevented, and every panel owns its own scrollbar.

## Goals

1. Provide a usable human workspace editor/calibrator inside the Quailbot Pi workflow.
2. Preserve legacy Quailbot calibration behaviors that matter:
   - nested groups and group active cascade;
   - ROI creation/editing and rectangle drawing;
   - anchor creation/editing and point picking;
   - tags, descriptions, active flags, linked observables, linked ROIs;
   - CLI capability import from `cli_name capabilities` with fallback to `cli_name capacities`;
   - conflict handling by `(CLI_Name, name)`;
   - imported entries default disabled;
   - validation before save.
3. Keep workspace activation reload-driven so hidden `WORKSPACE` context updates only after a real Pi reload.
4. Keep A4 viable by making the web UI and workspace routes extractable into a future supervised host/client service.
5. Prove behavior with real readback: saved JSON, loader validation, hash changes, active selection, and hidden context after reload.

## Non-goals for A3

- Remote non-localhost access.
- Authentication, authorization, multi-client concurrency, or job queue.
- A4 host/client supervisor service lifecycle.
- Experiment logs.
- Real instrument CLI mutation during workspace editing.
- Dependence on a live real instrument GUI for A3 acceptance; current acceptance uses deterministic screenshot/image fixtures because no real instrument UI is available.
- Implementing a production GUI operation backend for `observe`, `click_anchor`, or `set_field`; A3 edits the workspace that those future backends will use.
- Recreating the legacy Tk application or adding a Python runtime requirement.

## Existing substrate

### Current Quailbot Pi seams

- `src/extension.ts` owns `QuailbotRuntime` and reloads active workspace on `session_start`.
- `src/workspace/workspace-service.ts` owns validation, selection, hash/readback, and atomic candidate writes.
- `src/workspace/register-workspace-commands.ts` owns `/quailbot-workspace` commands and is the only current place where `ctx.reload()` is available.
- `src/workspace/load-workspace.ts` is the canonical parser/validator for runtime workspace semantics.
- `src/workspace/types.ts` keeps raw schema blobs on ROIs, anchors, CLI parameters, and CLI actions, which lets the calibrator preserve fields it does not understand.

### Legacy behavior evidence

Legacy `D:\quailbot` provides behavior evidence, not code to transplant:

- `src/quailbot/calibration/gui.py` implements the old Tk group tree, screenshot canvas, ROI/anchor edit flows, save/export, active toggles, linked observables, and direct settings writes.
- `src/quailbot/calibration/cli_import.py` implements CLI capability loading, identical-entry skips, conflict detection, conflict resolution, and conflict reports.
- `src/quailbot/workspace.py` supports both legacy `tools.cli` and newer `cli_params`, plus optional `GUI` wrapper.

A3 should port the behavior contract into TypeScript and route writes/activation through A2 instead of carrying over legacy direct settings writes or direct `path.write_text` saves.

## Architecture

### Chosen option: Pi-embedded local web calibrator

The first A3 slice starts a local web server inside the Pi extension process and opens it in the user's browser through a Pi command.

```
/quailbot-workspace open
  -> starts/reuses 127.0.0.1:<dynamic-port> server
  -> opens browser to /?token=<session-token>
  -> browser loads active workspace draft
  -> user edits workspace visually
  -> browser stages/saves candidate through A2-backed routes
  -> user runs Pi activation command
  -> A2 selects workspace and ctx.reload() refreshes hidden context
```

The server binds only to `127.0.0.1` in A3. It uses a dynamic port and a per-session random token. Mutating API requests must include the token and a custom header so ordinary cross-origin pages cannot silently submit workspace mutations.

### Product file placement

Add a new product-owned module tree:

```
src/workspace-ui/
  server.ts           # local HTTP server, route dispatch, token, lifecycle
  routes.ts           # workspace state/read/validate/write/import/pending activation routes
  page.ts             # HTML shell and asset URL wiring
  client.ts           # browser-side UI logic, compiled by tsc
  styles.ts           # CSS served by the local server
  layout.ts           # responsive layout constants/helpers if useful
  capture-frame.ts    # screenshot/canvas coordinate-frame types
```

The web UI is tracked product code because it is the A3 human workspace editor and the future A4 preview/edit substrate. `.opencode/artifacts/...` remains only for design notes, mockups, and acceptance evidence.

### Asset packaging

Keep the first slice dependency-light:

- Server uses Node built-ins such as `node:http`, `node:crypto`, `node:fs`, and `node:path`.
- Browser client is TypeScript compiled by the existing `tsc` build into `dist/src/workspace-ui/client.js`.
- `page.ts` serves an HTML shell that references the compiled client module and CSS route.
- `styles.ts` can serve CSS as a string for the first slice. If the CSS/JS grows too large, a later phase may add an explicit asset copy/bundling step, but A3 should not start by adding Vite or a framework.

### Extension integration

Extend `QuailbotRuntime` with UI lifecycle state:

```ts
type QuailbotRuntime = {
  workspace?: Workspace;
  activeWorkspace?: LoadedWorkspace;
  planStore: PlanStore;
  workspaceUi?: WorkspaceUiRuntime;
  pendingWorkspaceActivation?: PendingWorkspaceActivation;
};
```

`WorkspaceUiRuntime` includes server handle, bound port, session token, and server URL. The server should start lazily when `/quailbot-workspace open` runs. It should close on extension/session shutdown if Pi exposes an appropriate event; otherwise it should be tied to the extension process lifetime and reuse the same port for the process.

Extend `/quailbot-workspace` with:

- `open`: starts or reveals the web UI and prints the URL.
- `activate-pending`: reads a pending activation staged by the web UI, validates the target path, calls `selectWorkspace`, calls `ctx.reload()`, and reports post-reload status.

Keep existing commands:

- `show`
- `read`
- `validate`
- `load`
- `write`

These remain the audit/readback fallback surface.

### HTTP API

The exact path names can change during planning, but the first slice needs these route classes:

| Route | Behavior |
|---|---|
| `GET /` | Serve HTML shell. |
| `GET /assets/client.js` | Serve compiled browser client. |
| `GET /assets/styles.css` | Serve CSS. |
| `GET /api/workspace` | Return active workspace raw JSON, parsed summary, path/source/hash, validation state. |
| `POST /api/draft` | Create or update a draft from active workspace or uploaded JSON. |
| `POST /api/validate` | Validate draft JSON through the canonical loader without activation. |
| `POST /api/import-cli` | Run CLI capability import, merge into draft, return added/skipped/conflict rows. |
| `POST /api/write` | Validate and atomically write draft/candidate through A2; return before/after hash and summary. |
| `POST /api/request-activation` | Stage a pending activation for `/quailbot-workspace activate-pending`; do not call reload directly. |

All mutating routes require the local token. A3 must not expose CORS for arbitrary origins. A future A4 service will add explicit auth and remote binding; A3 does not.

### Reload boundary

The web server must not pretend it can refresh agent context. In current Pi, `ctx.reload()` is command-context behavior, not arbitrary HTTP-server behavior.

Therefore A3 uses a two-step activation flow:

1. Browser saves workspace and stages `pendingWorkspaceActivation` with target path and expected hash.
2. User runs `/quailbot-workspace activate-pending` in Pi.
3. The command revalidates target path/hash, calls `selectWorkspace`, calls `ctx.reload()`, and reports readback.

The web page should show a clear post-save message:

> Workspace saved. Activation is pending in Pi. Run `/quailbot-workspace activate-pending` to reload the agent context.

This avoids false success where settings changed but hidden `WORKSPACE` context still reflects the previous workspace.

## Workspace model and serialization

### Canonical saved shape

A3 writes canonical top-level workspace data:

```json
{
  "rois": [],
  "anchors": [],
  "groups": [],
  "cli_params": {
    "cli_name": "nqctl",
    "enabled": true,
    "parameters": { "items": [] },
    "action_commands": { "items": [] }
  }
}
```

Do not write legacy `tools.cli` unless a later compatibility test proves a real consumer still requires it.

### Legacy `GUI` wrapper compatibility

Before implementation locks serialization, inspect and test the legacy shape where top-level `GUI` coexists with top-level `cli_params`. Current Pi's loader unwraps `GUI` before reading `cli_params`, which may miss top-level CLI entries for that legacy shape.

A3 should either:

- normalize imported legacy workspaces into top-level canonical shape before editing; or
- update the loader to read GUI-owned visual fields while preserving top-level `cli_params` when present.

This is a required design check, not an optional cleanup.

### Preservation rule

The web editor should preserve unknown fields in raw schema blobs wherever possible. Edits should update only the fields the user changes. Validation through `loadWorkspace` decides whether the resulting workspace is semantically acceptable.

## Responsive layout contract

The web UI must be built as a responsive application, not as a fixed-pixel desktop window clone.

### Required layout behavior

- The application root uses viewport-relative bounds such as `width: 100vw`, `height: 100dvh`, `max-width: 100vw`, and `max-height: 100dvh`.
- The main layout uses CSS grid/flex with relative sizing: percentages, `fr`, `minmax()`, and `clamp()` are preferred.
- Hardcoded pixel values are allowed only for small intrinsic controls such as padding, borders, icons, and minimum touch/keyboard targets. They must not define the outer panel boundaries.
- The body must not become the main scroll container during normal use. `body` and app root should use `overflow: hidden`.
- Every major panel owns its own scroll behavior with `overflow: auto`:
  - workspace tree panel;
  - canvas panel;
  - inspector panel;
  - CLI import/conflict panel;
  - validation/error panel if separated.
- Grid/flex children must use `min-width: 0` and `min-height: 0` so panels shrink inside viewport bounds instead of forcing overflow.
- Narrow windows should degrade intentionally, not break. The first acceptable degradation is tabs or stacked panels, still with bounded panel scrollbars.

### Suggested first-slice layout

Desktop/wide layout:

```
app: height 100dvh
  header: auto
  main: minmax(0, 1fr)
    columns:
      tree: clamp(16rem, 22vw, 26rem)
      canvas: minmax(22rem, 1fr)
      inspector: clamp(18rem, 26vw, 32rem)
  import/conflict drawer: clamp(10rem, 24dvh, 18rem)
```

Narrow layout:

```
app: height 100dvh
  header: auto
  tab bar: Tree | Canvas | Inspector | Import
  active panel: minmax(0, 1fr), overflow auto
```

The exact CSS can change during implementation, but acceptance must include viewport-resize checks.

### Canvas scaling and coordinate math

Responsive UI layout does not mean stored ROI/anchor coordinates become CSS pixels. Workspace coordinates remain data-space coordinates for the captured instrument frame.

The canvas must maintain an explicit transform:

```ts
type CaptureFrame = {
  imageWidth: number;
  imageHeight: number;
  originX: number;
  originY: number;
  coordinateScaleX: number;
  coordinateScaleY: number;
  coordinateSpace: "screen" | "image" | "fixture";
};
```

The rendered canvas may shrink, expand, zoom, and pan with the browser window. Saved coordinates are computed from the capture frame's natural coordinate system, not from CSS element dimensions.

Acceptance must prove that resizing the browser changes only the display transform, not the saved `x`, `y`, `w`, `h` values for an unchanged ROI/anchor.

## Web UI layout and behavior

### Header

Always visible. Shows:

- active path;
- source (`settings`, `starter`, or explicit candidate);
- current hash;
- dirty/valid/invalid state;
- buttons: `Validate`, `Save`, `Request Activation`, `Open in TUI command help`.

### Left panel: workspace tree

The tree is first-slice scope.

Required behavior:

- nested groups;
- expand/collapse;
- search/filter by name, ref, tags, type, CLI name;
- active checkbox for groups, ROIs, anchors, CLI parameters, and CLI actions;
- group active cascade to descendants;
- dirty and invalid markers;
- forced-activation marker when linked behavior activates related items;
- add/edit/delete group, ROI, and anchor;
- move item between groups;
- cycle prevention for group parent changes.

Rows should show type badges: `GROUP`, `ROI`, `ANCHOR`, `PARAM`, `ACTION`.

### Center panel: screenshot canvas

Required behavior:

- load or refresh a screenshot/capture frame;
- render ROI rectangles and anchor markers over the image;
- select item from canvas and focus it in tree/inspector;
- select item from tree and highlight it on canvas;
- draw ROI rectangle;
- move/resize selected ROI;
- pick or drag anchor point;
- zoom, fit-to-panel, 100%, pan;
- coordinate readout;
- keyboard nudge: arrow keys move 1 unit, shift+arrow moves 10 units;
- cancellation with Escape.

The first implementation may use a deterministic screenshot fixture for automated tests and a browser/user-provided capture frame for live use. If native screen capture is added, it must report coordinate origin and scale metadata; otherwise saved coordinates must be labeled as image-relative.

A3 acceptance must not require a live instrument window. The visual semantic loop uses fixture screenshots/images with known dimensions and known target regions. The test draws ROI rectangles and anchor points in the browser UI, captures the rendered UI/canvas, and compares the saved workspace coordinates against the actual image region selected in the rendered screenshot. ROI pass/fail means the saved `x`, `y`, `w`, and `h` describe the same image region the operator drew, with no systematic offset from layout scaling, canvas fit, scroll position, zoom, pan, device pixel ratio, or browser resize. Anchor pass/fail means the saved `x` and `y` land on the same image pixel/feature the operator clicked, with the same no-offset guarantee.

### Right panel: selected item inspector

Inspector changes by item type.

Shared fields:

- name/ref;
- active;
- group;
- tags;
- description;
- linked observables;
- raw payload preview.

ROI fields:

- `x`, `y`, `w`, `h`;
- linked observables if present;
- numeric coordinate editing.

Anchor fields:

- `x`, `y`;
- linked ROIs;
- linked observables;
- numeric coordinate editing.

CLI parameter/action fields:

- CLI name;
- enabled flag;
- get/set/ramp/action permissions;
- writable/readable flags;
- safety metadata;
- linked observables;
- raw capability payload preview.

### Bottom panel: CLI import and conflicts

Required behavior:

- input/select CLI name;
- run `cli_name capabilities`, with fallback to `cli_name capacities`;
- parse JSON object containing `parameters.items[]` and `action_commands.items[]`;
- imported entries default disabled;
- identical entries are skipped;
- changed entries with same `(CLI_Name, name)` become conflict rows;
- conflict rows show existing value, imported value, diff summary, and resolution choice: keep existing, use imported, skip;
- global actions: keep all existing, use all imported, apply selected resolutions, cancel import;
- import remains staged until save.

## Error handling

- Invalid draft: show errors in a validation panel and link each error to the relevant tree item/inspector field where possible. Do not write target and do not stage activation.
- Save failure: preserve draft in browser state; do not report success; show target path and error.
- Write succeeded but activation pending: show explicit pending state and the exact Pi command to run.
- Activation command fails reload: report that file selection may have changed but active context did not refresh; do not claim the workspace is active.
- CLI import failure: show attempted executable/subcommand, exit status, stderr, and parse error; draft stays unchanged.
- Browser/server disconnect: make save state explicit and preserve local unsaved changes in memory until reconnect if possible.
- Unsaved navigation: warn before leaving or opening another workspace.

## Security and permission boundaries

- A3 binds only to `127.0.0.1`.
- The server uses a random session token; mutating requests must include it.
- Do not enable broad CORS.
- A3 writes only local workspace files chosen by the operator. Remote approved-destination policy is deferred to A4.
- The web UI does not run instrument CLI mutations. `import-cli` may run capability-discovery commands only.
- The web UI does not call `click_anchor`, `set_field`, `cli_set`, `cli_ramp`, or `cli_action`.
- The web UI does not send data outside localhost.

## Accessibility and usability

- Canvas is not the only editing surface; every coordinate is editable in text/numeric fields.
- Tree uses keyboard-navigable semantics.
- Conflict panel is a real table with keyboard-focusable controls.
- Dirty, invalid, active, and selected states cannot rely only on color.
- Controls have labels, not icon-only affordances.
- Validation errors focus the relevant panel/field.
- Panel scrollbars must be visible or discoverable in each panel when content exceeds bounds.
- Overlay colors must remain legible on dark and bright screenshots.

## Testing and semantic acceptance

### Unit/service coverage

- Workspace edit helpers preserve unknown fields and update only intended fields.
- Group cascade and cycle prevention behave like legacy Quailbot.
- ROI/anchor edits round-trip through `loadWorkspace`.
- CLI import merge behavior covers added, identical skipped, conflict keep/import/skip, and disabled-by-default imports.
- Invalid drafts do not overwrite target files.
- Pending activation records target path and expected hash but does not mutate active runtime context.

### Web server coverage

- `GET /api/workspace` returns active workspace JSON, summary, path/source/hash.
- Mutating requests without token fail.
- `POST /api/validate` rejects malformed workspace without writes.
- `POST /api/write` writes through A2 and returns before/after hash.
- `POST /api/request-activation` stages pending activation only after a successful write/validation.

### Responsive layout acceptance

Run browser acceptance at several viewport sizes, including at least:

- wide desktop;
- medium laptop;
- narrow/tall terminal-adjacent window.

Acceptance criteria:

- no body-level horizontal or vertical overflow during normal use;
- each panel stays inside the viewport;
- each panel scrolls internally when content exceeds available space;
- resizing the browser does not move saved ROI/anchor coordinates unless the user edits them;
- canvas overlays remain aligned with the screenshot after resize, zoom, and pan;
- the narrow layout switches to tabs/stacking instead of squeezing panels into unusable overflow.

### Visual geometry acceptance without a real instrument UI

Because no real instrument interface is available for this phase, the browser visual loop is proven against deterministic screenshot/image fixtures. This is still semantic acceptance: it verifies that the web calibrator's displayed rectangle/point and the workspace coordinates agree.

Required fixture tests:

1. Load a screenshot fixture with known natural dimensions and visible landmarks.
2. Draw an ROI rectangle over a known region in the web UI.
3. Capture/read the rendered canvas overlay and saved draft JSON.
4. Assert saved `x`, `y`, `w`, and `h` map back to the same natural-image region the overlay covers.
5. Click an anchor on a known landmark.
6. Capture/read the rendered marker and saved draft JSON.
7. Assert saved `x` and `y` map back to the same natural-image point the marker covers.
8. Repeat after browser resize, panel scroll, canvas fit-to-panel, zoom, and pan.
9. Assert that layout changes alter only the display transform, not the saved natural-image coordinates.

Preserved artifacts should include the source fixture image, rendered UI screenshots before/after resize, workspace JSON before/after, and a coordinate comparison table showing expected image-space coordinates, saved workspace coordinates, and deltas.

### Real TUI + browser acceptance

The end-to-end A3 acceptance should use both the browser and the real Pi TUI:

1. Launch Pi visibly.
2. Run `/quailbot-workspace open`.
3. Browser opens local calibrator.
4. Browser loads active workspace summary.
5. Load a deterministic screenshot/image fixture in the canvas.
6. Add/edit group, draw an ROI over a known image region, and pick an anchor on a known image landmark.
7. Capture rendered UI/canvas screenshots and verify saved ROI/anchor coordinates match the actual image region/point with no offset.
8. Resize browser and verify panel bounds/scrollbars and coordinate stability.
9. Import fake non-`nqctl` CLI capabilities and resolve at least one conflict.
10. Validate draft; invalid state should block save.
11. Save valid draft through A2; preserve before/after hash.
12. Request activation from browser.
13. Run `/quailbot-workspace activate-pending` in Pi.
14. Verify reload/readback: `/quailbot-workspace show` reports selected path/source/hash.
15. Ask the agent a normal prompt that should answer from hidden `WORKSPACE` without tool calls, proving context refresh.

## Future extraction seam for A4

A3 should keep the web UI route logic separate from Pi command lifecycle so A4 can later run the same UI from a supervised host service.

Do now:

- separate route handlers from Pi command code;
- define a small workspace UI backend interface for `getWorkspace`, `validateDraft`, `writeDraft`, `stageActivation`, and `importCliCapabilities`;
- keep localhost binding/token policy isolated from route logic.

Do later in A4:

- remote binding;
- auth;
- approved destination policy;
- multi-client concurrency;
- job queue/cancellation;
- durable experiment evidence;
- host/client workspace preview/edit.

## Open checks before implementation planning

These are checks, not approval gates:

1. Confirm the exact Pi command context and whether any API besides command handlers can trigger reload. If not, keep `activate-pending` as specified.
2. Inspect at least one real CLI capability payload, or create a documented fake payload if no driver is available, before locking import parser tests.
3. Add/verify a legacy `GUI` wrapper fixture so loader compatibility is explicit.
4. Use deterministic fixture screenshots/images for first-slice visual acceptance. Native capture can be added later, but the coordinate transform must already be expressed through `CaptureFrame` metadata so live capture can plug in without changing ROI/anchor semantics.
