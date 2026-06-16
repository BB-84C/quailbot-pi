import type { QuailbotToolResult } from "./tool-result.js";

export const DEFAULT_RECENT_FULL_CLI_RESULT_COUNT = 2;
export const DEFAULT_SUMMARY_MAX_CHARS = 2000;
export const DEFAULT_FULL_MAX_CHARS = 12000;

export type ProjectionMode = "summary" | "recent-full";
export type ProjectionStatus = "ok" | "fail";
export type PayloadParseStatus =
  | "parsed_payload"
  | "payload_absent_empty_stdout"
  | "payload_parse_failed_non_json_prefix"
  | "payload_parse_failed_nonstandard_json"
  | "payload_parse_failed_unclassified"
  | "aggregate_result"
  | "structured_result"
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
  target: string | undefined;
  parseStatus: PayloadParseStatus;
  headline: string;
  lines: string[];
  truncated: boolean;
};

export function projectQuailbotToolResult(
  result: QuailbotToolResult,
  options: ProjectionOptions = {},
): ToolResultProjection {
  const status: ProjectionStatus = result.ok ? "ok" : "fail";
  const action = result.action;
  const primary = record(result.primary_result);
  const target = deriveTarget(result, primary);
  const parseStatus = payloadParseStatus(result, primary);
  const exitCode = numberValue(primary.exit_code);
  const headline = buildHeadline(action, target, status, exitCode, parseStatus);
  const rawLines = [headline, ...projectionBodyLines(result, primary, parseStatus, options.mode ?? "summary")];
  const maxChars = maxCharsForMode(options.mode ?? "summary", options);
  const truncated = truncateContent(rawLines.join("\n"), maxChars);

  return {
    status,
    action,
    target,
    parseStatus,
    headline,
    lines: truncated.text.split("\n"),
    truncated: truncated.truncated,
  };
}

export function buildQuailbotToolContent(result: QuailbotToolResult, options: ProjectionOptions = {}): string {
  return projectQuailbotToolResult(result, options).lines.join("\n");
}

export function isDirectCliAction(action: string): boolean {
  return action === "cli_get" || action === "cli_set" || action === "cli_ramp" || action === "cli_action";
}

function buildHeadline(
  action: string,
  target: string | undefined,
  status: ProjectionStatus,
  exitCode: number | undefined,
  parseStatus: PayloadParseStatus,
): string {
  const statusParts = status === "fail" && exitCode !== undefined ? [status, `exit=${exitCode}`, parseStatus] : [status, parseStatus];
  const targetPart = target === undefined ? "" : ` ${target}`;
  return `${action}${targetPart} [${statusParts.join(", ")}]`;
}

function projectionBodyLines(
  result: QuailbotToolResult,
  primary: Record<string, unknown>,
  parseStatus: PayloadParseStatus,
  mode: ProjectionMode,
): string[] {
  const errorLines = structuredErrorLines(primary);

  if (result.action === "quailbot_plan_and_execute") {
    return [...errorLines, ...planAndExecuteSummaryLines(primary)];
  }

  if (result.action === "quailbot_planwrite") {
    return [...errorLines, ...planwriteSummaryLines(primary)];
  }

  if (parseStatus === "parsed_payload") {
    return [...errorLines, ...payloadSummaryLines(result.action, primary, primary.payload), ...linkedObservationLines(result.linked_observation)];
  }

  if (mode === "recent-full") {
    return [...recentFullLines(primary, errorLines), ...linkedObservationLines(result.linked_observation)];
  }

  return [...errorLines, ...previewLines(primary), ...linkedObservationLines(result.linked_observation)];
}

function recentFullLines(primary: Record<string, unknown>, errorLines: string[]): string[] {
  const lines = ["full raw result retained in tool details", ...errorLines];
  const stdout = stringValue(primary.stdout) ?? "";
  const stderr = stringValue(primary.stderr) ?? "";

  if (stdout.length > 0) {
    lines.push("stdout:", stdout);
  }
  if (stderr.length > 0) {
    lines.push("stderr:", stderr);
  }
  if (stdout.length === 0 && stderr.length === 0) {
    lines.push("stdout: <empty>");
  }

  return lines;
}

