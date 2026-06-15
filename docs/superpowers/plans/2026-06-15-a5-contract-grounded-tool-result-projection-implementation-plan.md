# A5 Contract-Grounded Tool Result Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a contract-grounded Quailbot tool-result projection layer that bounds model-visible content, renders compact Pi TUI rows, preserves full structured `details`, and keeps only the latest two direct `cli_*` results in fuller model-visible form.

**Architecture:** Add a pure projection module for `QuailbotToolResult`, a small context-projection module for historical `toolResult` messages, and a renderer module that uses the same projection for Pi TUI output. Wire the projection into `piToolResult()` and register a `context` hook so content, not only TUI rendering, is bounded.

**Tech Stack:** TypeScript, Node built-ins, existing Pi extension API, `@earendil-works/pi-tui` `Text`, Vitest, real `nqctl`/Nanonis Simulator acceptance evidence.

---

## File structure

### Create

- `src/tools/tool-result-projection.ts` — pure `QuailbotToolResult` projection, parse-status detection, bounded content builders, CLI linked-observation summaries.
- `src/tools/tool-result-context.ts` — Pi message/context projection for latest-two direct `cli_*` results.
- `src/tools/tool-result-renderer.ts` — `renderCall` / `renderResult` helpers backed by the projection service.
- `tests/tools/tool-result-projection.test.ts` — contract-shaped projection fixtures and content assertions.
- `tests/tools/tool-result-context.test.ts` — historical context recency policy tests.
- `tests/tools/tool-result-renderer.test.ts` — TUI renderer bounded compact/expanded output tests.

### Modify

- `src/tools/register-tools.ts` — replace `JSON.stringify(result, null, 2)` model content with projected content; attach renderers to all Quailbot tools.
- `src/extension.ts` — register the context hook that rewrites historical tool result messages.
- `tests/tools/quailbot-plan-and-execute.test.ts` — update the registration expectation from full JSON to projected content while preserving full `details`.
- `tests/e2e/dev-release-adoption.test.ts` — expect the new `context` handler and verify built tool definitions expose renderers.
- `ROADMAP.md` — close the implementation round after acceptance.

---

## Task 1: Projection fixtures and parse-status tests

**Files:**
- Create: `tests/tools/tool-result-projection.test.ts`
- Create: `src/tools/tool-result-projection.ts`

- [ ] **Step 1: Write failing projection tests for parsed and unparsed CLI results**

Create `tests/tools/tool-result-projection.test.ts` with this initial content:

```ts
import { describe, expect, it } from "vitest";

import {
  buildQuailbotToolContent,
  DEFAULT_RECENT_FULL_CLI_RESULT_COUNT,
  projectQuailbotToolResult,
} from "../../src/tools/tool-result-projection.js";
import type { QuailbotToolResult } from "../../src/tools/tool-result.js";

describe("tool result projection", () => {
  it("summarizes parsed cli_get payload without duplicating raw stdout", () => {
    const result = cliGetBiasResult();

    const projection = projectQuailbotToolResult(result);
    const text = buildQuailbotToolContent(result);

    expect(projection.status).toBe("ok");
    expect(projection.action).toBe("cli_get");
    expect(projection.target).toBe("nqctl:bias_v");
    expect(projection.parseStatus).toBe("parsed_payload");
    expect(text).toContain("cli_get nqctl:bias_v [ok, parsed_payload]");
    expect(text).toContain("value: 0.17");
    expect(text).toContain("fields: Bias value=0.17");
    expect(text).not.toContain("RAW_STDOUT_SHOULD_NOT_APPEAR_WHEN_PAYLOAD_EXISTS");
  });

  it("surfaces unparsed successful stdout with a bounded preview", () => {
    const raw = `{"parameter":"scan_speed","value":{"Backward time per line": Infinity},"tail":"${"Y".repeat(5000)}"}`;
    const result = cliGetScanSpeedUnparsed(raw);

    const projection = projectQuailbotToolResult(result, { summaryMaxChars: 700 });
    const text = buildQuailbotToolContent(result, { summaryMaxChars: 700 });

    expect(projection.parseStatus).toBe("payload_parse_failed_nonstandard_json");
    expect(text).toContain("cli_get nqctl:scan_speed [ok, payload_parse_failed_nonstandard_json]");
    expect(text).toContain("stdout_preview:");
    expect(text).toContain("Infinity");
    expect(text.length).toBeLessThanOrEqual(700);
    expect(text).toContain("truncated");
  });

  it("uses recent-full mode for bounded raw diagnostic detail", () => {
    const result = cliActionUnparsedFailure("RECENT_ACTION_FAILURE_SENTINEL");

    const text = buildQuailbotToolContent(result, { mode: "recent-full", fullMaxChars: 1200 });

    expect(text).toContain("cli_action nqctl:Scan_Action [fail, exit=3, payload_parse_failed_non_json_prefix]");
    expect(text).toContain("RECENT_ACTION_FAILURE_SENTINEL");
    expect(text).toContain("full raw result retained in tool details");
    expect(text.length).toBeLessThanOrEqual(1200);
  });

  it("defaults recentFullCliResultCount to two", () => {
    expect(DEFAULT_RECENT_FULL_CLI_RESULT_COUNT).toBe(2);
  });
});

function cliGetBiasResult(): QuailbotToolResult {
  return {
    ok: true,
    action: "cli_get",
    action_input: { cli_name: "nqctl", parameter: "bias_v" },
    primary_result: {
      parameter: "bias_v",
      ok: true,
      exit_code: 0,
      stdout: "RAW_STDOUT_SHOULD_NOT_APPEAR_WHEN_PAYLOAD_EXISTS",
      stderr: "",
      payload: {
        parameter: "bias_v",
        value: 0.17,
        fields: { "Bias value": 0.17 },
        timestamp_utc: "2026-06-15T17:42:52.097990Z",
      },
      argv: ["nqctl", "get", "bias_v"],
    },
  };
}

function cliGetScanSpeedUnparsed(stdout: string): QuailbotToolResult {
  return {
    ok: true,
    action: "cli_get",
    action_input: { cli_name: "nqctl", parameter: "scan_speed" },
    primary_result: {
      parameter: "scan_speed",
      ok: true,
      exit_code: 0,
      stdout,
      stderr: "",
      payload: undefined,
      argv: ["nqctl", "get", "scan_speed"],
    },
  };
}

function cliActionUnparsedFailure(marker: string): QuailbotToolResult {
  return {
    ok: false,
    action: "cli_action",
    action_input: { cli_name: "nqctl", action_name: "Scan_Action", args: { Scan_action: 0, Scan_direction: 1 } },
    primary_result: {
      action_name: "Scan_Action",
      args: { Scan_action: 0, Scan_direction: 1 },
      ok: false,
      exit_code: 3,
      stdout: `The following error appeared: ${marker}\n{ "ok": false, "exit_code": 3 }`,
      stderr: "",
      payload: undefined,
      argv: ["nqctl", "act", "Scan_Action", "--arg", "Scan_action=0", "--arg", "Scan_direction=1"],
    },
  };
}
```

