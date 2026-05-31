# Pi RPC Bridge Handoff

> This is a working handoff for a new OpenCode session. It is intentionally separate from the root `HANDOFF.md`, which is the legacy Quailbot successor handoff and is currently ignored by git.

## Current repository state

- Repo: `D:\quailbot-pi`
- GitHub remote: `https://github.com/BB-84C/quailbot-pi` (private)
- Current tracked scaffold:
  - `.gitignore`
  - `package.json`
  - `package-lock.json`
  - `scripts/run-pi.mjs`
- Local Pi package:
  - `@earendil-works/pi-coding-agent@0.74.2`
- Local Pi state root:
  - `D:\quailbot-pi\.pi-state\agent`
- `scripts/run-pi.mjs` forces:
  - `PI_CODING_AGENT_DIR=D:\quailbot-pi\.pi-state\agent`
  - `PI_CODING_AGENT_SESSION_DIR=D:\quailbot-pi\.pi-state\agent\sessions`

## User intent

Build a bridge so OpenCode can coordinate the local Pi agent directly, without the user manually relaying messages between OpenCode and Pi.

OpenCode remains the orchestrator / verifier. Pi is a bounded worker and runtime test subject.

The bridge should let a future OpenCode session:

1. start Pi in RPC mode using the repo-local Pi install and repo-local `.pi-state`,
2. submit prompts/jobs to Pi,
3. stream and persist Pi events,
4. request state/session/messages,
5. abort safely,
6. collect artifacts needed for review: stdout/stderr logs, event JSONL, session file path, changed files, git diff, and summary.

## Why RPC instead of plain `-p`

Plain print mode is fine for simple one-shot tasks, but it has no mid-run control. The Quailbot protocol will eventually need external observation, steering, abort, and artifact collection around Pi runs.

Pi RPC mode is designed for embedding. It uses strict JSONL over stdin/stdout:

```text
commands  -> stdin, one JSON object per LF-delimited line
responses -> stdout, JSON lines with type: "response"
events    -> stdout, JSON lines from the agent event stream
```

Important docs / local sources already inspected:

- `node_modules/@earendil-works/pi-coding-agent/docs/rpc.md`
- `node_modules/@earendil-works/pi-coding-agent/dist/modes/rpc/rpc-types.d.ts`
- `node_modules/@earendil-works/pi-coding-agent/dist/modes/rpc/rpc-client.d.ts`

Do not use Node's generic `readline` for protocol framing. Pi docs warn that RPC mode uses LF-only strict JSONL and Node `readline` also splits on Unicode line separators. Implement a small LF-only buffer splitter.

## Non-goals

Do not implement Quailbot's linked-observable protocol in this bridge. That comes later.

Do not fork, clone, or patch Pi source.

Do not make Pi the final authority on whether its own work is correct.

Do not push, publish, or mutate external state from inside bridge-driven Pi jobs unless the user explicitly approves that specific action.

Do not write bridge artifacts into the repo root. Put runtime artifacts under `.opencode/artifacts/pi-rpc-bridge/...` or another ignored artifact root.

## Required files to create

Recommended minimal file layout:

```text
scripts/pi-rpc-bridge.mjs
  CLI entry point for bridge commands.

scripts/pi-rpc-client.mjs
  Small JSONL client around `node scripts/run-pi.mjs --mode rpc`.

scripts/pi-rpc-artifacts.mjs
  Artifact-directory helpers: job id, paths, stdout/stderr/event files, summary.

docs/handoffs/2026-05-30-pi-rpc-bridge-handoff.md
  This handoff. Keep it tracked.
```

If tests are introduced in the same session, prefer:

```text
tests/pi-rpc-jsonl.test.mjs
tests/pi-rpc-client.test.mjs
```

Only add a test runner dependency if the implementation actually uses it. A lightweight Node `node:test` harness is enough for the first bridge.

## Package scripts to add

Add scripts similar to:

```json
{
  "scripts": {
    "pi": "node scripts/run-pi.mjs",
    "pi:rpc": "node scripts/pi-rpc-bridge.mjs",
    "pi:rpc:smoke": "node scripts/pi-rpc-bridge.mjs smoke"
  }
}
```

Keep `npm run pi` intact as the human/manual Pi entry point.

The bridge should start Pi through `scripts/run-pi.mjs` or duplicate exactly the same environment behavior. The safest default is to spawn:

```text
node scripts/run-pi.mjs --mode rpc
```

That preserves repo-local Pi state redirection.

## Bridge command surface

Implement these commands first:

```text
npm run pi:rpc -- smoke
npm run pi:rpc -- prompt <path-to-task-md>
npm run pi:rpc -- abort <job-id>
npm run pi:rpc -- collect <job-id>
```

Recommended behavior:

### `smoke`

Starts Pi in RPC mode, sends `get_state`, records response, then shuts down cleanly.

Expected proof:

- process starts,
- response includes `command: "get_state"`,
- `data.sessionId` exists,
- artifacts are written,
- process exits or is terminated cleanly.

### `prompt <task.md>`

Creates a job artifact directory, starts Pi RPC mode, sends a `prompt` command whose message is the task file content, records all responses/events, waits until Pi becomes idle or until timeout, sends `get_state` and `get_messages`, writes a summary, then exits.