function planwriteSummaryLines(primary: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const mode = stringValue(primary.mode);
  const cleaned = booleanValue(primary.cleaned);
  const persisted = booleanValue(primary.persisted);
  const text = stringValue(primary.text);

  if (mode !== undefined) {
    lines.push(`mode: ${mode}`);
  }
  if (cleaned !== undefined) {
    lines.push(`cleaned: ${formatValue(cleaned)}`);
  }
  if (persisted !== undefined) {
    lines.push(`persisted: ${formatValue(persisted)}`);
  }
  if (text !== undefined) {
    lines.push(`text: ${text.length > 0 ? text : "<empty>"}`);
  }

  return lines;
}

function structuredErrorLines(primary: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const errorType = stringValue(primary.error_type);
  const message = stringValue(primary.message) ?? stringValue(primary.error_message);

  if (errorType !== undefined) {
    lines.push(`error_type: ${errorType}`);
  }
  if (message !== undefined) {
    lines.push(`message: ${message}`);
  }

  return lines;
}

function payloadSummaryLines(action: string, primary: Record<string, unknown>, payload: unknown): string[] {
  if (action === "cli_set") {
    return cliSetSummaryLines(primary, payload);
  }

  if (action === "cli_ramp") {
    return cliRampSummaryLines(primary, payload);
  }

  if (!isRecord(payload)) {
    return [`payload: ${formatValue(payload)}`];
  }

  const entries = Object.entries(payload);
  if (entries.length === 0) {
    return ["payload: {}"];
  }

  return entries.map(([key, value]) => `${key}: ${formatValue(value)}`);
}

function cliSetSummaryLines(primary: Record<string, unknown>, payload: unknown): string[] {
  const payloadRecord = record(payload);
  const result = recordOrUndefined(payloadRecord.result);
  const args = recordOrUndefined(result?.args) ?? recordOrUndefined(payloadRecord.args) ?? recordOrUndefined(primary.args);
  const lines: string[] = [];
  const value = primary.value ?? payloadRecord.value;

  if (args !== undefined && Object.keys(args).length > 0) {
    lines.push(`set: ${formatAssignments(args, " ")}`);
  } else if (value !== undefined) {
    lines.push(`set: value=${formatValue(value)}`);
  }

  const driverParts = [
    fieldPart("command", result?.command ?? payloadRecord.command),
    fieldPart("applied", result?.applied ?? payloadRecord.applied),
    fieldPart("dry_run", result?.dry_run ?? payloadRecord.dry_run),
  ].filter((part): part is string => part !== undefined);

  if (driverParts.length > 0) {
    lines.push(`driver result: ${driverParts.join(" ")}`);
  }

  return lines.length > 0 ? lines : genericPayloadSummaryLines(payload);
}

function cliRampSummaryLines(primary: Record<string, unknown>, payload: unknown): string[] {
  const payloadRecord = record(payload);
  const start = payloadRecord.start_value ?? primary.start;
  const end = payloadRecord.end_value ?? primary.end;
  const step = payloadRecord.step_value ?? primary.step;
  const interval = payloadRecord.interval_s ?? primary.interval_s;
  const lines: string[] = [];

  if (start !== undefined || end !== undefined || step !== undefined || interval !== undefined) {
    lines.push(
      `ramp: ${formatValue(start)} -> ${formatValue(end)} step=${formatValue(step)} interval=${formatValue(interval)}`,
    );
  }

  const report = recordOrUndefined(payloadRecord.report);
  if (report !== undefined) {
    const reportParts = [
      fieldPart("attempted_steps", report.attempted_steps),
      fieldPart("applied_steps", report.applied_steps),
      fieldPart("final_value", report.final_value),
    ].filter((part): part is string => part !== undefined);

    if (reportParts.length > 0) {
      lines.push(`report: ${reportParts.join(" ")}`);
    }
  }

  return lines.length > 0 ? lines : genericPayloadSummaryLines(payload);
}

