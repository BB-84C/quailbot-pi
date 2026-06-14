# A3 Web Workspace Calibrator Acceptance Test

## Purpose

Prove the browser workspace calibrator preserves real workspace semantics: visual ROI/anchor coordinates are drawn over a real captured PNG substrate, survive browser resizing, and save through the A2 workspace service; CLI capability import works for workspace-declared non-`nqctl` payloads; pending activation reloads Quailbot context through the Pi command path.

## Capture substrate

- The browser canvas must render an actual image element backed by `.quailbot-pi/workspace-capture.png` for the UI session.
- The acceptance harness may use a copied real screenshot from `D:\quailbot\assets\...`, but it must not use hardcoded SVG/DOM targets as the proof substrate.
- ROI/anchor fidelity is measured against the rendered PNG image coordinate frame: the `<image>` dimensions, SVG `viewBox`, overlay attributes, overlay CSS bounding boxes, and sampled image pixels must be preserved.

## Required evidence directory

Preserve each run under `.opencode/artifacts/a3-web-workspace-calibrator-e2e/<timestamp>/`:

```text
runtime/.quailbot-pi/workspace-capture.png
screenshots/real-capture-page.png
screenshots/real-capture-collapsed.png
workspace/before.json
workspace/after.json
http/write-request.json
http/write-response.json
dom-evidence.json
image-coordinate-evidence.json
click-coordinate-evidence.json
collapse-visible-evidence.json
schema-compare.md
activation-proof/02-write-request.json
activation-proof/03-write-response.json
activation-proof/04-workspace-file-readback.json
activation-proof/05-request-activation-request.json
activation-proof/06-request-activation-response.json
activation-proof/07-activation-command-readback.json
activation-proof/08-hidden-workspace-context.json
observations.md
tui-observations.md
```

## Automated gate

Run before manual/browser acceptance:

```powershell
npm run typecheck && npm run dev:release && npm test -- tests/workspace/load-workspace.test.ts tests/workspace/workspace-service.test.ts tests/workspace-ui/draft.test.ts tests/workspace-ui/geometry.test.ts tests/workspace-ui/cli-import.test.ts tests/workspace-ui/layout-contract.test.ts tests/workspace-ui/server.test.ts tests/e2e/dev-release-adoption.test.ts && npm run dev:check && git diff --check
```

## Browser geometry acceptance

1. Start the local calibrator against a workspace containing `.quailbot-pi/workspace-capture.png`, at least one ROI, and at least one anchor.
2. Open the returned `http://127.0.0.1:<port>/` URL in a browser.
3. Capture `real-capture-page.png` and verify the page contains `<image class="workspace-capture">` with dimensions matching the PNG header.
4. Verify no `[data-fixture-target]` DOM nodes exist.
5. Compare the overlay ROI bbox and anchor center against the rendered image bbox plus image-space coordinates; preserve `image-coordinate-evidence.json`.
6. Sample pixels from the PNG at ROI/anchor coordinates through browser canvas readback; preserve the sampled RGBA values.
7. Click the group collapse control and preserve `collapse-visible-evidence.json` plus `real-capture-collapsed.png`.
8. Click in draw/pick mode and preserve `click-coordinate-evidence.json` proving the dispatched browser client coordinate maps through the rendered PNG viewport to the saved image-space ROI/anchor coordinate.
9. Save through the browser/API path and preserve `http/write-request.json` and `http/write-response.json`.
10. Read the saved workspace JSON and prove saved coordinates match the edited workspace.

```json
{
  "imageSize": { "imageWidth": 1693, "imageHeight": 1885 },
  "svgViewBox": "0 0 1693 1885",
  "roiBoxDelta": { "x": 0, "y": 0, "width": 0, "height": 0 },
  "anchorCenterDelta": { "x": 0, "y": 0 },
  "hasFixtureTargets": false,
  "sampledPixels": { "roiCenter": { "rgba": [13, 25, 19, 255] } }
}
```

Pass condition: browser resize/scroll/zoom/pan does not change saved ROI/anchor coordinates; the observed overlay-to-image deltas are zero within subpixel rounding tolerance; the page loads a real PNG image; and no hardcoded fixture target DOM nodes are present.

## CLI import acceptance

1. Use a fake non-`nqctl` capability payload from a CLI name already declared by the draft workspace.
2. Import it through `/api/import-cli` or the browser import panel.
3. Preserve the request/response.
4. Confirm imported entries use the payload CLI name, are disabled by default, and conflicts require explicit resolution.

Pass condition: no `nqctl` hardcoding appears in imported refs or workspace JSON, and `/api/import-cli` rejects CLI names that are not declared by the draft workspace.

## A2 write/hash acceptance

1. Preserve `workspace/before.json`.
2. Save through the browser/API route.
3. Preserve the A2 write response, including before/after hash.
4. Preserve `workspace/after.json`.

Pass condition: A2 returns a successful write result with a new `summary.hash`, and direct readback matches the saved candidate.

## Real Pi TUI activation acceptance

Use the visible Pi TUI, not shell simulation:

1. Open a visible terminal.
2. Type: `Set-Location D:\quailbot-pi; npm run pi`.
3. Wait for the Pi TUI.
4. Run `/quailbot-workspace open`.
5. Use the browser to save and request activation.
6. Run `/quailbot-workspace activate-pending`.
7. Run `/quailbot-workspace show`.
8. Ask a normal prompt: `What active Quailbot workspace path, ROI names, anchor names, and CLI refs are loaded? Answer from context only.`
9. Preserve observations in `tui-observations.md`.

Pass condition: `activate-pending` validates the expected hash, selects the workspace, runs `ctx.reload()`, and hidden `WORKSPACE` context reflects the edited workspace after reload.

The local `activation-proof/*.json` artifacts are support evidence for the command-handler path only: they preserve browser write/request-activation request/response, direct workspace-file readback, command activation readback, and hidden `WORKSPACE` context refresh through built-extension handlers. They do not replace the visible Pi TUI observation when this spec is being used as the final operator acceptance gate.