- [ ] **Step 2: Run the failing projection tests**

Run:

```powershell
npm test -- tests/tools/tool-result-projection.test.ts
```

Expected: FAIL because `src/tools/tool-result-projection.ts` does not exist.

- [ ] **Step 3: Implement the first projection service slice**

Create `src/tools/tool-result-projection.ts` with this complete implementation skeleton and fill only the functions shown here:

```ts
import type { QuailbotToolResult } from "./tool-result.js";

export const DEFAULT_RECENT_FULL_CLI_RESULT_COUNT = 2;
export const DEFAULT_SUMMARY_MAX_CHARS = 2_000;
export const DEFAULT_FULL_MAX_CHARS = 12_000;

export type ProjectionMode = "summary" | "recent-full";
export type ProjectionStatus = "ok" | "fail";
export type PayloadParseStatus =
  | "parsed_payload"
  | "payload_absent_empty_stdout"
  | "payload_parse_failed_non_json_prefix"
  | "payload_parse_failed_nonstandard_json"
  | "payload_parse_failed_unclassified"
  | "aggregate_result"
  | "spawn_error"
  | "timeout";

export type ProjectionOptions = {
  mode?: ProjectionMode;
  summaryMaxChars?: number;
  fullMaxChars?: number;
};

export type ToolResultProjection = {
  status: ProjectionStatus;
  action: string;
  target: string;
  parseStatus: PayloadParseStatus;
  headline: string;
  lines: string[];
  truncated: boolean;
};

export function projectQuailbotToolResult(
  result: QuailbotToolResult,
  options: ProjectionOptions = {},
): ToolResultProjection {
  const primary = record(result.primary_result);
  const action = typeof result.action === "string" ? result.action : "unknown";
  const status: ProjectionStatus = result.ok ? "ok" : "fail";
  const target = targetFor(result);
  const parseStatus = result.action === "quailbot_plan_and_execute" ? "aggregate_result" : parseStatusFor(primary);
  const headline = headlineFor({ action, status, target, parseStatus, primary });
  const lines = detailLinesFor(result, primary, parseStatus, options.mode ?? "summary");
  const bounded = boundLines([headline, ...lines], maxCharsFor(options));

  return {
    status,
    action,
    target,
    parseStatus,
    headline: bounded.lines[0] ?? headline,
    lines: bounded.lines.slice(1),
    truncated: bounded.truncated,
  };
}

export function buildQuailbotToolContent(result: QuailbotToolResult, options: ProjectionOptions = {}): string {
  const projection = projectQuailbotToolResult(result, options);
  const text = [projection.headline, ...projection.lines].join("\n");
  const suffix = "full raw result retained in tool details";
  const withSuffix = projection.truncated ? `${text}\n[truncated; ${suffix}]` : `${text}\n[${suffix}]`;
  return boundText(withSuffix, maxCharsFor(options));
}

export function isDirectCliAction(action: unknown): action is "cli_get" | "cli_set" | "cli_ramp" | "cli_action" {
  return action === "cli_get" || action === "cli_set" || action === "cli_ramp" || action === "cli_action";
}

function targetFor(result: QuailbotToolResult): string {
  const input = record(result.action_input);
  const primary = record(result.primary_result);
  const cliName = typeof input.cli_name === "string" ? input.cli_name : firstArg(primary.argv);
  if (result.action === "cli_action") {
    const actionName = stringValue(input.action_name) ?? stringValue(primary.action_name) ?? "unknown_action";
    return `${cliName ?? "cli"}:${actionName}`;
  }
  const parameter = stringValue(input.parameter) ?? stringValue(primary.parameter) ?? "unknown_parameter";
  return `${cliName ?? "cli"}:${parameter}`;
}

function headlineFor({
  action,
  status,
  target,
  parseStatus,
  primary,
}: {
  action: string;
  status: ProjectionStatus;
  target: string;
  parseStatus: PayloadParseStatus;
  primary: Record<string, unknown>;
}): string {
  const exit = typeof primary.exit_code === "number" ? `, exit=${primary.exit_code}` : "";
  return `${action} ${target} [${status}${exit}, ${parseStatus}]`;
}

function detailLinesFor(
  result: QuailbotToolResult,
  primary: Record<string, unknown>,
  parseStatus: PayloadParseStatus,
  mode: ProjectionMode,
): string[] {
  const payload = recordOrUndefined(primary.payload);
  const lines: string[] = [];

  if (payload) {
    lines.push(...payloadLines(result.action, payload, primary));
  } else {
    const stdout = stringValue(primary.stdout);
    const stderr = stringValue(primary.stderr);
    if (stdout) lines.push(`stdout_preview: ${compactText(stdout, mode === "recent-full" ? 900 : 280)}`);
    if (stderr) lines.push(`stderr_preview: ${compactText(stderr, mode === "recent-full" ? 900 : 280)}`);
    if (parseStatus === "payload_absent_empty_stdout") lines.push("payload: absent; stdout is empty");
  }

  lines.push(...linkedObservationLines(result.linked_observation));
  return lines.length === 0 ? ["result: no additional semantic fields"] : lines;
}

function payloadLines(action: string, payload: Record<string, unknown>, primary: Record<string, unknown>): string[] {
  if (action === "cli_get") {
    return [`value: ${valueText(payload.value)}`, fieldsLine(payload.fields)].filter((line): line is string => Boolean(line));
  }
  if (action === "cli_set") {
    const result = record(payload.result);
    return [
      `set: ${inputSummary(primary.value, primary.args)}`,
      `driver result: command=${stringValue(result.command) ?? "unknown"} applied=${String(result.applied)} dry_run=${String(result.dry_run)}`,
    ];
  }
  if (action === "cli_ramp") {
    const report = record(payload.report);
    return [
      `ramp: ${valueText(payload.start_value)} -> ${valueText(payload.end_value)} step=${valueText(payload.step_value)} interval=${valueText(payload.interval_s)}`,
      `applied=${String(payload.applied)} attempted_steps=${valueText(report.attempted_steps)} applied_steps=${valueText(report.applied_steps)} final_value=${valueText(report.final_value)}`,
    ];
  }
  if (action === "cli_action") {
    const result = record(payload.result);
    return [
      `action result: command=${stringValue(result.command) ?? stringValue(payload.action) ?? "unknown"} applied=${String(result.applied)} dry_run=${String(result.dry_run)}`,
    ];
  }
  return [`payload: ${compactText(JSON.stringify(payload), 500)}`];
}

function linkedObservationLines(value: unknown): string[] {
  const linked = recordOrUndefined(value);
  if (!linked) return [];
  const lines: string[] = [];
  const channels = record(linked.channels);
  const cli = record(channels.cli);
  const results = record(cli.results);
  const resultKeys = Object.keys(results);
  if (resultKeys.length > 0) {
    lines.push("readback:");
    for (const ref of resultKeys) {
      const item = record(results[ref]);
      const payload = recordOrUndefined(item.payload);
      if (payload) {
        lines.push(`  ${ref} = ${valueText(payload.value)} [parsed_payload]`);
      } else {
        const status = parseStatusFor(item);
        lines.push(`  ${ref} [${status}]`);
      }
    }
  }
  const unresolved = arrayOfStrings(linked.unresolved);
  if (unresolved.length > 0) {
    lines.push("unresolved:");
    for (const ref of unresolved) lines.push(`  ${ref}`);
  }
  const roi = record(channels.roi);
  const unavailable = arrayOfStrings(roi.unavailable);
  if (unavailable.length > 0) lines.push(`roi_unavailable: ${unavailable.join(", ")}`);
  return lines;
}

function parseStatusFor(run: Record<string, unknown>): PayloadParseStatus {
  if (run.error_type === "timeout") return "timeout";
  if (run.error_type === "spawn_error") return "spawn_error";
  if (run.payload !== undefined) return "parsed_payload";
  const stdout = stringValue(run.stdout) ?? "";
  if (stdout.trim().length === 0) return "payload_absent_empty_stdout";
  if (/Infinity|-Infinity|NaN/.test(stdout)) return "payload_parse_failed_nonstandard_json";
  if (!stdout.trimStart().startsWith("{") && !stdout.trimStart().startsWith("[")) return "payload_parse_failed_non_json_prefix";
  return "payload_parse_failed_unclassified";
}

function maxCharsFor(options: ProjectionOptions): number {
  return options.mode === "recent-full" ? (options.fullMaxChars ?? DEFAULT_FULL_MAX_CHARS) : (options.summaryMaxChars ?? DEFAULT_SUMMARY_MAX_CHARS);
}

function boundLines(lines: string[], maxChars: number): { lines: string[]; truncated: boolean } {
  const text = lines.join("\n");
  if (text.length <= maxChars) return { lines, truncated: false };
  const boundedText = `${text.slice(0, Math.max(0, maxChars - 18)).trimEnd()} ...`;
  return { lines: boundedText.split("\n"), truncated: true };
}

function boundText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 18)).trimEnd()} ... [truncated]`;
}