function genericPayloadSummaryLines(payload: unknown): string[] {
  if (!isRecord(payload)) {
    return [`payload: ${formatValue(payload)}`];
  }

  const entries = Object.entries(payload);
  if (entries.length === 0) {
    return ["payload: {}"];
  }

  return entries.map(([key, value]) => `${key}: ${formatValue(value)}`);
}

function linkedObservationLines(value: unknown): string[] {
  const observation = recordOrUndefined(value);
  if (observation === undefined) {
    return [];
  }

  const readbacks = linkedCliReadbackLines(observation, " = ");
  const roiUnavailable = linkedRoiUnavailable(observation);
  const unresolved = stringArray(observation.unresolved);
  const lines: string[] = [];

  if (readbacks.length > 0 || roiUnavailable.length > 0) {
    lines.push("readback:", ...readbacks);
    if (roiUnavailable.length > 0) {
      lines.push("roi unavailable:", ...roiUnavailable.map((ref) => `- ${ref}`));
    }
  }

  if (unresolved.length > 0) {
    lines.push("unresolved:", ...unresolved.map((ref) => `- ${ref}`));
  }

  return lines;
}

function linkedCliReadbackLines(observation: Record<string, unknown>, separator: string): string[] {
  const cli = recordOrUndefined(recordOrUndefined(observation.channels)?.cli);
  const results = recordOrUndefined(cli?.results);
  if (results === undefined) {
    return [];
  }

  return Object.entries(results).map(([ref, rawResult]) => {
    const result = record(rawResult);
    const parseStatus = primaryPayloadParseStatus(result);
    const payload = result.payload;
    const value = payloadValue(payload);

    if (value !== undefined) {
      return `${ref}${separator}${formatValue(value)} [${parseStatus}]`;
    }

    const diagnosticParts = structuredDiagnosticParts(result);
    const suffix = diagnosticParts.length > 0 ? `, ${diagnosticParts.join(" ")}` : "";
    return `${ref} [${parseStatus}${suffix}]`;
  });
}

function linkedRoiUnavailable(observation: Record<string, unknown>): string[] {
  const roi = recordOrUndefined(recordOrUndefined(observation.channels)?.roi);
  return stringArray(roi?.unavailable);
}

function planAndExecuteSummaryLines(primary: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const stoppedReason = stringValue(primary.stopped_reason);
  const validationError = stringValue(primary.validation_error);
  const steps = Array.isArray(primary.steps) ? primary.steps : [];

  if (stoppedReason !== undefined) {
    lines.push(`stopped_reason: ${stoppedReason}`);
  }
  if (validationError !== undefined) {
    lines.push(`validation_error: ${validationError}`);
  }

  for (const [position, rawStep] of steps.slice(0, 30).entries()) {
    const step = record(rawStep);
    lines.push(planStepSummaryLine(step, position));
  }

  if (steps.length > 30) {
    lines.push(`[truncated ${steps.length - 30} additional steps]`);
  }

  return lines;
}

function planStepSummaryLine(step: Record<string, unknown>, fallbackIndex: number): string {
  const index = numberValue(step.index) ?? fallbackIndex;
  const kind = stringValue(step.kind) ?? "step";
  const primary = record(step.primary_result);
  const status = planStepStatus(primary);
  const summary = planStepResultSummary(kind, primary, step.linked_observation);
  return `#${index} ${kind} [${status}]${summary.length > 0 ? ` ${summary}` : ""}`;
}

function planStepStatus(primary: Record<string, unknown>): ProjectionStatus {
  const ok = booleanValue(primary.ok);
  if (ok === false) {
    return "fail";
  }

  if (ok === undefined && hasStructuredError(primary)) {
    return "fail";
  }

  return "ok";
}