For the first implementation, a timeout is acceptable. Default to something conservative like 10 minutes and make it configurable through `--timeout-ms`.

### `abort <job-id>`

This is a placeholder until the bridge has a long-lived process registry. For the first version, document that abort is only available within a live bridge process. Do not fake abort support.

### `collect <job-id>`

Reads the artifact directory and prints a concise summary of:

- manifest,
- event count,
- response count,
- session file if known,
- git diff path if captured,
- final status.

## Artifact layout

Use ignored artifacts under `.opencode/`:

```text
.opencode/artifacts/pi-rpc-bridge/<job-id>/
  manifest.json
  task.md
  events.jsonl
  responses.jsonl
  stderr.log
  summary.md
  git-diff.patch
  session-state.json
  messages.json
```

Current `.gitignore` ignores `.opencode/`, so these artifacts should remain local.

`manifest.json` should include:

```json
{
  "jobId": "pi-rpc-YYYYMMDD-HHMMSS-xxxx",
  "createdAt": "ISO-8601",
  "cwd": "D:\\quailbot-pi",
  "piCommand": ["node", "scripts/run-pi.mjs", "--mode", "rpc"],
  "taskPath": "...",
  "status": "running | completed | failed | timed_out | aborted",
  "sessionFile": null
}
```

Do not include API keys or auth payloads in artifacts.

## RPC messages to use

From `rpc-types.d.ts`, the first bridge only needs these commands:

```json
{"id":"state-1","type":"get_state"}
{"id":"prompt-1","type":"prompt","message":"..."}
{"id":"abort-1","type":"abort"}
{"id":"stats-1","type":"get_session_stats"}
{"id":"messages-1","type":"get_messages"}
```

Useful response shape:

```json
{"id":"state-1","type":"response","command":"get_state","success":true,"data":{"sessionId":"...","sessionFile":"...","isStreaming":false}}
```

`prompt` acceptance response only means the prompt was accepted or queued. It does not mean the job is semantically complete. The bridge must continue reading events until an idle condition or timeout.

## Idle detection

For the first version, use a simple conservative loop:

1. send `prompt`,
2. record events continuously,
3. periodically send `get_state`,
4. consider the job idle when `isStreaming === false`, `isCompacting === false`, and `pendingMessageCount === 0` for two consecutive polls,
5. then send `get_session_stats` and `get_messages`,
6. write summary and exit.

Do not rely on the `prompt` response alone.

If events include an explicit `agent_end` / `turn_end`, record it, but still confirm with `get_state` before declaring the bridge job complete.

## Windows process handling

Prefer graceful shutdown:

1. if a job is timing out while Pi is active, send RPC `abort`,
2. wait briefly for an abort response and idle state,
3. only then terminate the child process if needed.

Do not start by killing the process. The user has a stable preference that kill commands for long-running processes require care and explicit permission unless the process is a child worker owned by the current command and has already been given an abort path.

The bridge-owned Pi subprocess is allowed to be cleaned up by the bridge after it has attempted RPC `abort` and recorded the timeout.

## Safety boundaries

This bridge is only a transport/control plane. It must not relax permission boundaries.

Default Pi jobs should be treated as local code-editing tasks only. If a Pi job is ever asked to touch real instruments, external services, credentials, or public remotes, the job packet must include a dry-run / confirmation policy and OpenCode must retain final approval.

The bridge must not:

- push to GitHub,
- publish npm packages,
- delete global Pi state,
- mutate `~/.pi/agent`,
- run arbitrary downloaded scripts,
- kill unrelated user processes.
## Implementation recommendation

For the first bridge, prefer importing Pi's published `RpcClient` from the local package instead of hand-writing the transport.

Evidence:

- `dist/modes/rpc/rpc-client.d.ts` exposes `RpcClient.start()`, `stop()`, `onEvent()`, `prompt()`, `abort()`, `getState()`, `getSessionStats()`, `getMessages()`, `waitForIdle()`, `collectEvents()`, and `promptAndWait()`.
- `docs/rpc.md` explicitly says Node/TypeScript users may embed Pi directly and use the subprocess RPC client when they want a subprocess-based integration.

So the default implementation path should be:

```text
scripts/pi-rpc-bridge.mjs
  -> import { RpcClient } from @earendil-works/pi-coding-agent/dist/modes/rpc/rpc-client.js
  -> pass cwd + env + args
  -> use RpcClient for lifecycle and events
```

Only fall back to a custom JSONL transport if importing the packaged `RpcClient` turns out to be awkward in practice.

## Implementation sequence

1. Add `pi:rpc` and `pi:rpc:smoke` scripts.
2. Implement `scripts/pi-rpc-bridge.mjs` with `smoke` only.
3. Verify `get_state` works and artifacts are written.
4. Add `prompt <task.md>`.
5. Add summary/collect support.
6. Only then consider abort and long-lived job registry.

## Acceptance checklist for the new session

The new session should not claim success until it can show all of:

- `npm run pi:rpc -- smoke` succeeds.
- The bridge starts Pi through repo-local state redirection, not `~/.pi/agent`.
- A `get_state` response is captured in artifacts.
- A `prompt <task.md>` run captures responses, events, and final session metadata.
- The tracked repo changes are limited to bridge code/docs/scripts and do not include `.pi-state/` or `.opencode/` artifacts.
- No root `HANDOFF.md` changes.
