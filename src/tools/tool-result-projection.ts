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

  if (parseStatus === "parsed_payload") {
    return [...errorLines, ...payloadSummaryLines(primary.payload)];
  }

  if (mode === "recent-full") {
    return recentFullLines(primary, errorLines);
  }

  if (result.action === "quailbot_plan_and_execute") {
    return [...errorLines, "aggregate result projection pending full plan support"];
  }

  return [...errorLines, ...previewLines(primary)];
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

function payloadSummaryLines(payload: unknown): string[] {
  if (!isRecord(payload)) {
    return [`payload: ${formatValue(payload)}`];
  }

  const entries = Object.entries(payload);
  if (entries.length === 0) {
    return ["payload: {}"];
  }

  return entries.map(([key, value]) => `${key}: ${formatValue(value)}`);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
}
