# Quailbot Pi

A [Pi](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) agent
extension for operating quantum measurement instruments through a
measurement-readback action loop.

Quailbot Pi turns an instrument workspace (Nanonis STM, or any CLI driver that
conforms to the workspace contract) into a fixed agent tool surface:
parameter reads and writes, action commands, ROI screenshot readback, anchor
clicks, planned multi-step programs, and a durable per-experiment evidence
log. Mutating actions are gated behind a workspace-aware policy and produce
linked-observable readback as a separate observation from the primary tool
result.

## Quickstart

### Prerequisites

- Node.js >= 20
- Pi installed globally: `npm install -g @earendil-works/pi-coding-agent`
- A workspace JSON file describing your instrument's CLI parameters,
  actions, ROIs, and anchors. (See "Workspaces" below.)
- A working CLI driver on `PATH` whose name appears in your workspace's
  `cli_params.cli_name` field. For Nanonis the canonical driver is `nqctl`.

### Install

```bash
# Global (recommended for most users):
pi install npm:@bb84/quailbot-pi

# Project-local (recommended for shared lab setups):
cd your-project
pi install -l npm:@bb84/quailbot-pi
```

If npm is blocked on your network, install from git:

```bash
pi install git:github.com/<your-org-or-fork>/quailbot-pi
```

### First run

```bash
cd somewhere   # cwd does not affect where Quailbot state lives
pi
```

A first-run install has no workspace selected. Most Quailbot commands and
tools need an active workspace, so the first thing to do is point at one:

```
/quailbot-workspace load D:/path/to/your-workspace.json
```

If you don't have a workspace JSON yet, write a minimal one by hand or
import from the legacy Quailbot calibration tool, then use `load`. Once a
workspace is active, open the browser calibrator to edit it visually:

```
/quailbot-workspace open
```

The calibrator launches in a localhost browser tab where you can refine
ROIs, anchors, CLI parameters, and CLI actions over a real screen
capture of your instrument GUI, then save back to the workspace path.

### Mutating tools (safety gate)

By default Quailbot tools that change instrument state -- `cli_set`,
`cli_ramp`, `cli_action`, `click_anchor`, `set_field`, and any mutating
step inside `quailbot_plan_and_execute` -- are denied. To enable them,
launch Pi with `QUAILBOT_ALLOW_MUTATING_TOOLS=1` set in the environment:

```bash
# PowerShell
$env:QUAILBOT_ALLOW_MUTATING_TOOLS = "1"; pi

# bash/zsh
QUAILBOT_ALLOW_MUTATING_TOOLS=1 pi
```

The denial is enforced before any side effects -- a denied step never
touches the instrument. The denial reason is recorded in the experiment
log so an audit later can prove no mutation occurred.

## Where Quailbot state lives

By default, all Quailbot Pi state lives under your user home directory.
This is separate from Pi's own `~/.pi/` (which holds Pi-level session
and agent infrastructure); the two trees do not overlap.

```
~/.quailbot-pi/
  settings.json                 # selected workspace path (created on first load)
  workspace.json                # starter workspace path (only present if you
                                #   place or write a workspace here yourself;
                                #   not auto-created)
  workspaces/                   # default landing dir for editor saves
  workspace-capture.png         # current workspace UI screen capture
                                #   (overwrites; no per-captureId snapshots)
  workspace-capture.metadata.json
  memory/                       # named memory MDs (one per domain)
  skills/                       # named skills (one folder per skill)
  knowledge-state.json          # which memory domains are loaded
  experiments/YYYY/MM/DD/exp_*/ # one folder per agent session
    events.jsonl                # append-only event log
    blobs/
      images/                   # ROI captures live here, one PNG per capture,
        roi-<name>-<refhash>-<captureId>.png
                                #   named with the producing ROI's human name;
                                #   events.jsonl references this same path
  observations-orphan/          # ROI captures without an active session
  provider-payloads.jsonl       # optional provider request/response log
                                #   (opt-in via QUAILBOT_PROVIDER_PAYLOAD_LOG=1)
```

The sha256 of every ROI PNG is recorded on the corresponding `events.jsonl`
artifact entry for integrity verification, but the on-disk filename uses
the human-readable form; there are no sha256-named duplicate copies.

The directory is self-contained -- safe to back up, safe to delete if you
want a fresh start, safe to inspect with any file browser.

### Overriding the state location

Set the `QUAILBOT_PI_STATE_DIR` environment variable to relocate everything.
This is useful for:

- Sharding state per instrument rig: `QUAILBOT_PI_STATE_DIR=~/.quailbot-pi-rig-a pi`
- Keeping a working set on an external/SSD path
- Development checkouts that prefer repo-local state (see "For developers")

The override is read on every state-path resolution, so each Pi session
honors whatever the env had when Pi started.

### Workspace files

Workspace JSON files are user-owned and can live anywhere on disk -- your
lab repo, a shared drive, the home dir, wherever. Quailbot stores the
absolute path to the selected workspace in `settings.json`; it does not
copy the file. To switch workspaces:

```
/quailbot-workspace load D:/lab/instruments/nanonis-rig-a.json
```

The calibrator's Save and Save-As targets are constrained by the same
allowed-roots policy that gates the workspace UI's file-browser:
`~/.quailbot-pi/` and the parent directory of the currently-active
workspace are writable; nothing else is.

## Commands

- `/quailbot-workspace show` -- summarize the active workspace
- `/quailbot-workspace read` -- echo the active workspace JSON
- `/quailbot-workspace load <path>` -- select an existing workspace JSON
- `/quailbot-workspace validate <path>` -- dry-run validate without selecting
- `/quailbot-workspace write <path>` -- write a workspace candidate
- `/quailbot-workspace open` -- launch the browser calibrator
- `/quailbot-experiments where` -- print the experiments root path
- `/quailbot-experiments list` -- list local experiments
- `/quailbot-experiments show <id>` -- show timeline for one experiment
- `/quailbot-memory list` -- list known memory domains
- `/quailbot-memory load <domain>` -- load a memory domain into context
- `/quailbot-memory unload <domain>` -- unload a memory domain from context
- `/quailbot-skills list` -- list known skills
- `/quailbot-skills window <n>` -- set the skill-body context window size
- `/quailbot-settings show|cli-window|image-window|skill-window` -- runtime windows
- `/quailbot-reload reload` -- reload Quailbot extensions/skills/workspace

Run any command with no args to open its interactive menu where supported.

The agent has additional name-only tools for memory and skill content that
are not exposed as slash commands: `quailbot_memory_save`,
`quailbot_memory_search`, `quailbot_skill_write`, `quailbot_skill_edit`.
These are agent-facing only (the model invokes them); the slash commands
above are the user-facing surface.

## Experiments

Every Pi session opens an experiment under
`~/.quailbot-pi/experiments/YYYY/MM/DD/exp_*/`. The session's tool calls,
results, plan steps, ROI captures, denied mutations, and lifecycle events
are appended to `events.jsonl`. ROI screenshots written by the `observe`
tool (and inside `quailbot_plan_and_execute`) land directly inside
`blobs/images/` in the experiment folder, named
`roi-<name>-<refhash>-<captureId>.png`; `events.jsonl` references that
exact path. The sha256 of each PNG is recorded on the event's artifact
metadata for integrity verification, but the on-disk file uses the
human-readable name -- there is exactly one file per ROI capture.

Closing a session, switching workspaces (re-load with a different hash),
or shutting Pi down all write an `experiment_close` event with the
reason. Crash recovery surfaces unfinished logs as `interrupted_unknown`.

## Upgrading

```bash
pi update npm:@bb84/quailbot-pi
```

Settings, workspaces, memory, skills, and experiments persist across
upgrades because they live under `~/.quailbot-pi/`, not inside the
installed package.

## For developers

Local development uses Pi's local-path package source:

```bash
git clone <this repo>
cd quailbot-pi
npm install            # installs dev deps (pi/typebox are devDeps for dev)
npm run pi             # runs pi against the local checkout, with state
                       # rooted at <repo>/.quailbot-pi so dev state stays
                       # isolated from your real ~/.quailbot-pi/
npm test               # runs the full vitest suite
npm run test:e2e       # runs the semantic E2E suite
npm run dev:check      # runs the dev-release adoption E2E
```

The `pi` and `pi:mutating` scripts set `QUAILBOT_PI_STATE_DIR` to the
repo's `.quailbot-pi/` directory so development never touches your real
home-dir state. Each git worktree gets its own state automatically.

`.pi/settings.json` points pi at the parent directory as a package source
(`{ "packages": [".."] }`), and `package.json`'s `pi.extensions` points
at `./dist/src/extension.js`. So you need `npm run build` before each
session; the `pi`/`pi:mutating` scripts chain `dev:release` (which is
`npm run build`) for you.

## Reporting bugs

File an issue with the experiment ID and `events.jsonl` excerpt if the
problem is reproducible in a session. For workspace-loading issues,
include the workspace JSON and the output of `/quailbot-workspace
validate <path>`.
