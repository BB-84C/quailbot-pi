# A5 Contract-Grounded Tool-Result Projection and TUI Rendering

Date: 2026-06-15

## Status

Design approved for planning. Implementation has not started.

## Goal

Replace the current full-JSON Quailbot tool-result display with a contract-grounded projection layer that keeps the Pi TUI readable, bounds model-visible context, and preserves full structured evidence for audit/debugging.

A5 is not a new instrument result schema. It is a projection over the actual contracts already in use:

- `quail-cli-core` CLI driver contract (`capabilities`, `get`, `set`, `ramp`, `act`)
- `nqctl` as the real Nanonis quail CLI driver
- quailbot-pi's current `runCli` parsing and `QuailbotToolResult` wrapper

## Substrate findings

### Quail CLI driver contract

The CLI command surface is fixed by `quail-cli-core`:

- `capabilities`
- `get <parameter>`
- `set <parameter> [value] [--arg key=value ...] [--interval-s n] [--plan-only]`
- `ramp <parameter> <start> <end> <step> --interval-s n [--plan-only]`
- `act <action_name> [--arg key=value ...] [--plan-only]`

JSON mode is the intended stable transport. Success and error envelopes are emitted on stdout. Exit codes are meaningful: generic failure, policy blocked, invalid input, command unavailable, and connection/timeout all map to distinct codes.

The success payloads have known top-level shapes, but several nested fields are driver-defined:

- `get`: `{ parameter, value, fields, timestamp_utc }`
- `set`: `{ parameter, plan_only, result, timestamp_utc }`
- `ramp`: `{ parameter, start_value, end_value, step_value, interval_s, plan, applied, report, timestamp_utc }`
- `act`: `{ action, plan_only, result, timestamp_utc }`

`set.result`, `act.result`, `ramp.plan`, and `ramp.report` must be treated as payload-derived/driver-defined details, not universal Quailbot fields.

### Observed `nqctl` behavior against Nanonis Simulator V5

Runtime samples were taken against the already-running simulator using `nqctl`.

Grounded examples:

- `nqctl capabilities --json` returned 327 parameters and 116 action commands.
- `nqctl get bias_v --json` returned parsed JSON with `value` and `fields`.
- `nqctl set bias_v --arg Bias_value_V=0.12 --json` returned parsed JSON with `result.applied === true`.
- `nqctl ramp bias_v 0.12 0.13 0.01 --interval-s 0 --json` returned parsed JSON, but the `plan` and `report` sections are verbose.
- `nqctl act Scan_Action ... --json` can fail with a diagnostic preamble before the JSON error envelope; quailbot-pi's current parser then leaves `payload` undefined.
- `nqctl get scan_speed --json` can emit `Infinity` in stdout; JavaScript `JSON.parse` rejects it, so `payload` is undefined despite exit code 0.

These observations mean A5 must explicitly represent parse status. It must not assume that stdout always becomes a parsed payload.

### quailbot-pi wrapper behavior

`src/cli/cli-driver.ts` currently:

- spawns the workspace-declared CLI executable
- captures stdout/stderr
- parses `stdout.trim()` with `JSON.parse`
- stores parsed JSON as `payload` when parsing succeeds
- leaves `payload` undefined when stdout is empty or not strict JSON
- preserves `stdout`, `stderr`, `payload`, `argv`, and exit status in the run result

The `cli_*` tools wrap that result into `QuailbotToolResult`:

- `cli_get` returns primary result only; its `linked_observation` is only `{ refs }` when metadata declares linked refs.
- `cli_set` and `cli_ramp` run linked-observable readback after the mutation, including self-readback when the parameter is readable.
- `cli_action` runs linked-observable readback declared by the action.
- linked CLI observations each contain their own `{ ok, exit_code, stdout, stderr, payload, argv }` and can also fail to parse.
- ROI linked-observable results are currently unavailable placeholders.

`src/tools/register-tools.ts` currently serializes the entire `QuailbotToolResult` into `content[0].text` using `JSON.stringify(result, null, 2)` and stores the same object in `details`.

## Design

### Projection service

