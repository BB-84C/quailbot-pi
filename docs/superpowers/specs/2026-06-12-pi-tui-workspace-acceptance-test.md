# Pi TUI Workspace Acceptance Test Spec

Date: 2026-06-12

## Purpose

Exercise A2 workspace management through a real Pi Agent TUI session, using visible terminal interaction as the acceptance surface. This is not a Vitest stub, not RPC, and not a shell-script shortcut. The operator must interact with the TUI the way a real user would and inspect the UI feedback/readback that Pi shows.

## Hard Interaction Constraint

- Use Windows MCP UI control for the TUI interaction: `Snapshot` with `use_vision=true`, `Click`, `Type`, `Shortcut`, and screenshots as needed.
- Do not drive the TUI with `bash`, PowerShell, RPC, or filesystem-only shortcuts.
- Do not use `windows-mcp_PowerShell` to submit commands to Pi.
- Do not replace TUI behavior with direct TypeScript imports or test stubs.
- File operations outside the TUI are allowed only for preserving this spec and later evidence artifacts; the acceptance behavior itself must happen in the visible TUI.

## Starting Condition

The user has already opened a terminal containing or ready to contain the real Pi Agent TUI. The next agent should begin by inspecting the screen:

```text
windows-mcp Snapshot(use_vision=true, use_ui_tree=true)
```

From that snapshot, determine whether the terminal is already inside Pi TUI or still at a shell prompt.

If the terminal is still at a shell prompt, use Windows MCP typing into the existing terminal, not bash/PowerShell tools, to launch:

```text
npm run pi
```

The repository script expands to build the extension and launch Pi with `.pi-state/sessions`; the important acceptance condition is that it is launched in the visible terminal, through TUI interaction.

## Test Scope

### In Scope

1. Pi TUI starts and loads the Quailbot extension.
2. `/quailbot-workspace` is accepted by the real TUI command interface.
3. `show` / `read` display active workspace path/source/hash/CLI summary.
4. `validate` accepts a valid workspace without activating it.
5. `validate` rejects a missing or invalid workspace without changing active selection.
6. `load` saves selection and triggers a real Pi reload.
7. After reload, `show` reports `source: "settings"` and the selected workspace path.
8. A normal agent prompt after reload can read the hidden `WORKSPACE` context and report the selected workspace/CLI refs without tool calls.
9. `write` writes a workspace target and returns `candidatePath`, `targetPath`, `hash`, and summary readback.
10. `write` without `--activate` does not change active workspace.
11. `write --activate` writes, selects, reloads, and refreshes active workspace readback.

### Out of Scope

- Real instrument CLI calls.
- Mutating tool execution.
- `npm run pi:mutating`.
- RPC mode.
- A4 remote host, MCP client/server, A2A, auth, job queues, or supervisor policy.
- Artificial reload-failure injection. That path is covered by automated tests; the TUI test only needs to verify normal reload behavior and visible failure handling for invalid candidates.

## Workspace Fixtures

Use the tracked non-mutating fixture:

```text
tests/workspaces/nanonis-minimal.workspace.json
```

Expected semantic contents:

- `default_cli_name`: `nqctl`
- parameter refs visible to Quailbot context: `nqctl:zctrl_setpnt`, `nqctl:current`
- `parameter_count`: `2`
- `action_count`: `1`

If a starter workspace is needed and the TUI is at a shell prompt, create/copy it only through visible terminal interaction or pre-existing repo state. Do not use bash/PowerShell tools behind the TUI to fake the acceptance path.

## Evidence Artifacts

Preserve evidence under:

```text
.opencode/artifacts/pi-tui-workspace-manual/
```

Minimum evidence:

- screenshot or copied UI text for initial TUI state;
- screenshot/text for `/quailbot-workspace show`;
- screenshot/text for valid `validate`;
- screenshot/text for invalid/missing `validate`;
- screenshot/text for `load` and post-reload `show`;
- screenshot/text for the normal agent prompt proving hidden WORKSPACE context refresh;
- screenshot/text for `write` without activation;
- screenshot/text for `write --activate` and final `show`.

If the TUI text cannot be copied reliably, screenshots are acceptable. Name them sequentially, for example:

```text
01-initial-tui.png
02-show-before.png
03-validate-valid.png
04-validate-missing.png
05-load-result.png
06-show-after-load.png
07-agent-context-after-load.png
08-write-no-activate.png
09-write-activate.png
10-final-show.png
```

## Manual TUI Test Steps

### Step 1: Inspect the Terminal

Use Windows MCP snapshot with vision enabled.

Acceptance:

- The visible terminal is identified.
- The agent can tell whether Pi TUI is already running or must be launched.
- No shell automation tool has been used to interact with Pi.

### Step 2: Launch Pi TUI If Needed

If not already in Pi, type into the visible terminal:

```text
npm run pi
```

Acceptance:

- Pi TUI becomes visible.
- The TUI accepts input.
- No `Quailbot workspace unavailable` warning appears unless the workspace state genuinely lacks a starter/selected workspace.

### Step 3: Show Current Workspace

Type in the TUI:

```text
/quailbot-workspace show
```

Acceptance:

- TUI displays a `Quailbot active workspace` JSON readback.
- Readback includes `path`, `source`, `hash`, and `cli`.
- `hash` is a 64-character hex string.
- `cli.default_cli_name` is `nqctl` for the tracked fixture.
- `cli.parameter_count` is `2` and `cli.action_count` is `1` for the tracked fixture.

### Step 4: Read Current Workspace

Type:

```text
/quailbot-workspace read
```

Acceptance:

- TUI displays the same active workspace semantics as `show`.
- No reload occurs.
- Active selection is unchanged.

### Step 5: Validate a Valid Candidate

Type:

```text
/quailbot-workspace validate tests/workspaces/nanonis-minimal.workspace.json
```

Acceptance:

- TUI displays `workspace validation passed`.
- JSON readback source is `explicit`.
- Validation does not activate the candidate.

Immediately type:

```text
/quailbot-workspace show
```

Acceptance:

- Active path/source remain whatever they were before validation.
- The candidate path is not active merely because it validated.

### Step 6: Validate a Missing Candidate

Type:

```text
/quailbot-workspace validate missing.workspace.json
```

Acceptance:

- TUI displays a warning/failure message.
- Message mentions workspace validation failure or missing workspace file.
- Active workspace remains unchanged.
- No reload occurs.

### Step 7: Load a Candidate and Verify Reload

Type:

```text
/quailbot-workspace load tests/workspaces/nanonis-minimal.workspace.json
```

Acceptance:

- TUI visibly reloads or refreshes the Pi session.
- A success readback appears only after reload completes.
- Success readback includes selected path and SHA-256 hash.

Then type:

```text
/quailbot-workspace show
```

Acceptance:

- `path` points to `tests/workspaces/nanonis-minimal.workspace.json` resolved to an absolute path.
- `source` is `settings`.
- `hash` matches the loaded workspace hash.

### Step 8: Verify Hidden WORKSPACE Context Through the Agent

Type a normal agent prompt, not a slash command:

```text
Read your current WORKSPACE context. Answer only JSON with workspace_path, default_cli_name, and cli_parameter_refs. Do not call tools.
```

Acceptance:

- Agent responds with JSON or near-JSON containing the selected workspace path.
- `default_cli_name` is `nqctl`.
- `cli_parameter_refs` includes `nqctl:zctrl_setpnt` and `nqctl:current`.
- The response does not require calling instrument CLI tools.

### Step 9: Write a Workspace Without Activation

Type:

```text
/quailbot-workspace write tests/workspaces/nanonis-minimal.workspace.json .quailbot-pi/tui-written.workspace.json
```

Acceptance:

- TUI displays `workspace written`.
- JSON readback includes `candidatePath`, `targetPath`, `hash`, and `summary`.
- `summary.source` is `written`.
- No reload occurs.

Then type:

```text
/quailbot-workspace show
```

Acceptance:

- Active workspace has not changed to `.quailbot-pi/tui-written.workspace.json`.

### Step 10: Write and Activate a Workspace

Type:

```text
/quailbot-workspace write tests/workspaces/nanonis-minimal.workspace.json .quailbot-pi/tui-active.workspace.json --activate
```

Acceptance:

- TUI reloads.
- TUI displays `workspace written and selected` after reload.
- JSON readback includes `targetPath`, `hash`, and `summary`.

Then type:

```text
/quailbot-workspace show
```

Acceptance:

- `path` points to `.quailbot-pi/tui-active.workspace.json` resolved to an absolute path.
- `source` is `settings`.
- `hash` is present and stable.

### Step 11: Invalid Write Does Not Replace Active Workspace

If an invalid candidate already exists, use it. If it does not, this case may be skipped in the first visual TUI pass and covered later by a visible-terminal-created invalid file. Do not use hidden shell automation solely to manufacture the fixture.

Command shape:

```text
/quailbot-workspace write .quailbot-pi/invalid.workspace.json .quailbot-pi/tui-active.workspace.json --activate
```

Acceptance:

- TUI displays `workspace write failed` or validation failure.
- No success message is shown.
- Active workspace remains `.quailbot-pi/tui-active.workspace.json`.
- No false reload/activation success is reported.

## Pass/Fail Criteria

Pass only if all required visible TUI behaviors have matching screenshot or copied-text evidence:

1. Real Pi TUI was used.
2. Slash command was accepted by the TUI.
3. Workspace readback displayed correct path/source/hash/CLI summary.
4. `validate` did not mutate active selection.
5. invalid/missing validation failed visibly and safely.
6. `load` triggered reload and active source became `settings`.
7. Agent prompt after reload saw the new hidden WORKSPACE context.
8. `write` returned target/hash readback.
9. `write` without activation did not change active workspace.
10. `write --activate` changed active workspace only after reload.
11. No instrument CLI or mutating tools were invoked.

Fail if any result is inferred from code or tests rather than observed through the visible TUI.

## Reporting Format

When the TUI pass is done, report in this shape:

```text
Delivered:
- Real Pi TUI launched via visible terminal.
- Commands exercised: ...

Now known:
- Exact TUI behavior for show/read/load/write is ...
- Any friction or mismatch is ...

Acceptance evidence:
- 01-initial-tui.png: ...
- 02-show-before.png: ...
- ...

Failures / gaps:
- ...

Next changes required:
- ...
```

Do not report success without evidence paths or copied readback snippets.