function compactText(value: string, maxChars: number): string {
  const oneLine = value.replace(/\s+/g, " ").trim();
  return oneLine.length <= maxChars ? oneLine : `${oneLine.slice(0, maxChars - 4).trimEnd()} ...`;
}

function inputSummary(value: unknown, args: unknown): string {
  const argRecord = record(args);
  const pairs = Object.entries(argRecord).map(([key, val]) => `${key}=${valueText(val)}`);
  if (pairs.length > 0) return pairs.join(", ");
  return value !== undefined ? valueText(value) : "no value/args recorded";
}

function fieldsLine(value: unknown): string | undefined {
  const fields = record(value);
  const entries = Object.entries(fields).map(([key, val]) => `${key}=${valueText(val)}`);
  return entries.length > 0 ? `fields: ${entries.join(", ")}` : undefined;
}

function valueText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || value === null) return String(value);
  const json = JSON.stringify(value);
  return compactText(json ?? String(value), 220);
}

function firstArg(value: unknown): string | undefined {
  return Array.isArray(value) && typeof value[0] === "string" ? value[0] : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function recordOrUndefined(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
```

- [ ] **Step 4: Run projection tests and typecheck**

Run:

```powershell
npm test -- tests/tools/tool-result-projection.test.ts && npm run typecheck
```

Expected: PASS for the new projection test file and PASS for TypeScript.

- [ ] **Step 5: Commit Task 1**

Run:

```powershell
git add src/tools/tool-result-projection.ts tests/tools/tool-result-projection.test.ts
git commit -m "feat: add quailbot tool result projection"
```

---

## Task 2: Linked observation and plan-and-execute projection coverage

**Files:**
- Modify: `tests/tools/tool-result-projection.test.ts`
- Modify: `src/tools/tool-result-projection.ts`

- [ ] **Step 1: Add failing tests for linked readback and plan summaries**

Append these tests inside `describe("tool result projection", ...)` in `tests/tools/tool-result-projection.test.ts`:

```ts
it("summarizes mutating linked-observable readback and unresolved refs", () => {
  const text = buildQuailbotToolContent(cliSetWithLinkedReadback());

  expect(text).toContain("cli_set nqctl:bias_v [ok, parsed_payload]");
  expect(text).toContain("set: Bias_value_V=0.18");
  expect(text).toContain("driver result: command=Bias_Set applied=true dry_run=false");
  expect(text).toContain("readback:");
  expect(text).toContain("nqctl:bias_v = 0.180000007 [parsed_payload]");
  expect(text).toContain("unresolved:");
  expect(text).toContain("nqctl:current_a");
  expect(text).not.toContain("LINKED_STDOUT_SHOULD_NOT_APPEAR");
});

it("summarizes ramp reports without dumping plan arrays", () => {
  const text = buildQuailbotToolContent(cliRampVerboseResult());

  expect(text).toContain("cli_ramp nqctl:bias_v [ok, parsed_payload]");
  expect(text).toContain("ramp: 0.18 -> 0.19 step=0.01 interval=0");
  expect(text).toContain("attempted_steps=2 applied_steps=2 final_value=0.19");
  expect(text).not.toContain("VERBOSE_PLAN_SENTINEL");
  expect(text).not.toContain("VERBOSE_REPORT_SENTINEL");
});

it("summarizes plan-and-execute as ordered steps without raw nested stdout", () => {
  const text = buildQuailbotToolContent(planAndExecuteResult());

  expect(text).toContain("quailbot_plan_and_execute plan [ok, aggregate_result]");
  expect(text).toContain("stopped_reason: completed");
  expect(text).toContain("#0 cli_set [ok] readback nqctl:bias_v=0.18");
  expect(text).toContain("#1 cli_get [ok] value=0.18");
  expect(text).not.toContain("NESTED_STDOUT_SHOULD_NOT_APPEAR");
});
```

Add these helpers below the existing helper functions:

```ts
function cliSetWithLinkedReadback(): QuailbotToolResult {
  return {
    ok: true,
    action: "cli_set",
    action_input: { cli_name: "nqctl", parameter: "bias_v", args: { Bias_value_V: 0.18 }, linked_observables: ["nqctl:current_a"] },
    primary_result: {
      parameter: "bias_v",
      args: { Bias_value_V: 0.18 },
      ok: true,
      exit_code: 0,
      stdout: "PRIMARY_STDOUT_SHOULD_NOT_APPEAR",
      stderr: "",
      payload: {
        parameter: "bias_v",
        plan_only: false,
        result: { name: "bias_v", command: "Bias_Set", args: { Bias_value_V: 0.18 }, autofilled: {}, dry_run: false, applied: true, response: { command: "Bias_Set" } },
        timestamp_utc: "2026-06-15T17:45:17.046417Z",
      },
      argv: ["nqctl", "set", "bias_v", "--arg", "Bias_value_V=0.18"],
    },
    linked_observation: {
      channels: {
        cli: {
          observables: ["nqctl:bias_v"],
          results: {
            "nqctl:bias_v": {
              ok: true,
              exit_code: 0,
              stdout: "LINKED_STDOUT_SHOULD_NOT_APPEAR",
              stderr: "",
              payload: { parameter: "bias_v", value: 0.180000007, fields: { "Bias value": 0.180000007 }, timestamp_utc: "2026-06-15T17:45:20.443752Z" },
              argv: ["nqctl", "get", "bias_v"],
            },
          },
        },
        roi: { rois: [], results: {}, unavailable: [] },
      },
      unresolved: ["nqctl:current_a"],
    },
  };
}

function cliRampVerboseResult(): QuailbotToolResult {
  return {
    ok: true,
    action: "cli_ramp",
    action_input: { cli_name: "nqctl", parameter: "bias_v", start: 0.18, end: 0.19, step: 0.01, interval_s: 0 },
    primary_result: {
      parameter: "bias_v",
      start: 0.18,
      end: 0.19,
      step: 0.01,
      interval_s: 0,
      ok: true,
      exit_code: 0,
      stdout: "RAMP_STDOUT_SHOULD_NOT_APPEAR",
      stderr: "",
      payload: {
        parameter: "bias_v",
        start_value: 0.18,
        end_value: 0.19,
        step_value: 0.01,
        interval_s: 0,
        plan: { targets: ["VERBOSE_PLAN_SENTINEL"] },
        applied: true,
        report: { attempted_steps: 2, applied_steps: 2, final_value: 0.19, reports: ["VERBOSE_REPORT_SENTINEL"] },
        timestamp_utc: "2026-06-15T17:45:23.901502Z",
      },
      argv: ["nqctl", "ramp", "bias_v", "0.18", "0.19", "0.01", "--interval-s", "0"],
    },
  };
}

function planAndExecuteResult(): QuailbotToolResult {
  return {
    ok: true,
    action: "quailbot_plan_and_execute",
    action_input: { steps: [{ kind: "cli_set" }, { kind: "cli_get" }] },
    primary_result: {
      ok: true,
      stopped_reason: "completed",
      steps: [
        {
          index: 0,
          kind: "cli_set",
          args: { kind: "cli_set", parameter: "bias_v" },
          primary_result: { ok: true, stdout: "NESTED_STDOUT_SHOULD_NOT_APPEAR", payload: { parameter: "bias_v", result: { applied: true } } },
          linked_observation: { channels: { cli: { results: { "nqctl:bias_v": { ok: true, payload: { value: 0.18 } } } }, roi: { unavailable: [] } }, unresolved: [] },
        },
        {
          index: 1,
          kind: "cli_get",
          args: { kind: "cli_get", parameter: "bias_v" },
          primary_result: { ok: true, payload: { parameter: "bias_v", value: 0.18 } },
        },
      ],
    },
  };
}
```

- [ ] **Step 2: Run tests to verify the new cases fail**

Run:

```powershell
npm test -- tests/tools/tool-result-projection.test.ts
```

Expected: FAIL because `quailbot_plan_and_execute` is not summarized as ordered steps yet and ramp/linked readback output still needs exact filtering.

- [ ] **Step 3: Extend `tool-result-projection.ts` for plan and linked summaries**

Modify `payloadLines()` and `detailLinesFor()` in `src/tools/tool-result-projection.ts` with these exact changes:

```ts
function detailLinesFor(
  result: QuailbotToolResult,
  primary: Record<string, unknown>,
  parseStatus: PayloadParseStatus,
  mode: ProjectionMode,
): string[] {
  if (result.action === "quailbot_plan_and_execute") {
    return planAndExecuteLines(primary);
  }

  const payload = recordOrUndefined(primary.payload);
  const lines: string[] = [];
  if (payload) {
    lines.push(...payloadLines(result.action, payload, primary));
  } else {
    const stdout = stringValue(primary.stdout);
    const stderr = stringValue(primary.stderr);
    if (stdout) lines.push(`stdout_preview: ${compactText(stdout, mode === "recent-full" ? 900 : 280)}`);
    if (stderr) lines.push(`stderr_preview: ${compactText(stderr, mode === "recent-full" ? 900 : 280)}`);
    if (parseStatus === "payload_absent_empty_stdout") lines.push("payload: absent; stdout is empty");
  }
  lines.push(...linkedObservationLines(result.linked_observation));
  return lines.length === 0 ? ["result: no additional semantic fields"] : lines;
}

function planAndExecuteLines(primary: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const stoppedReason = stringValue(primary.stopped_reason) ?? "unknown";
  lines.push(`stopped_reason: ${stoppedReason}`);
  const steps = Array.isArray(primary.steps) ? primary.steps : [];
  for (const item of steps.slice(0, 30)) {
    const step = record(item);
    const index = typeof step.index === "number" ? step.index : lines.length;
    const kind = stringValue(step.kind) ?? "unknown";
    const stepPrimary = record(step.primary_result);
    const stepOk = stepPrimary.ok === false ? "fail" : "ok";
    const stepPayload = recordOrUndefined(stepPrimary.payload);
    const readback = firstReadbackValue(step.linked_observation);
    const value = stepPayload ? payloadValueSummary(stepPayload) : undefined;
    const suffix = readback ? ` readback ${readback}` : value ? ` ${value}` : "";
    lines.push(`#${index} ${kind} [${stepOk}]${suffix}`);
  }
  if (steps.length > 30) lines.push(`... ${steps.length - 30} more steps summarized in details`);
  return lines;
}

function firstReadbackValue(value: unknown): string | undefined {
  const linked = record(value);
  const results = record(record(record(linked.channels).cli).results);
  for (const [ref, item] of Object.entries(results)) {
    const payload = recordOrUndefined(record(item).payload);
    if (payload) return `${ref}=${valueText(payload.value)}`;
  }
  return undefined;
}

function payloadValueSummary(payload: Record<string, unknown>): string | undefined {
  if ("value" in payload) return `value=${valueText(payload.value)}`;
  if ("error" in payload) return `error=${valueText(record(payload.error).type)}`;
  return undefined;
}
```

Modify `targetFor()` so plan-and-execute headlines use `plan` as the target:

```ts
function targetFor(result: QuailbotToolResult): string {
  if (result.action === "quailbot_plan_and_execute") return "plan";
  const input = record(result.action_input);
  const primary = record(result.primary_result);
  const cliName = typeof input.cli_name === "string" ? input.cli_name : firstArg(primary.argv);
  if (result.action === "cli_action") {
    const actionName = stringValue(input.action_name) ?? stringValue(primary.action_name) ?? "unknown_action";
    return `${cliName ?? "cli"}:${actionName}`;
  }
  const parameter = stringValue(input.parameter) ?? stringValue(primary.parameter) ?? "unknown_parameter";
  return `${cliName ?? "cli"}:${parameter}`;
}
```

- [ ] **Step 4: Run tests and typecheck**

Run:

```powershell
npm test -- tests/tools/tool-result-projection.test.ts && npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Run:

```powershell
git add src/tools/tool-result-projection.ts tests/tools/tool-result-projection.test.ts
git commit -m "test: cover quailbot result projection semantics"
```

---

## Task 3: Wire projected content and TUI renderers into tool registration

**Files:**
- Create: `tests/tools/tool-result-renderer.test.ts`
- Create: `src/tools/tool-result-renderer.ts`
- Modify: `src/tools/register-tools.ts`
- Modify: `tests/tools/quailbot-plan-and-execute.test.ts`

- [ ] **Step 1: Add failing renderer and registration tests**

Create `tests/tools/tool-result-renderer.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { makeQuailbotRenderCall, renderQuailbotToolResult } from "../../src/tools/tool-result-renderer.js";

describe("tool result renderer", () => {
  it("renders compact tool calls", () => {
    const component = makeQuailbotRenderCall("cli_set")({ parameter: "bias_v", cli_name: "nqctl", args: { Bias_value_V: 0.18 } }, {}, {});
    const text = component.render(120).join("\n");

    expect(text).toContain("cli_set");
    expect(text).toContain("nqctl:bias_v");
    expect(text).toContain("Bias_value_V=0.18");
  });

  it("renders compact and expanded results from details", () => {
    const result = {
      content: [{ type: "text" as const, text: "model-facing summary" }],
      details: {
        ok: true,
        action: "cli_get",
        action_input: { cli_name: "nqctl", parameter: "bias_v" },
        primary_result: { parameter: "bias_v", ok: true, exit_code: 0, stdout: "hidden", stderr: "", payload: { parameter: "bias_v", value: 0.17, fields: { "Bias value": 0.17 } }, argv: ["nqctl", "get", "bias_v"] },
      },
    };

    const compact = renderQuailbotToolResult(result, { expanded: false, isPartial: false }, {}, {}).render(120).join("\n");
    const expanded = renderQuailbotToolResult(result, { expanded: true, isPartial: false }, {}, {}).render(120).join("\n");

    expect(compact).toContain("cli_get nqctl:bias_v [ok, parsed_payload]");
    expect(compact).not.toContain("fields: Bias value=0.17");
    expect(expanded).toContain("fields: Bias value=0.17");
    expect(expanded).not.toContain("hidden");
  });
});
```

In `tests/tools/quailbot-plan-and-execute.test.ts`, replace the final JSON-content assertion with projected-content assertions:

```ts
const text = (result as { content: Array<{ text: string }> }).content[0].text;
expect(text).toContain("quailbot_plan_and_execute plan [ok, aggregate_result]");
expect(text).toContain("stopped_reason: completed");
expect(text).not.toContain('"action_input"');
expect((result as { details: { action: string } }).details.action).toBe("quailbot_plan_and_execute");
```

Add this assertion before executing the tool in the same test:

```ts
expect(typeof tool?.renderResult).toBe("function");
expect(typeof tool?.renderCall).toBe("function");
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:

```powershell
npm test -- tests/tools/tool-result-renderer.test.ts tests/tools/quailbot-plan-and-execute.test.ts
```

Expected: FAIL because `tool-result-renderer.ts` does not exist and registered tools do not expose renderers or projected content.

- [ ] **Step 3: Implement TUI renderer helpers**

Create `src/tools/tool-result-renderer.ts`:

```ts
import { Text } from "@earendil-works/pi-tui";

import { buildQuailbotToolContent, projectQuailbotToolResult } from "./tool-result-projection.js";
import type { QuailbotToolResult } from "./tool-result.js";

export function makeQuailbotRenderCall(toolName: string) {
  return (args: unknown, _theme: unknown, _context: unknown): Text => {
    return new Text(`${toolName} ${inputTargetSummary(args)}`, 0, 0);
  };
}

export function renderQuailbotToolResult(
  result: { details?: unknown; content?: Array<{ type: string; text?: string }> },
  options: { expanded?: boolean; isPartial?: boolean },
  _theme: unknown,
  _context: unknown,
): Text {
  if (options.isPartial) return new Text("Quailbot tool running...", 0, 0);
  const details = asQuailbotToolResult(result.details);
  if (!details) {
    const fallback = result.content?.find((item) => item.type === "text")?.text ?? "Quailbot tool result unavailable";
    return new Text(fallback, 0, 0);
  }
  const projection = projectQuailbotToolResult(details);
  const text = options.expanded ? buildQuailbotToolContent(details) : projection.headline;
  return new Text(text, 0, 0);
}

function inputTargetSummary(args: unknown): string {
  const input = record(args);
  const cliName = typeof input.cli_name === "string" ? input.cli_name : "cli";
  if (typeof input.action_name === "string") return `${cliName}:${input.action_name} ${argPairs(input.args)}`.trim();
  if (typeof input.parameter === "string") return `${cliName}:${input.parameter} ${argPairs(input.args)}${input.value !== undefined ? ` value=${String(input.value)}` : ""}`.trim();
  if (Array.isArray(input.steps)) return `steps=${input.steps.length}`;
  return compactPairs(input);
}

function argPairs(value: unknown): string {
  const args = record(value);
  return Object.entries(args).map(([key, val]) => `${key}=${String(val)}`).join(" ");
}

function compactPairs(value: Record<string, unknown>): string {
  return Object.entries(value).slice(0, 4).map(([key, val]) => `${key}=${String(val)}`).join(" ");
}

function asQuailbotToolResult(value: unknown): QuailbotToolResult | undefined {
  const item = record(value);
  if (typeof item.action !== "string" || typeof item.ok !== "boolean") return undefined;
  return item as QuailbotToolResult;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
```

- [ ] **Step 4: Wire projected content and renderers in `register-tools.ts`**

Modify imports in `src/tools/register-tools.ts`:

```ts
import { buildQuailbotToolContent } from "./tool-result-projection.js";
import { makeQuailbotRenderCall, renderQuailbotToolResult } from "./tool-result-renderer.js";
```

For every `pi.registerTool({ ... })` block, add:

```ts
renderCall: makeQuailbotRenderCall("TOOL_NAME"),
renderResult: renderQuailbotToolResult,
```

Use the actual tool names: `quailbot_planwrite`, `cli_get`, `cli_set`, `cli_ramp`, `cli_action`, `observe`, `click_anchor`, `set_field`, `sleep_seconds`, and `quailbot_plan_and_execute`.

Replace `piToolResult()` with:

```ts
function piToolResult(result: QuailbotToolResult) {
  return {
    content: [{ type: "text" as const, text: buildQuailbotToolContent(result) }],
    details: result,
  };
}
```

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```powershell
npm test -- tests/tools/tool-result-renderer.test.ts tests/tools/quailbot-plan-and-execute.test.ts && npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

Run:

```powershell
git add src/tools/tool-result-renderer.ts src/tools/register-tools.ts tests/tools/tool-result-renderer.test.ts tests/tools/quailbot-plan-and-execute.test.ts
git commit -m "feat: render compact quailbot tool results"
```

---

## Task 4: Context recency policy for latest two direct CLI results

**Files:**
- Create: `tests/tools/tool-result-context.test.ts`
- Create: `src/tools/tool-result-context.ts`
- Modify: `src/extension.ts`
- Modify: `tests/e2e/dev-release-adoption.test.ts`

- [ ] **Step 1: Add failing context recency tests**

Create `tests/tools/tool-result-context.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { projectQuailbotContextMessages } from "../../src/tools/tool-result-context.js";

describe("tool result context projection", () => {
  it("keeps only the newest two direct cli tool results in recent-full mode", () => {
    const messages = [
      toolMessage("call-old", "cli_get", "OLD_RAW_SENTINEL", true),
      toolMessage("call-recent-1", "cli_set", "RECENT_ONE_SENTINEL", false),
      toolMessage("call-recent-2", "cli_ramp", "RECENT_TWO_SENTINEL", false),
    ];

    const projected = projectQuailbotContextMessages(messages, { recentFullCliResultCount: 2, summaryMaxChars: 650, fullMaxChars: 1200 });
    const texts = projected.map((message) => message.content[0].text);

    expect(texts[0]).toContain("cli_get nqctl:bias_v [ok, parsed_payload]");
    expect(texts[0]).not.toContain("OLD_RAW_SENTINEL");
    expect(texts[1]).toContain("RECENT_ONE_SENTINEL");
    expect(texts[2]).toContain("RECENT_TWO_SENTINEL");
  });

  it("does not expand quailbot_plan_and_execute as a direct cli result", () => {
    const messages = [
      planMessage("PLAN_NESTED_RAW_SENTINEL"),
      toolMessage("call-cli", "cli_get", "RECENT_RAW_SENTINEL", false),
    ];

    const projected = projectQuailbotContextMessages(messages, { recentFullCliResultCount: 2, summaryMaxChars: 650, fullMaxChars: 1200 });

    expect(projected[0].content[0].text).toContain("quailbot_plan_and_execute plan");
    expect(projected[0].content[0].text).not.toContain("PLAN_NESTED_RAW_SENTINEL");
    expect(projected[1].content[0].text).toContain("RECENT_RAW_SENTINEL");
  });
});

function toolMessage(toolCallId: string, action: "cli_get" | "cli_set" | "cli_ramp", marker: string, parsed: boolean) {
  return {
    role: "toolResult" as const,
    toolCallId,
    toolName: action,
    content: [{ type: "text" as const, text: `old raw content ${marker}` }],
    isError: false,
    details: {
      ok: true,
      action,
      action_input: { cli_name: "nqctl", parameter: "bias_v" },
      primary_result: {
        parameter: "bias_v",
        ok: true,
        exit_code: 0,
        stdout: marker,
        stderr: "",
        payload: parsed ? { parameter: "bias_v", value: 0.17, fields: { "Bias value": 0.17 } } : undefined,
        argv: ["nqctl", "get", "bias_v"],
      },
    },
    timestamp: Date.now(),
  };
}

function planMessage(marker: string) {
  return {
    role: "toolResult" as const,
    toolCallId: "plan-call",
    toolName: "quailbot_plan_and_execute",
    content: [{ type: "text" as const, text: marker }],
    isError: false,
    details: {
      ok: true,
      action: "quailbot_plan_and_execute",
      action_input: { steps: [{ kind: "cli_get" }] },
      primary_result: { ok: true, stopped_reason: "completed", steps: [{ index: 0, kind: "cli_get", primary_result: { ok: true, stdout: marker, payload: { value: 1 } } }] },
    },
    timestamp: Date.now(),
  };
}
```

- [ ] **Step 2: Run context tests to verify they fail**

Run:

```powershell
npm test -- tests/tools/tool-result-context.test.ts
```

Expected: FAIL because `tool-result-context.ts` does not exist.

- [ ] **Step 3: Implement context projection service**

Create `src/tools/tool-result-context.ts`:

```ts
import {
  buildQuailbotToolContent,
  DEFAULT_FULL_MAX_CHARS,
  DEFAULT_RECENT_FULL_CLI_RESULT_COUNT,
  DEFAULT_SUMMARY_MAX_CHARS,
  isDirectCliAction,
} from "./tool-result-projection.js";
import type { QuailbotToolResult } from "./tool-result.js";

export type ToolResultContextPolicy = {
  recentFullCliResultCount?: number;
  summaryMaxChars?: number;
  fullMaxChars?: number;
};

type ToolResultMessageLike = {
  role?: string;
  toolName?: string;
  content?: Array<{ type: string; text?: string }>;
  details?: unknown;
  [key: string]: unknown;
};

export function projectQuailbotContextMessages<T extends ToolResultMessageLike>(
  messages: T[],
  policy: ToolResultContextPolicy = {},
): T[] {
  const recentFullCount = policy.recentFullCliResultCount ?? DEFAULT_RECENT_FULL_CLI_RESULT_COUNT;
  let remainingRecentFull = recentFullCount;

  return [...messages].reverse().map((message) => {
    const result = asQuailbotToolResult(message.details);
    if (!result) return message;
    const directCli = isDirectCliAction(result.action);
    const mode = directCli && remainingRecentFull > 0 ? "recent-full" : "summary";
    if (directCli && remainingRecentFull > 0) remainingRecentFull -= 1;
    return {
      ...message,
      content: [
        {
          type: "text" as const,
          text: buildQuailbotToolContent(result, {
            mode,
            summaryMaxChars: policy.summaryMaxChars ?? DEFAULT_SUMMARY_MAX_CHARS,
            fullMaxChars: policy.fullMaxChars ?? DEFAULT_FULL_MAX_CHARS,
          }),
        },
      ],
    };
  }).reverse() as T[];
}

function asQuailbotToolResult(value: unknown): QuailbotToolResult | undefined {
  const item = record(value);
  if (typeof item.action !== "string" || typeof item.ok !== "boolean" || !("primary_result" in item)) return undefined;
  return item as QuailbotToolResult;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
```

- [ ] **Step 4: Wire the context hook in `extension.ts`**

Modify imports in `src/extension.ts`:

```ts
import { projectQuailbotContextMessages } from "./tools/tool-result-context.js";
```

Add this hook after `session_shutdown` and before `before_agent_start`:

```ts
  pi.on("context", (event) => {
    return { messages: projectQuailbotContextMessages(event.messages) };
  });
```

Update the `PiEventName` union in `tests/e2e/dev-release-adoption.test.ts` so `"context"` is explicit:

```ts
type PiEventName = "session_start" | "before_agent_start" | "session_shutdown" | "context" | string;
```

Update the deterministic handler assertion in the same file:

```ts
expect([...handlers.keys()].sort(compareNames)).toEqual(["before_agent_start", "context", "session_shutdown", "session_start"]);
```

- [ ] **Step 5: Run context/adoption tests and typecheck**

Run:

```powershell
npm test -- tests/tools/tool-result-context.test.ts tests/e2e/dev-release-adoption.test.ts && npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

Run:

```powershell
git add src/tools/tool-result-context.ts src/extension.ts tests/tools/tool-result-context.test.ts tests/e2e/dev-release-adoption.test.ts
git commit -m "feat: bound quailbot CLI result context"
```

---

## Task 5: Real-contract fixtures and registered tool coverage

**Files:**
- Modify: `tests/tools/cli-tools.test.ts`
- Modify: `tests/tools/tool-result-projection.test.ts`
- Modify: `tests/e2e/dev-release-adoption.test.ts`

- [ ] **Step 1: Add failing registered-tool renderer coverage**

In `tests/tools/cli-tools.test.ts`, add this test inside `describe("registered CLI tool schemas", ...)`:

```ts
it("registers compact renderers for CLI tools", () => {
  const tools: Array<{ name: string; renderCall?: unknown; renderResult?: unknown; parameters: { properties?: Record<string, unknown> } }> = [];
  const pi = { registerTool: (tool: { name: string; renderCall?: unknown; renderResult?: unknown; parameters: { properties?: Record<string, unknown> } }) => tools.push(tool) };

  registerQuailbotTools(pi as never, { workspace: fixtureWorkspace() } as never);

  for (const name of ["cli_get", "cli_set", "cli_ramp", "cli_action"]) {
    const tool = tools.find((item) => item.name === name);
    expect(tool?.renderCall).toEqual(expect.any(Function));
    expect(tool?.renderResult).toEqual(expect.any(Function));
  }
});
```

In `tests/e2e/dev-release-adoption.test.ts`, update `RegisteredTool` at the top:

```ts
type RegisteredTool = { name: string; renderCall?: unknown; renderResult?: unknown };
```

Add this assertion inside `registers deterministic handlers, commands, and product-agnostic tools from the built extension` after the tool-name check:

```ts
for (const tool of tools) {
  expect(tool.renderResult).toEqual(expect.any(Function));
}
```

- [ ] **Step 2: Add real `nqctl` parse-failure fixture tests**

Append this test to `tests/tools/tool-result-projection.test.ts`:

```ts
it("classifies actual nqctl stdout quirks observed on simulator runs", () => {
  const actionFailure = buildQuailbotToolContent(cliActionUnparsedFailure("Start action timeout"));
  const scanSpeed = buildQuailbotToolContent(cliGetScanSpeedUnparsed(`{
    "parameter": "scan_speed",
    "value": { "Backward time per line": Infinity },
    "fields": { "Backward time per line": Infinity },
    "timestamp_utc": "2026-06-15T17:46:03.394799Z"
  }`));

  expect(actionFailure).toContain("payload_parse_failed_non_json_prefix");
  expect(actionFailure).toContain("Start action timeout");
  expect(scanSpeed).toContain("payload_parse_failed_nonstandard_json");
  expect(scanSpeed).toContain("Infinity");
});
```

- [ ] **Step 3: Run focused tests to verify failures or gaps**

Run:

```powershell
npm test -- tests/tools/cli-tools.test.ts tests/tools/tool-result-projection.test.ts tests/e2e/dev-release-adoption.test.ts
```

Expected before Task 3/4 are complete: FAIL. Expected after Task 3/4 are complete: PASS or show a small type mismatch to fix in registration test stubs.

- [ ] **Step 4: Fix registration test stubs if needed**

If TypeScript complains that the local `pi` stub type is too narrow, update the stub object in each test to accept these extra properties:

```ts
const pi = {
  registerTool: (tool: {
    name: string;
    renderCall?: unknown;
    renderResult?: unknown;
    parameters: { properties?: Record<string, unknown> };
  }) => tools.push(tool),
};
```

- [ ] **Step 5: Run the broader focused tool suite**

Run:

```powershell
npm test -- tests/tools/tool-result-projection.test.ts tests/tools/tool-result-context.test.ts tests/tools/tool-result-renderer.test.ts tests/tools/cli-tools.test.ts tests/tools/quailbot-plan-and-execute.test.ts tests/e2e/dev-release-adoption.test.ts && npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

Run:

```powershell
git add tests/tools/cli-tools.test.ts tests/tools/tool-result-projection.test.ts tests/e2e/dev-release-adoption.test.ts
git commit -m "test: pin grounded quailbot result projection"
```

---

## Task 6: Real Pi/Nanonis acceptance and roadmap closeout

**Files:**
- Modify: `ROADMAP.md`
- Create local artifacts under `.opencode/artifacts/a5-tool-result-rendering/<timestamp>/`

- [ ] **Step 1: Run the full verification gate**

Run:

```powershell
npm run typecheck && npm test -- tests/tools/tool-result-projection.test.ts tests/tools/tool-result-context.test.ts tests/tools/tool-result-renderer.test.ts tests/tools/cli-tools.test.ts tests/tools/quailbot-plan-and-execute.test.ts tests/e2e/dev-release-adoption.test.ts && npm run dev:check && git diff --check
```

Expected: PASS, including `dev:check`.

- [ ] **Step 2: Create the acceptance artifact directory**

Before creating files, verify the parent exists:

```powershell
Test-Path -LiteralPath ".opencode\artifacts"
```

Expected: `True`.

Create a timestamped directory:

```powershell
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"; New-Item -ItemType Directory -Path ".opencode\artifacts\a5-tool-result-rendering\$stamp"
```

Expected: new directory path printed.

- [ ] **Step 3: Capture real `nqctl` substrate samples**

Run these read/action commands and save outputs into the timestamped artifact directory. Keep mutation small and simulator-scoped; do not restart or kill simulator processes.

```powershell
nqctl get bias_v --json > ".opencode\artifacts\a5-tool-result-rendering\$stamp\nqctl-get-bias-v.json"
nqctl set bias_v --arg Bias_value_V=0.18 --json > ".opencode\artifacts\a5-tool-result-rendering\$stamp\nqctl-set-bias-v.json"
nqctl ramp bias_v 0.18 0.19 0.01 --interval-s 0 --json > ".opencode\artifacts\a5-tool-result-rendering\$stamp\nqctl-ramp-bias-v.json"
nqctl get scan_speed --json > ".opencode\artifacts\a5-tool-result-rendering\$stamp\nqctl-get-scan-speed-raw.txt"
nqctl act Scan_Action --arg Scan_action=0 --arg Scan_direction=1 --json > ".opencode\artifacts\a5-tool-result-rendering\$stamp\nqctl-scan-action-raw.txt"
```

Expected: files exist. Some action/scan-speed outputs may contain unparsed stdout; that is expected and is the contract-grounding evidence for A5.

- [ ] **Step 4: Capture quailbot-pi projection evidence with built extension code**

Run:

```powershell
node --input-type=module -e "import { loadWorkspace } from './dist/src/workspace/load-workspace.js'; import { createToolContext } from './dist/src/tools/tool-context.js'; import { executeCliGet } from './dist/src/tools/cli_get.js'; import { executeCliSet } from './dist/src/tools/cli_set.js'; import { executeCliRamp } from './dist/src/tools/cli_ramp.js'; import { buildQuailbotToolContent } from './dist/src/tools/tool-result-projection.js'; const workspace=loadWorkspace('D:/quailbot/workspaces/workspace.json'); const ctx=createToolContext({workspace, mutationPolicy:{mutatingToolsEnabled:true, enableEnvVar:'QUAILBOT_ALLOW_MUTATING_TOOLS'}}); const runs=[]; runs.push(['cli_get', await executeCliGet(ctx,{cli_name:'nqctl', parameter:'bias_v'})]); runs.push(['cli_set', await executeCliSet(ctx,{cli_name:'nqctl', parameter:'bias_v', args:{Bias_value_V:0.18}})]); runs.push(['cli_ramp', await executeCliRamp(ctx,{cli_name:'nqctl', parameter:'bias_v', start:0.18, end:0.19, step:0.01, interval_s:0})]); console.log(JSON.stringify(runs.map(([name,result])=>({name, content:buildQuailbotToolContent(result), detailsAction:result.action, detailsOk:result.ok})), null, 2));" > ".opencode\artifacts\a5-tool-result-rendering\$stamp\quailbot-pi-projection-evidence.json"
```

Expected: JSON evidence file shows bounded `content` and full-result identity in `detailsAction/detailsOk`.

- [ ] **Step 5: Perform real TUI acceptance when requested by the controller**

If the orchestrator requests live TUI proof, use Windows MCP snapshot/vision against the real opened terminal, not shell simulation. The evidence must show compact Quailbot tool result rows and expanded detail behavior. Preserve screenshots/transcripts under the same `.opencode/artifacts/a5-tool-result-rendering/<timestamp>/` directory.

- [ ] **Step 6: Update ROADMAP closeout**

Append a new implementation-round entry to `ROADMAP.md`:

```md
## Implementation round: A5 contract-grounded tool-result projection

Date: 2026-06-15

### Delivered

- Added a Quailbot-owned projection layer for `QuailbotToolResult` that replaces raw pretty-JSON model content with bounded semantic summaries while preserving full structured `details`.
- Added compact/expanded TUI renderers for Quailbot tools using the same projection model.
- Added a context recency policy with `recentFullCliResultCount = 2` for direct `cli_*` results.
- Preserved real Nanonis/qnctl acceptance artifacts under `.opencode/artifacts/a5-tool-result-rendering/...`.

### Now known

- A5 must surface payload parse status because real `nqctl` can produce non-strict JSON stdout in both error and success cases.
- Parsed payloads are the semantic source when available; raw stdout is transport/debug evidence and should not be duplicated into model context.
- Linked-observable readback is the most important post-mutation signal and must remain visible even when primary action payload parsing fails.

### Later phases must do differently

- Parser hardening for prefixed JSON or non-standard tokens should be considered separately from A5 projection so driver contract violations stay visible.
- A7 experiment logs should reuse the full raw result preserved in `details` rather than inventing a second action/readback schema.
- A6 context accounting should measure summary-vs-full projection savings for Quailbot tool results.
```

- [ ] **Step 7: Run final verification**

Run:

```powershell
npm run typecheck && npm test -- tests/tools/tool-result-projection.test.ts tests/tools/tool-result-context.test.ts tests/tools/tool-result-renderer.test.ts tests/tools/cli-tools.test.ts tests/tools/quailbot-plan-and-execute.test.ts tests/e2e/dev-release-adoption.test.ts && npm run dev:check && git diff --check
```

Expected: PASS.

- [ ] **Step 8: Commit Task 6**

Run:

```powershell
git add ROADMAP.md
git commit -m "docs: close A5 tool result projection"
```

Do not add `.opencode/artifacts/...` to git.

---

## Final review checklist

- `content[0].text` is bounded and no longer full pretty JSON.
- `details` remains the full original `QuailbotToolResult`.
- Payload parse failures are surfaced; no silent JSON repair was added.
- Latest-two direct `cli_*` context policy is active through the Pi context hook.
- `quailbot_plan_and_execute` remains summary-first and cannot bypass the direct CLI recency cap.
- Linked-observable readback is visible in summaries.
- Real `nqctl` samples are preserved as local acceptance artifacts.
- `npm run typecheck`, focused Vitest suite, `npm run dev:check`, and `git diff --check` pass.