Add a pure Quailbot-owned projection service:

```text
QuailbotToolResult
  -> ToolResultProjection
      status
      action
      target
      parse_status
      payload_summary
      raw_output_summary
      linked_observation_summary
      truncation
      recency_policy
```

The projection service is the single source for both model-visible content and TUI rendering.

It must not invent fields not present in the actual payload. Any derived value must be labeled as derived from an observed payload, not as a guaranteed contract field.

### Parse status

Every CLI run summarized by A5 must distinguish parse state. The implementation can start with a compact enum, but the semantics must cover:

- parsed payload
- empty stdout / absent payload
- parse failure from non-JSON diagnostic prefix
- parse failure from non-standard JSON token such as `Infinity`
- spawn error
- timeout
- non-zero exit with parsed error envelope
- non-zero exit with unparsed stdout

Parse failures are surfaced; A5 does not silently repair them. Parser hardening is a red/yellow follow-up, not part of the first A5 implementation slice.

### Model-visible `content[0].text`

`content[0].text` becomes a bounded semantic projection, not raw pretty JSON.

Rules:

- Include `ok`, action/tool name, target parameter/action, exit code, and parse status.
- Prefer parsed `payload` when present.
- If `payload` is absent but stdout exists, include a bounded stdout preview and mark the parse failure.
- Do not echo full `action_input`; include only target-defining inputs needed for operator comprehension.
- Do not duplicate raw stdout when parsed payload already captures the same semantics.
- Show failure `error.type` / `error.message` when parsed, or a bounded stdout/stderr failure preview when not parsed.
- Summarize linked observations by ref with value/error/parse-status. Linked readback is load-bearing post-mutation evidence.
- Summarize ROI unavailable placeholders instead of repeating the full unavailable object for every ROI.

Example projections:

```text
cli_get nqctl:bias_v [ok, parsed_payload]
value: 0.17
fields: Bias value=0.17
```

```text
cli_get nqctl:scan_speed [ok, payload_parse_failed]
stdout_preview: {"parameter":"scan_speed", ... "Backward time per line": Infinity ...}
full raw stdout retained in details.primary_result.stdout
```

```text
cli_set nqctl:bias_v [ok, parsed_payload]
set: Bias_value_V=0.18
driver result: command=Bias_Set applied=true dry_run=false
readback:
  nqctl:bias_v = 0.180000007 [parsed_payload]
unresolved:
  nqctl:current_a
```

```text
cli_ramp nqctl:bias_v 0.18 -> 0.19 step=0.01 interval=0 [ok, parsed_payload]
applied=true attempted_steps=2 applied_steps=2 final_value=0.19
readback:
  nqctl:bias_v = 0.1899999976 [parsed_payload]
```

```text
cli_action nqctl:Scan_Action [fail, exit=3, payload_parse_failed]
stdout_preview: The following error appeared: Start action timeout ...
readback:
  nqctl:scan_status = 0 [parsed_payload]
  nqctl:scan_buffer = {Pixels=352, Lines=352, Number of channels=2} [parsed_payload]
  nqctl:scan_speed [payload_parse_failed]
```

### TUI rendering

Attach custom `renderCall` / `renderResult` to Quailbot tools and render from the same projection model.

Collapsed view:

- one line per tool call/result
- action, target, status, and most important value/readback

Expanded view:

- structured projection details
- parse-status notes
- truncation notes
- linked-observation summary
- no raw pretty-JSON dump by default

The TUI renderer does not replace semantic context projection. Renderer-only work would make the terminal prettier but leave model context flooding unchanged.

### Full evidence preservation

`details` remains the full original `QuailbotToolResult`.

A5 does not write runtime experiment logs or full-result sidecar files. Durable experiment evidence belongs to A7. A5 may preserve test/acceptance artifacts under `.opencode/artifacts/...` as construction evidence only.

### Recent-full CLI context policy

Add a Quailbot harness/context setting:

```ts
recentFullCliResultCount = 2
```

Meaning:

