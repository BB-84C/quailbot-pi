# A2 Workspace Control-Plane Substrate Design

Date: 2026-06-11

## Status

Draft for user review. This supersedes the earlier "Pi-native workspace picker/commands" framing in `ROADMAP.md`: A2 is now the reusable workspace control-plane substrate, with Pi commands as the first adapter.

## Goal

Build a single workspace management contract that works locally now and can be reused by the future remote instrument host.

A2 should let Quailbot and the operator:

- validate a workspace JSON file before activation;
- read/show the active workspace path, source, capabilities, hash, and revision metadata;
- select/switch the active workspace through persisted settings;
- apply supported workspace writes atomically after validation;
- reload the Pi session after local activation so hidden `quailbot-context`, tools, and plan state cannot stay stale.

The local Pi slash commands and later TUI picker are adapters over this contract, not the source of truth.

## Why this changed

The longer-term product is not mainly a TUI picker. Quailbot is expected to live on the instrument-side host while remote users submit experimental plans from laptops, similar to HPC job submission. That future needs host-owned workspace validation, workspace revisioning, job submission, permission checks, and durable evidence. If A2 is implemented as only a local Pi picker, A4 will likely reimplement workspace semantics.

Scheme B keeps A2 small while preserving the future seam: implement the workspace substrate once, then expose it locally through Pi commands now and remotely through the A4 host later.

## Non-goals

- Do not implement the remote host, job queue, auth, MCP client, or A2A facade in A2.
- Do not put an HTTP/A2A server inside the Pi extension.
- Do not build the full calibration/ROI editor in A2; A3 owns richer workspace editing UX.
- Do not run instrument CLI actions as part of workspace validation, selection, or writing.
- Do not generate tool names from workspace data; fixed product tools remain under `src/tools/`.

## Architecture

### 1. Workspace service

Add a small service module around existing workspace helpers. It should remain transport-neutral and file-system-backed for now.

Responsibilities:

- resolve the workspace selection from explicit path, settings, or starter path;
- load and normalize a workspace through `loadWorkspace(...)`;
- validate a candidate workspace without changing active state;
- persist active selection through `saveLastWorkspace(...)`;
- compute a stable workspace hash/revision for readback and future job binding;
- summarize the workspace using existing prompt summary logic where useful;
- support atomic writes for approved workspace update shapes.

The service should be parameterized by a state root or `cwd` rather than hardcoding process-global state. Today Pi commands pass `ctx.cwd`; later A4 can pass a host-owned state root/session root.

### 2. Pi command adapter

Register Pi commands that call the service and then use `ctx.reload()` when activation changes.

Initial command surface should be intentionally small:

- show current workspace selection and hash;
- validate a candidate workspace path;
- load/switch to a candidate workspace path;
- read a concise workspace summary;
- write a supported workspace update or full candidate only after validation and atomic persistence.

Command output should be concise for TUI readability but include enough detail for semantic verification: path, source, hash/revision, validation status, and whether reload was requested.

### 3. Reload and stale-state contract

Local activation uses persisted selection plus hard reload. Reload is part of correctness, not a UI nicety.

Expected flow:

```text
command validates candidate
-> command persists active workspace path
-> command requests ctx.reload()
-> session_start reloads workspace from settings
-> before_agent_start injects fresh hidden quailbot-context
```

This avoids hot-switching while tools, plan context, and prompt context still reference the old workspace.

### 4. Future remote-host compatibility

A4 should reuse the service semantics but not necessarily Pi's command adapter.

Remote host flow later should be able to say:

```text
client uploads or references workspace candidate
-> host validates candidate with A2 service
-> host records workspace hash/revision
-> submitted job binds to that revision
-> host activates only under supervisor/permission policy
```

The remote protocol can be HTTP/JSON first, with an MCP client as a wrapper. A2A is deferred as an optional facade if the system later needs peer agent-to-agent delegation. It should not define the core workspace/job authority.

## Supported writes

A2 should expose the low-level safe write mechanism, not the full editing UX.

Allowed in A2:

- write a full workspace JSON candidate to an approved destination after validation;
- apply narrow structured updates only if they can be validated against the same loader before activation;
- write atomically through temp file + replace/rename where practical;
- return before/after hash and validation result.

Deferred to A3:

- ROI/anchor drawing;
- calibration GUI behavior;
- interactive field editing UX;
- screenshot-backed coordinate picking.

## Error handling

- Invalid workspace candidates must not replace the active selection.
- Failed writes must not leave partial workspace files behind.
- Reload failures should be surfaced explicitly; the command result must not pretend the new workspace is active if reload was not requested or failed.
- Missing workspace should keep the existing tool behavior: instrument tools fail with a clear "workspace not loaded" message.
- Workspace management commands must not bypass mutation policy for instrument tools; they are configuration/control-plane operations, not instrument actions.

## Semantic acceptance

A2 is accepted only when a real Pi extension/session path proves these cases:

1. A valid workspace can be selected through the command adapter.
2. The selected path is persisted in the existing settings path.
3. `ctx.reload()` is requested after local activation.
4. After reload, `before_agent_start` emits hidden `quailbot-context` for the newly selected workspace.
5. An invalid candidate returns a validation failure and leaves the old active workspace intact.
6. Show/read returns path, source, hash/revision, and meaningful capability summary.
7. Supported writes are atomic, validated before activation, and return before/after hash.
8. Workspace management does not call instrument CLI drivers or perform linked-observable readback.

Support tests may cover pure service behavior, but completion requires command/extension-level evidence because reload and hidden context are the real semantics.

## Implementation shape for a future plan

Likely files:

- add `src/workspace/workspace-service.ts`;
- update `src/extension.ts` to construct/use the service and register commands;
- add tests for workspace service validation/selection/write behavior;
- extend the built-extension adoption test stub to include `registerCommand(...)` and reload assertions;
- update `ROADMAP.md` after implementation with what changed and what A4 should reuse.

## A2A stance

A2A is not rejected permanently. It is deferred.

Use A2A later only if Quailbot needs a true agent-to-agent peer surface: remote user agents negotiating with an instrument-side Quailbot agent, cross-lab delegation, or long-running multi-agent task collaboration. Even then, A2A should wrap the host API or intent/receipt flow; it should not be the internal source of workspace truth.