function planStepResultSummary(kind: string, primary: Record<string, unknown>, linkedObservation: unknown): string {
  const readbacks = linkedCliReadbackLines(record(linkedObservation), "=").map(stripReadbackParseStatus);
  if (readbacks.length > 0) {
    const diagnosticParts = structuredDiagnosticParts(primary);
    const diagnosticSuffix = diagnosticParts.length > 0 ? ` ${diagnosticParts.join(" ")}` : "";
    return `readback ${readbacks.join(" ")}${diagnosticSuffix}`;
  }

  const payload = recordOrUndefined(primary.payload);
  const value = payloadValue(payload);
  if (value !== undefined) {
    return `value=${formatValue(value)}`;
  }

  if (kind === "cli_set") {
    const applied = recordOrUndefined(payload?.result)?.applied ?? payload?.applied;
    if (applied !== undefined) {
      return `applied=${formatValue(applied)}`;
    }
  }

  const diagnosticParts = [...structuredDiagnosticParts(primary), ...parseFailureDiagnosticParts(primary)];
  if (diagnosticParts.length > 0) {
    return diagnosticParts.join(" ");
  }

  return "";
}

function structuredDiagnosticParts(primary: Record<string, unknown>): string[] {
  return [
    fieldPart("ok", booleanValue(primary.ok) === false ? false : undefined),
    fieldPart("exit", numberValue(primary.exit_code)),
    fieldPart("error_type", primary.error_type),
    fieldPart("error_message", primary.error_message),
    fieldPart("message", primary.message),
    fieldPart("stderr", primary.stderr),
  ].filter((part): part is string => part !== undefined);
}

function parseFailureDiagnosticParts(primary: Record<string, unknown>): string[] {
  const parseStatus = primaryPayloadParseStatus(primary);
  if (parseStatus === "parsed_payload" || parseStatus === "payload_absent_empty_stdout") {
    return [];
  }

  const parts = [`parse=${parseStatus}`];
  const stdoutDiagnostic = compactStdoutDiagnostic(primary.stdout);
  if (stdoutDiagnostic !== undefined) {
    parts.push(`stdout_diagnostic=${stdoutDiagnostic}`);
  }

  return parts;
}

function compactStdoutDiagnostic(value: unknown): string | undefined {
  const stdout = stringValue(value);
  if (stdout === undefined || stdout.trim().length === 0) {
    return undefined;
  }

  const diagnosticLines: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    if (startsWithJsonContainer(trimmed)) {
      break;
    }
    diagnosticLines.push(trimmed);
    if (diagnosticLines.length === 2) {
      break;
    }
  }

  const diagnostic = diagnosticLines.length > 0 ? diagnosticLines.join(" | ") : stdout.trim().split(/\r?\n/, 1)[0];
  return compactInline(diagnostic, 180);
}

function hasStructuredError(primary: Record<string, unknown>): boolean {
  return (
    stringValue(primary.error_type) !== undefined ||
    stringValue(primary.error_message) !== undefined ||
    stringValue(primary.message) !== undefined
  );
}

function previewLines(primary: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const stdout = stringValue(primary.stdout) ?? "";
  const stderr = stringValue(primary.stderr) ?? "";

  if (stdout.length > 0) {
    lines.push(`stdout_preview: ${stdout}`);
  } else {
    lines.push("stdout_preview: <empty>");
  }

  if (stderr.length > 0) {
    lines.push(`stderr_preview: ${stderr}`);
  }

  return lines;
}

function payloadParseStatus(result: QuailbotToolResult, primary: Record<string, unknown>): PayloadParseStatus {
  if (result.action === "quailbot_plan_and_execute") {
    return "aggregate_result";
  }

  if (result.action === "quailbot_planwrite") {
    return "structured_result";
  }

  return primaryPayloadParseStatus(primary);
}

