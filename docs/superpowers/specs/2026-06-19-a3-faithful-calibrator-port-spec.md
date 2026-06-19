# A3 Faithful Calibrator Port — Spec

Date: 2026-06-19
Branch: `feat/a3-faithful-calibrator-port`
Status: design approved (load-bearing decisions A/B/C locked), pre-implementation.

## 0. Canonical reference (single source of truth)

The behavior to reproduce lives ONLY in the legacy Python calibrator:

- `D:\quailbot\src\quailbot\calibration\gui.py` (3547 lines) — the Tk app.
- `D:\quailbot\src\quailbot\calibration\cli_import.py` (231 lines) — CLI capability import + conflict report.
- `D:\quailbot\src\quailbot\capture.py` (26 lines) — `mss`-based screen capture + coordinate space.

The port must reproduce ALL behaviors of these files, including behaviors not enumerated here. This spec is the acceptance contract; the Python source is the tie-breaker when this spec is ambiguous.

## 1. Objective

Replace the current `src/workspace-ui/` (which is surface-only and logically wrong) with a faithful 1:1 TypeScript + web port of the legacy Tk calibrator. Same logic, same workspace JSON in/out, same interactions — GUI rendered as a web page instead of Tk.

## 2. Load-bearing decisions (locked)

- **A. Load/Export = server-side file browser.** The server exposes endpoints to list directories, load any `.json` workspace by path, and export to any path under an allowed root. Reproduces the Tk Load/Export file-dialog behavior.
- **B. Capture = corrected in-repo PowerShell.** Per-monitor-v2 DPI-aware, captures PHYSICAL pixels of the merged virtual screen, returns origin (virtual-screen left/top, may be negative) + physical width/height. No Python/`mss`/Pillow runtime dependency.
- **C. "Set agent workspace" DROPPED.** The calibrator is a pure workspace-JSON editor: load / edit / save / export. No agent-activation, no `request-activation` button, no `pendingWorkspaceActivation` from the UI, no TUI-settings/host-config writes. (The separate `/quailbot-workspace load|write` A2 command surface is out of scope for this port and untouched.)

## 3. Non-negotiable engineering constraints (root fix)

The current implementation failed because the real logic lived in an untested ~1300-line `String.raw` client blob, duplicated from tested-but-unused TS modules, "verified" by `toContain` string greps. The port MUST NOT repeat this:

1. **Single shared logic layer.** All pure logic — draft model, parse, serialize, geometry/coordinate transforms, filter, group operations, CLI import merge — lives in real `.ts` modules with NO Node-only APIs. Both the Node server and the browser client import the SAME modules. No hand-duplicated logic.
2. **Browser client is BUILT, not stringified.** The browser entry imports the shared modules and is bundled (esbuild) into a single served asset. No `String.raw` logic blob.
3. **Tests execute real behavior.** Verification = jsdom DOM execution (events → DOM → state → emitted JSON) + logic unit tests + a real-screenshot acceptance. ZERO `toContain`-on-source string-grep "tests". A test that only asserts the source text contains a substring is forbidden.
4. **Faithfulness verified against Python**, not against the port's own constants. Acceptance fixtures derive from the canonical `D:\quailbot\workspaces\workspace.json` and from Python serialization shapes.

## 4. Coordinate-space contract (correctness-critical)

This is the exact bug the old version got wrong. Reproduce precisely:

- Capture is the **merged virtual screen** (all monitors), at **physical pixel** resolution, with the process **DPI-aware** (PerMonitorV2). Equivalent to `mss.monitors[0]`.
- `origin = (left, top)` of the virtual screen; **may be negative** on multi-monitor setups.
- Stored ROI/anchor coordinates are **absolute physical screen pixels** in this merged space (i.e. they include the origin; an ROI on a left-of-primary monitor has `x < 0`).
- Display scale: `fitScale = min(canvasW/imgW, canvasH/imgH, 1.0)` (fit-to-canvas, never upscale for fit). `scale = max(0.05, fitScale * zoom)`. `zoom ∈ [0.25, 6.0]`.
- Transforms (must match Python `_canvas_to_screen` / `_screen_to_canvas`):
  - `screen→canvas: cx = (x - left) * scale ; cy = (y - top) * scale`
  - `canvas→screen: x = left + cx / scale ; y = top + cy / scale`
