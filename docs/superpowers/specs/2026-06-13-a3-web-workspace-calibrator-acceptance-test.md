# A3 Web Workspace Calibrator Acceptance Test

## Purpose

Prove the browser workspace calibrator preserves real workspace semantics: visual ROI/anchor coordinates survive browser resizing and save through the A2 workspace service; CLI capability import works for non-`nqctl` payloads; pending activation reloads Quailbot context through the Pi command path.

## Fixture targets

- ROI target: `x=120`, `y=80`, `w=240`, `h=160`.
- Anchor target: `x=520`, `y=300`.
- Fixture image: `tests/workspace-ui/fixtures/calibration-frame.svg`.

## Required evidence directory

Preserve each run under `.opencode/artifacts/a3-web-workspace-calibrator-e2e/<timestamp>/`:

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
tui-observations.md
```

## Automated gate

Run before manual/browser acceptance:

```powershell
npm run typecheck && npm run dev:release && npx vitest --run tests/workspace/load-workspace.test.ts tests/workspace/workspace-service.test.ts tests/workspace-ui/draft.test.ts tests/workspace-ui/geometry.test.ts tests/workspace-ui/cli-import.test.ts tests/workspace-ui/layout-contract.test.ts tests/workspace-ui/server.test.ts tests/e2e/dev-release-adoption.test.ts && npm run dev:check && git diff --check
```

## Browser geometry acceptance

1. Start the local calibrator against a workspace containing the fixture ROI and anchor.
2. Open the returned `http://127.0.0.1:<port>/` URL in a browser.
3. Capture `wide-before.png` at a wide viewport.
4. Verify the ROI and anchor overlay align to the fixture target region.
5. Resize to a narrow viewport; capture `narrow-after.png`.
6. Return to a wide viewport; capture `wide-after.png`.
7. Save through the browser/API path and preserve `http/write-request.json` and `http/write-response.json`.
8. Read the saved workspace JSON and write `coordinate-comparison.json` with zero deltas:

```json
{
  "roi": {
    "expected": { "x": 120, "y": 80, "w": 240, "h": 160 },
    "saved": { "x": 120, "y": 80, "w": 240, "h": 160 },
    "delta": { "x": 0, "y": 0, "w": 0, "h": 0 }
  },
  "anchor": {
    "expected": { "x": 520, "y": 300 },
    "saved": { "x": 520, "y": 300 },
    "delta": { "x": 0, "y": 0 }
  }
}
```

Pass condition: browser resize/scroll/zoom/pan does not change saved ROI/anchor coordinates.

## CLI import acceptance

1. Use a fake non-`nqctl` capability payload.
2. Import it through `/api/import-cli` or the browser import panel.
3. Preserve the request/response.
4. Confirm imported entries use the payload CLI name, are disabled by default, and conflicts require explicit resolution.

Pass condition: no `nqctl` hardcoding appears in imported refs or workspace JSON.

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