function primaryPayloadParseStatus(primary: Record<string, unknown>): PayloadParseStatus {
  const errorType = stringValue(primary.error_type);
  if (errorType === "timeout") {
    return "timeout";
  }
  if (errorType === "spawn_error") {
    return "spawn_error";
  }

  if (primary.payload !== undefined) {
    return "parsed_payload";
  }

  const stdout = (stringValue(primary.stdout) ?? "").trim();
  if (stdout.length === 0) {
    return "payload_absent_empty_stdout";
  }

  if (!startsWithJsonContainer(stdout)) {
    return "payload_parse_failed_non_json_prefix";
  }

  if (containsNonstandardJsonNumber(stdout)) {
    return "payload_parse_failed_nonstandard_json";
  }

  return "payload_parse_failed_unclassified";
}

function deriveTarget(result: QuailbotToolResult, primary: Record<string, unknown>): string | undefined {
  const input = record(result.action_input);
  const argv = stringArray(primary.argv);
  const cliName = stringValue(input.cli_name) || argv[0];

  if (result.action === "quailbot_plan_and_execute") {
    return "plan";
  }

  if (result.action === "cli_get" || result.action === "cli_set" || result.action === "cli_ramp") {
    const parameter = stringValue(input.parameter) || stringValue(primary.parameter);
    return cliTarget(cliName, parameter);
  }

  if (result.action === "cli_action") {
    const actionName = stringValue(input.action_name) || stringValue(primary.action_name);
    return cliTarget(cliName, actionName);
  }

  return undefined;
}

function cliTarget(cliName: string | undefined, name: string | undefined): string | undefined {
  if (name === undefined || name.length === 0) {
    return undefined;
  }

  if (cliName === undefined || cliName.length === 0 || name.includes(":")) {
    return name;
  }

  return `${cliName}:${name}`;
}

function startsWithJsonContainer(value: string): boolean {
  return value.startsWith("{") || value.startsWith("[");
}

function containsNonstandardJsonNumber(value: string): boolean {
  return /(?<![A-Za-z0-9_])(?:-?Infinity|NaN)(?![A-Za-z0-9_])/.test(value);
}

function formatValue(value: unknown): string {
  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, entry]) => `${key}=${formatValue(entry)}`)
      .join(", ");
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => formatValue(entry)).join(", ")}]`;
  }

  if (typeof value === "string") {
    return value;
  }

  return String(value);
}

function formatAssignments(value: Record<string, unknown>, separator: string): string {
  return Object.entries(value)
    .map(([key, entry]) => `${key}=${formatValue(entry)}`)
    .join(separator);
}

function fieldPart(name: string, value: unknown): string | undefined {
  if (typeof value === "string" && value.length === 0) {
    return undefined;
  }

  return value === undefined ? undefined : `${name}=${formatValue(value)}`;
}

function compactInline(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxChars - " [truncated]".length))} [truncated]`;
}

function payloadValue(value: unknown): unknown {
  if (!isRecord(value)) {
    return undefined;
  }

  return value.value;
}

function stripReadbackParseStatus(value: string): string {
  const parsedPayloadSuffix = " [parsed_payload]";
  return value.endsWith(parsedPayloadSuffix) ? value.slice(0, -parsedPayloadSuffix.length) : value;
}

function maxCharsForMode(mode: ProjectionMode, options: ProjectionOptions): number {
  return mode === "recent-full"
    ? positiveLimit(options.fullMaxChars, DEFAULT_FULL_MAX_CHARS)
    : positiveLimit(options.summaryMaxChars, DEFAULT_SUMMARY_MAX_CHARS);
}

function positiveLimit(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function truncateContent(value: string, maxChars: number): { text: string; truncated: boolean } {
  if (value.length <= maxChars) {
    return { text: value, truncated: false };
  }

  const suffix = "\n[truncated]";
  const prefixLength = Math.max(0, maxChars - suffix.length);
  return { text: `${value.slice(0, prefixLength)}${suffix}`, truncated: true };
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function recordOrUndefined(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
}