- Image downscaled (high-quality) when `scale < 1`.
- Zoom is **Ctrl+wheel, centered on the pointer** (preserve pointer's screen point under cursor). Pan: plain wheel = vertical, Shift/Alt + wheel = horizontal. Zoom range and 1.1×/÷1.1 step per Python `_on_zoom`.

## 5. Data model + serialization contract

Reproduce the 4 draft dataclasses and their `to_json()` EXACTLY (see `gui.py` lines ~33-279).

### RoiDraft
Fields: `name, x:int, y:int, w:int, h:int, description, tags(comma-string), active, group`.
`to_json`: `{name, x, y, w, h, description, active}` always; `tags` (split comma, trimmed, dropped if empty) as list; `group` only if non-empty.

### AnchorDraft
Fields: `name, x:int, y:int, description, tags, linked_rois:list, active, group`.
`to_json`: `{name, x, y, description, active}`; `tags` list if any; if linked non-empty, writes BOTH `linked_observables` AND `linked_ROIs` (same list); `group` if set.

### CliParamDraft (the complex one — reproduce all of lines ~94-256)
Fields: `cli_name, name, label, description, tags, enabled, group, allow_get, allow_set, allow_ramp, readable, writable, has_ramp, safety:dict|None, get_cmd:dict|None, set_cmd:dict|None, safety_mode, action_cmd:dict|None, linked_observables:list, raw_item:dict`.
- `active` is an alias for `enabled`.
- `implicit_self_observable()`: returns `name` if `name` and `allow_get` and (`allow_set` or `allow_ramp`).
- `runtime_linked_observables()`: implicit self (editable=False) first, then explicit `linked_observables` (editable=True), de-duplicated.
- `editable_linked_observables()`, and the `(auto)` display distinction.
- `sync_actions_from_metadata()`: if `action_cmd` is a dict → all of readable/writable/has_ramp/allow_* False, safety None. Else: `ramp_enabled` from safety (default True); if `set_cmd is None` → writable False; `allow_get = readable`; `allow_set = writable and set_cmd != None`; `allow_ramp = writable and set_cmd != None and has_ramp and ramp_enabled`.
- `to_json()` has TWO shapes:
  - **action_cmd entry**: `{...raw_item, CLI_Name, name, enabled, description, safety_mode(normalized), action_cmd}` (+ tags/group/linked_observables conditionals; remove `linked_ROIs`).
  - **parameter entry**: merge over `raw_item`, set name/CLI_Name/label(default name)/readable/writable/has_ramp/enabled/description, get_cmd/set_cmd (set_cmd drops `value_arg`), pop `unit/value_type/snapshot_value/vals`, `safety` (None or dict), `actions:{get,set,ramp}` from allow_*, tags/group/linked conditionals, drop `linked_ROIs`, and emit `label` FIRST in key order.
- `_normalize_safety_mode`: `alwaysallowed→alwaysAllowed`, `blocked→blocked`, else `guarded`.

### GroupDraft
Fields: `name, description, tags, active, group(parent), collapsed`.
`to_json`: `{name, description, active}` + tags/group conditionals. (`collapsed` is UI-only, not serialized.)

## 6. Workspace load / save / validate contract

### Load (`_load_workspace_raw` + `_load_workspace_data`)
- Missing file → `{rois:[], anchors:[], groups:[], tools:{}}`.
- Must be a JSON object; `rois/anchors/groups` lists, `tools` object (else ValueError).
- If top-level `GUI` key is an object, read rois/anchors/groups from it; else from root.
- CLI parse (`_parse_cli_params_block`): prefer `cli_params` block (parameters/action_commands `items` lists, plus dict-shaped fallback skipping `count`/`items`, plus legacy `actions`); else fall back to legacy `tools.cli` (`_parse_cli_parameter_drafts`: parameters + actions + action_commands). Distinguish action vs parameter by presence of `action_cmd`. Sort by `(label or name).lower()`.
- Reproduce every legacy-format branch in `_draft_from_parameter_item`, `_parse_cli_parameter_drafts`, `_parse_cli_params_block`.

### Save (`_write_workspace`)
Validation order (all must reproduce, with same error messages where reasonable):
1. Apply forced-ROI activation first.
2. ROI: non-empty name, unique across ALL kinds, w>0 and h>0.
3. Anchor: non-empty unique name; `linked_rois` filtered to existing ROI names.
4. CLI: non-empty unique name; `linked_observables` de-duplicated.
5. Group: non-empty unique name.
6. Orphan group refs (parent not in group set) reset to "".
7. Group-cycle detection → error.
Output: start from `raw`; write `rois`/`anchors`/`groups` arrays; `tools` via `_serialize_cli_tools` (legacy `tools.cli` dict form); then `cli_params` block via `_serialize_cli_params_block` (items+count form). BOTH cli representations are written. `json.dumps(indent=2, sort_keys=False)`.
- **Save** → write to current path, update current path.
- **Export** → write to chosen path, do NOT change current path.

### Forced ROI activation (`_forced_roi_names` / `_apply_forced_roi_activation`)
Any ROI linked by an ACTIVE anchor is forced active and locked (greyed, toggle disabled) in the tree.

## 7. CLI import + conflict contract (`cli_import.py` + `_load_params_from_cli`)

- `load_cli_capability_payload(cli_name)`: run `<cli_name> capabilities` (90s); on non-zero, fall back to `<cli_name> capacities`. Parse stdout JSON; root must be an object. Return payload + `used_subcommand` + error.
- Extract `parameters.items` and `action_commands.items` → drafts with `enabled=False`. Sort by `(label or name).lower()`.
- Merge with existing via `_merge_cli_param_drafts` keyed on composite `(CLI_Name, name)`: new keys appended; identical payloads skipped (counted); differing payloads → conflicts.
- On conflicts: three-way choice (keep existing / clean with loaded / abort) — Tk used `askyesnocancel`; web reproduces with a modal (Yes=keep, No=use loaded, Cancel=abort, unchanged). Generate a markdown **conflict report** (`_build_cli_conflict_report` + `_collect_field_diffs` field-level table) downloadable/viewable.
- On success: set `cli_enabled=True`, refresh list. Summary message: loaded count, identical-skipped, conflicts + resolution.
- CLI import on the server side may only probe CLI names already declared by the draft (reject arbitrary command names before spawning a subprocess).

## 8. UI structure + interactions (3-pane, reproduce `_build_ui` + handlers)

Three horizontally-split panels with **draggable sashes** and min sizes: left (items/filter/buttons/pick-tools, min ~260, fixed), center (screenshot canvas, min ~600, stretches), right (selected-item form, min ~360, stretches). Center+right stretch on window resize; outer overflow hidden; each panel scrolls internally.

**Left panel:**
- Items tree: indented by group depth, **multi-select** (extended), each row `[x]/[ ] [TAG] name` where TAG ∈ `[ROI] [ANCHOR] [GROUP] [<cli_name>]`. Clicking the left toggle-box region toggles `active`/`enabled` (group toggle cascades to descendants; multi-select toggles the whole selection to one new state per Python `_on_items_click`). Double-clicking a group collapses/expands it. Forced ROIs greyed + locked. Vertical scrollbar.
- Filter: scrollable **tag checkboxes** with counts (sorted by count desc then name), keyword entry (comma-separated terms), AND/OR toggle button, Clear button. Match over name/description/linked (anchor linked_rois, cli linked_observables) per `_match_terms`; tag filter is OR within selected tags AND-combined with keyword logic per `_item_matches_filter`. Subtree visible if itself or any descendant matches.
- Buttons: Add ROI, Add Anchor, Add Group, Load Param From CLI, Delete, Save, CLI Name entry, "CLI tools enabled" checkbox.
- "Pick on screenshot": Draw ROI box, Pick anchor point, Refresh screenshot.

**Center panel (canvas):**
- Renders captured screenshot scaled per §4; h+v scrollbars; mousewheel pan (plain=vertical, Shift/Alt=horizontal), Ctrl+wheel zoom centered on pointer.
- Selected ROI drawn as rectangle overlay; selected anchor as crosshair+circle overlay (colors/sizes per `_draw_existing_roi`/`_draw_existing_anchor`).
- Draw-ROI mode: click-drag rubber-band rect → on release set ROI x/y/w/h in screen coords (`_on_mouse_down/move/up`). Pick-anchor mode: single click → set anchor x/y in screen coords. Add ROI/Anchor must be selected before entering the corresponding mode.

**Right panel (selected-item form, scrollable):**
- Kind label; fields name/x/y/w/h/tags (each text entry with **Ctrl+Z/Y undo-redo history** per field, per `_record_entry_history`/`_on_entry_undo`/`_on_entry_redo`); group combobox (hierarchical indented options, excludes self+descendants for a group, rejects cycles with a message); description textarea (with undo/redo).
- Field visibility per kind: ROI shows x/y/w/h; Anchor shows x/y (hides w/h) + Linked Observables (anchor mode: ROI search+combo+add, list with remove); Group shows name only; CLI hides geometry, shows CLI Parameter Metadata + Linked Observables (cli mode with auto/editable distinction + get/set/ramp checkboxes; cli_action mode).
- CLI Parameter Metadata frame: `writable` checkbox (only when set_cmd present), `action.safety_mode` combo (alwaysAllowed/guarded/blocked, only for action_cmd entries), get_cmd/set_cmd description textareas (editable only when present), six safety fields (`cooldown_s, max_slew_per_s, max_step, max_value, min_value, ramp_interval_s`) + `ramp_enabled` checkbox (each enabled only when present in safety), and a read-only live "All key/value pairs" JSON payload preview reflecting `to_json()`.
- Live edit semantics: editing fields updates the draft, refreshes the list label, re-derives cli allow_* via `sync_actions_from_metadata`, updates payload preview; multi-select group reparent with cycle guard; group rename cascades to all child group refs (`_on_form_changed`).
- Empty/multi-select states reproduce `_on_select` (multi shows count + group-only edit; none clears form).

**Menu/help:** File menu → Load workspace, Export workspace (Set-agent items dropped per C). Help → workflow/controls text. (Web: a menu/toolbar surface and a help panel/modal.)

## 9. Server API surface

Localhost-only HTTP server, random per-session token (reuse existing pattern), launched by `/quailbot-workspace open`. Routes:

- `GET /` page, `GET /assets/client.js` (bundled), `GET /assets/styles.css`, `GET /assets/workspace-capture` (PNG bytes) — token-gated.
- `GET /api/workspace` — current workspace canonical JSON + summary (+ capture frame metadata: imageWidth/Height, originX/Y).
- `POST /api/capture` — trigger DPI-aware capture (§4, B), persist PNG + origin sidecar, return frame metadata.
- `POST /api/validate` — validate candidate workspace JSON (server-side, reuses workspace-service validation + the §6 save validations).
- `POST /api/save` — write workspace JSON to a target path (Save vs Export = update-current flag), atomic write + hash readback.
- `POST /api/browse` — list directories/`.json` files under an allowed root (decision A); used by Load/Export pickers.
- `POST /api/load` — load any `.json` workspace by path (under allowed root) → canonical draft JSON.
- `POST /api/import-cli` — server-side CLI capability probe + merge (only declared CLI names), returns added/skipped/conflicts + conflict report.
- All mutating routes header-token-gated; all path inputs constrained to an allowed root (no symlink/junction escape), reusing the existing path-authorization approach.

## 10. Module architecture + build

```
src/workspace-ui/
  shared/            # pure TS, imported by BOTH server and browser (no node:* imports)
    model.ts         # RoiDraft/AnchorDraft/CliParamDraft/GroupDraft + to_json
    parse.ts         # load/_draft_from_parameter_item/_parse_cli_* 
    serialize.ts     # _serialize_cli_tools/_serialize_cli_params_block/_write_workspace logic
    geometry.ts      # §4 transforms, fit/zoom
    filter.ts        # tag/keyword filter + subtree visibility
    groups.ts        # descendants, cycle, re-home, rename cascade, active cascade
    cli-import.ts     # merge, conflict, field-diff report
    validate.ts      # §6 save validations
  client/            # browser-only; imports shared/*; bundled by esbuild
    main.ts, render-tree.ts, render-canvas.ts, render-form.ts, state.ts, events.ts
  server/            # node-only
    server.ts, routes.ts, capture.ts (PowerShell), browse.ts, page.ts, styles.ts
  index.ts
```

- Build: `tsc` compiles server + shared to `dist/`. Add an **esbuild** step (new devDependency) that bundles `client/main.ts` (importing `shared/*`) into one served JS asset. `dev:release` runs both. [minor: esbuild over raw concatenation]
- Reuse the existing `/quailbot-workspace open` launch + browser-spawn + token server lifecycle; replace the route/client/logic bodies.

## 11. Acceptance plan (semantic, no false positives)

1. **Logic unit tests** (vitest, run against `shared/*`): model `to_json` for all 4 drafts incl. both CLI shapes; load/parse across legacy `tools.cli`, `cli_params` items, dict-shaped, and `GUI`-wrapped inputs; save validation (dup names, ROI w/h, anchor link filter, group cycle, orphan reset, forced-ROI); geometry round-trips incl. **negative origin** and zoom; filter AND/OR + subtree; group rename cascade / delete re-home; cli-import merge identical-skip + conflict + field-diff report.
2. **Behavior tests** (vitest + **jsdom**, execute the real client): add/select/edit/delete each kind; tree multi-select toggle + group cascade; double-click collapse; draw-ROI drag → correct screen coords; pick-anchor click → correct coords; zoom-on-pointer keeps point stable; form field undo/redo; group combobox cycle rejection; cli metadata edits update payload preview + allow_*; emitted JSON matches §5/§6.
3. **Round-trip fidelity vs Python**: load the canonical `D:\quailbot\workspaces\workspace.json`, serialize, and assert structural equivalence to the Python serializer's output shape (BOTH `tools.cli` and `cli_params`, sorted, linked fields mirrored).
4. **Real-capture acceptance**: trigger capture on this host, assert physical-pixel dimensions + origin metadata; place an ROI/anchor via the canvas and confirm stored coords map back to the captured image bbox/pixels (preserve `.opencode/artifacts/a3-faithful-calibrator/...` evidence). On a non-zero virtual-screen origin if available.
5. **Anti-regression guard**: a check that fails if any test asserts only `source.toContain(...)` for logic coverage (the prior false-positive pattern), and that `src/workspace-ui/client` contains no `String.raw` logic blob.

## 12. Out of scope

- "Set agent workspace" / agent activation / TUI-settings / host-config writes (decision C).
- The separate `/quailbot-workspace load|write|activate-pending` A2 command surface (untouched; not part of the calibrator UI).
- `mss`/Python/Pillow runtime dependencies (decision B replaces them).

## 13. Revision 1 — multi-lens review corrections (AUTHORITATIVE over conflicts above)

A 3-lens architecture review (oracle + oracle-gamma + oracle-beta) found real errors in §1-12. Where this section conflicts with earlier text, THIS section wins. Evidence preserved at `.opencode/artifacts/a3-faithful-calibrator/multi-lens/spec-review-integration.md`.

### 13.1 Layout / UI fidelity corrections
- **Pane order is `canvas | items | form`** (left→right), NOT items|canvas|form. Python adds `preview_panel(canvas)`, then `left(items)`, then `selected_panel(form)`; `left` is a variable name, not the layout (gui.py:1046-1052). Min/stretch: canvas 600/stretch, items 260/fixed, form 360/stretch.
- **Group form edits name + description + tags + parent group** (geometry + linked/CLI widgets hidden). NOT "name only" (gui.py:2447-2470, 268-279).
- **CLI get/set/ramp checkboxes are DISPLAY-ONLY/derived** in parameter mode (re-derived by `sync_actions_from_metadata`); never directly user-editable for params. CLI linked-observable editing is enabled ONLY when `set_cmd` or `action_cmd` is present (gui.py:1844-1859, 2433-2445, 2748-2776).
- **Tag filter checkboxes show the tag text only, NO counts** (counts used for sort order only) (gui.py:1571-1605).
- **Items list multi-select** must reproduce EXTENDED semantics: ctrl/cmd-toggle, shift-range from an active anchor row, `exportselection=False` (clicking canvas does NOT clear list selection); toggle fires only on the explicit toggle element, select on row body; clicking a forced ROI clears multi-select and single-selects it (gui.py:2218, 2226-2248, 963-964).
- **Wheel routing is per-region:** form area scrolls the form; canvas area pans (plain=vertical, Shift/Alt=horizontal) and Ctrl=zoom; zoom is SUPPRESSED in draw/pick modes; all handlers `preventDefault` (Tk `return "break"`) (gui.py:1111, 3394-3396, 3428).
- **Help text is a canonical literal string** (gui.py:1077-1090) — snapshot it verbatim.

### 13.2 Coordinate / capture corrections
- **Truncate toward zero (`Math.trunc`, == Python `int()`)** in BOTH transforms; never floor/round. ROI drag converts corners then `w/h = max(1, sx2-sx1)` (gui.py:3346-3360, 3498-3508).
- **Mouse mapping must include canvas scroll offset** (Python uses `canvasx/canvasy`), not just client-rect→image. Tests must cover the scrolled/panned state.
- **`_scale > 1` quirk:** Python keeps the unscaled image at zoom>1 while overlays still multiply by `_scale`, so overlays drift. DEFAULT: **FIX this** (overlays and image both honor `_scale`) `[override→ reproduce-as-parity]`. Document whichever is chosen.
- **Zoom math:** re-render FIRST (which re-derives `fitScale`), THEN read new `scale`, THEN `scale_ratio = newScale/oldScale` to recompute the scroll target so the pointer's screen point stays fixed (gui.py:3394-3428). Debounce resize re-render (~75ms).
- **Capture (decision B) hard requirements:** set PerMonitorV2 DPI awareness BEFORE any VirtualScreen/GDI/WinForms call; return `originX/originY` = `SM_X/YVIRTUALSCREEN` (may be negative) and `imageWidth/Height` = `SM_CX/CYVIRTUALSCREEN` in PHYSICAL pixels; verify PNG dimensions == returned bounds (self-check, fail loudly on mismatch); correct BGRA→PNG color order; PNG + origin metadata are written atomically and the frame metadata (incl. a `captureId`) travels WITH the image (content-addressed asset), never fetched separately.

### 13.3 Serialization / load corrections
- **Save preserves the original `raw` dict** including unknown top-level keys and a stale `GUI` block (Python does NOT delete `GUI`); `out = dict(raw)` then overwrite rois/anchors/groups/tools/cli_params; `json.dumps(indent=2, sort_keys=False)`; CLI param `to_json` emits `label` FIRST (gui.py:3237-3252, 252-256).
- **Enumerate every parse branch explicitly** (and fixture each): `linked_observables` preferred / `linked_ROIs` fallback only-if-empty; scalar-or-list linked values; CLI tags list→comma / scalar→string; action description falls back to `action_cmd.description` only when blank; `actions` object overrides derived readable/writable/has_ramp; default-enabled asymmetry (`cli_params` block=True, `cli_params` items=False, legacy `tools.cli` block=False, `tools.cli` items=True); `action_commands` skips `count`/`items`, `actions` does not; `_parse_active`/`_parse_bool` permissive coercions; missing-file returns no `groups` key (gui.py:282-633).
- **Multi-select group edit:** show `(mixed)` sentinel when selected items differ; only group editing enabled; cycle guard for selected groups (gui.py:2311-2349, 2630-2663).
- **Per-field undo/redo:** store `(text, cursor)` snapshots, truncate redo on new edit, `_set_field` RESETS history on selection change, fire change handler after undo/redo; description uses a manual stack approximating Tk `autoseparators` granularity (gui.py:2517-2593).
- **Save errors split:** validation failures → 4xx with reason; I/O failures → 5xx (Python lumps both into one messagebox; the web API must distinguish).

### 13.4 CLI import corrections
- `capabilities` then fall back to `capacities` **only on non-zero exit** (NOT on JSON-parse failure or zero-exit garbage); root must be an object; 90s timeout PER attempt; `ok = payload != null && !error` (cli_import.py:28-69).
- Subprocess: `spawn(cliName, [sub], {shell:false})`; `cliName` must match `/^[A-Za-z0-9_.-]+$/` AND be a CLI name already declared by the draft, validated BEFORE spawn. The web "CLI Name" field must update the draft before import (avoid first-import deadlock on a blank workspace).
- Conflict modal lists ONLY conflicting rows (identical-skip rows never shown); Yes=keep existing, No=use loaded, Cancel=abort-unchanged; field-level markdown report (cli_import.py:154-231).

### 13.5 Build / architecture corrections
- `tsc --noEmit` type-checks server + shared + client; esbuild bundles `client/main.ts` (importing `shared/*`) to a tracked `dist` asset; server serves the BUILT bytes (not an imported source string); `dev:release` runs tsc build + esbuild; enable esbuild sourcemaps in dev.
- **Guard `shared/**` against Node:** lint/import-graph rule banning `node:*`, `fs`, `path`, `child_process` in `shared/`; CI fails on violation.
- **Delete (don't hide) dropped-C surfaces:** remove `/api/request-activation`, `runtime.pendingWorkspaceActivation`, the client activation control; regression test asserts their absence.
- **Path policy (real-world-state boundary):** resolve every path input with `fs.realpathSync`, reject if not under the allowed root (post-realpath), reject junctions/symlinks/UNC/8.3/ADS/`:`-in-basename/drive-switch; case-insensitive compare on Windows. Server bind `127.0.0.1` only; reject `Host` not `127.0.0.1|localhost:<port>` (DNS-rebind); token in header; ALL routes incl. `/`, `/assets/client.js`, `/assets/styles.css` token-gated. Atomic write = tmp+fsync+rename+reread+sha256-verify-against-written-bytes.

### 13.6 Test-strategy corrections (anti-false-positive)
- **Three partitions:** (1) pure-logic/geometry unit tests (vitest) vs COMMITTED Python-golden fixtures; (2) event-wiring tests (vitest+jsdom) that execute the BUILT bundle and assert handlers call the shared transforms and emit correct JSON; (3) visual/canvas/zoom/pan/scroll acceptance via **Playwright/real browser** (jsdom cannot prove canvas geometry).
- **Python-golden fixtures are committed**, generated by running the actual `gui.py`/`cli_import.py` serializers once over branch-covering inputs (incl. the canonical `D:\quailbot\workspaces\workspace.json`, GUI-wrapped, unknown-key, all CLI parse branches, negative coords). Tests compare key-order-preserving equality, not against the port's own constants.
- **Required negative-origin test** (not "if available"): mock a frame with `originX=-1920`, place ROI at canvas (0,0) scale 1.0, assert stored `x=-1920`, round-trip stable.
- **Bundle single-source audit:** parse esbuild metafile; assert each `shared/*` module included once and `client/**` defines no duplicate of a shared symbol (`screen_to_canvas`, `to_json`, etc.).
- **Anti-regression lint (AST, not slogan):** fail if a test does `toContain` on a `readFileSync` source string, and fail if `client/**` contains a `String.raw` logic blob over N lines.

### 13.7 Sequencing (build + verify in this order; vertical slice before breadth)
1. **Python-golden fixture harness** (generate + commit reference outputs across all parse/serialize branches).
2. **Capture + geometry parity vertical slice:** DPI-aware capture with self-check; `Math.trunc` transforms; ONE end-to-end negative-origin round-trip (load synthetic frame originX=-1920 → draw ROI → save → reload → identical coords) green vs Python reference.
3. **Build spine:** shared modules + esbuild bundle + server-served asset + the 3 test partitions wired + node-import guard.
4. Model + load/save/validate (no UI; drive via fetch vs golden).
5. Items tree (EXTENDED multi-select + toggle region + forced-ROI).
6. Canvas (draw/pick/zoom/pan).
7. Right-panel form (undo/redo, group combobox cycle reject, multi-select `(mixed)`).
8. Filter (tags + keyword + AND/OR + subtree).
9. CLI metadata frame + payload preview.
10. CLI import (probe + conflict modal + report).
11. File browser (Load/Export within allowed root).
Defer pure chrome (sash handle look, help modal styling); pin help-text CONTENT.

### 13.8 Open gate (needs user)
- **Allowed-root policy** for the file browser (A). The real workspace `D:\quailbot\workspaces\workspace.json` lives OUTSIDE this repo. DEFAULT proposed: allowed root = directory of the currently active/loaded workspace (so siblings load/export), plus cwd `.quailbot-pi` for captures; widen to "any local path the OS user can read" only on explicit request. Confirm or widen.