- the newest two direct `cli_*` tool results can remain fuller in model-visible content
- older direct `cli_*` tool results become summary-only in model-visible content
- the full original result remains in `details`
- `quailbot_plan_and_execute` is summary-first by default because it can nest many CLI results and bypass direct-tool recency caps

This policy must operate on provider/model-visible content, not only on `details`, because model providers see tool result content rather than renderer details.

Implementation should prefer a Pi context hook for historical message projection over provider-specific rewriting. `before_provider_request` is reserved as a fallback if the context hook cannot express the needed projection.

Default values:

- `recentFullCliResultCount = 2`
- bounded full projection size should be large enough for current decision-making but capped; exact byte thresholds are implementation details to pin in tests.

## Explicit non-goals

- No silent tolerant JSON repair in A5 first slice.
- No new universal instrument schema beyond `QuailbotToolResult` projection.
- No disk-backed runtime experiment log; that is A7.
- No Pi core rendering/truncation patch unless the plugin-level seam fails real TUI acceptance.
- No assumption that `get.value` is scalar, `set.result.applied` always exists, or action/ramp nested result shapes are universal.

## Architecture options considered

| Option | Summary | Decision |
|---|---|---|
| TUI renderers only | Compact terminal display, unchanged model context | rejected as insufficient |
| Contract-grounded projection plus renderers | Shared projection for context and TUI, full details preserved | selected |
| Parser hardening now | Try to repair prefixed JSON / `Infinity` during A5 | deferred; surface parse failure first |
| Runtime disk full-result sidecars | Write full results to disk from A5 | deferred to A7 experiment logs |
| Pi core patch | Modify global Pi rendering/truncation | deferred unless plugin seam fails |

## Acceptance plan

### Unit fixtures

Use real contract-shaped fixtures, not fantasy payloads:

- quail-cli-core-style get/set/ramp/act success payloads
- quail-cli-core-style error envelope
- nqctl `bias_v` get payload
- nqctl `bias_v` set payload
- nqctl `bias_v` ramp payload with verbose plan/report
- nqctl `scan_speed` stdout containing `Infinity`
- nqctl action failure stdout with diagnostic prefix before JSON error envelope

### Projection tests

- Parsed get result includes parameter/value/fields and omits raw stdout duplication.
- Parsed set result includes target args, known payload-derived driver fields when present, and linked self-readback.
- Parsed ramp result includes start/end/step/interval, applied/attempted/applied/final value summary, and omits full plan/report arrays from model content.
- Unparsed success result is marked `payload_parse_failed` and includes bounded stdout preview.
- Unparsed failure result is marked as failure with exit code and bounded stdout/stderr preview.
- Linked-observable summaries include per-observable parse status, value/error, unresolved refs, and ROI-unavailable summary.
- Full original result survives in `details` unchanged.

### Context policy tests

Construct historical tool-result messages with three `cli_*` results and `recentFullCliResultCount = 2`:

- newest two are projected using the fuller recent projection
- older result is summary-only
- old raw sentinel stdout is absent from model-visible content
- summary still preserves status, target, exit code, parse status, and linked readback summary

### TUI tests

- Registered Quailbot tools expose `renderResult`.
- Compact render output is bounded and contains status/target/key value.
- Expanded render output shows structured projection and truncation/parse notes without raw pretty JSON.

### Real acceptance

Run a representative Pi session against the Nanonis simulator and preserve evidence under `.opencode/artifacts/a5-tool-result-rendering/...`:

- `cli_get bias_v`
- `cli_set bias_v` with linked readback
- `cli_ramp bias_v`
- an action/error path that demonstrates payload parse failure or bounded unparsed stdout
- a context-policy proof showing older CLI results summarized after more than two direct `cli_*` results

Acceptance requires inspecting both the TUI surface and model-visible content/session data. A green unit test alone is not sufficient.

## Implementation notes for planning

Likely files:

- new `src/tools/tool-result-projection.ts`
- edit `src/tools/register-tools.ts`
- possibly edit `src/extension.ts` if using a Pi context hook for historical recency projection
- tests under `tests/tools/` and `tests/e2e/`

Keep the implementation test-driven. Start with projection fixtures and context-policy tests before changing `piToolResult`.
