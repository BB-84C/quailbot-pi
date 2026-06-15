import { Text } from "@earendil-works/pi-tui";
import type { AgentToolResult, ToolRenderResultOptions } from "@earendil-works/pi-coding-agent";

import type { QuailbotToolResult } from "./tool-result.js";
import { buildQuailbotToolContent, projectQuailbotToolResult } from "./tool-result-projection.js";

export function makeQuailbotRenderCall(toolName: string) {
  return (args: unknown, _theme: unknown, _context: unknown): Text => new Text(formatToolCall(toolName, args));
}

export function renderQuailbotToolResult(
  result: AgentToolResult<unknown>,
  options: ToolRenderResultOptions,
  _theme: unknown,
  _context: unknown,
): Text {
  if (options.isPartial) {
    return new Text("Quailbot tool running...");
  }

  if (isQuailbotToolResult(result.details)) {
    const text = options.expanded
      ? buildQuailbotToolContent(result.details)
      : projectQuailbotToolResult(result.details).headline;
    return new Text(text);
  }

  return new Text(firstTextContent(result.content) ?? "Quailbot tool result unavailable");
}

function formatToolCall(toolName: string, args: unknown): string {
  const input = record(args);
  const target = deriveCallTarget(toolName, input);
  const parts = [toolName, target, ...callSummaryParts(toolName, input)].filter((part): part is string =>
    part !== undefined && part.length > 0,
  );

  return parts.join(" ");
}

function deriveCallTarget(toolName: string, input: Record<string, unknown>): string | undefined {
  if (toolName === "quailbot_plan_and_execute") {
    const steps = Array.isArray(input.steps) ? input.steps.length : 0;
    return `plan steps=${steps}`;
  }

  const cliName = stringValue(input.cli_name);
  if (toolName === "cli_get" || toolName === "cli_set" || toolName === "cli_ramp") {
    return cliTarget(cliName, stringValue(input.parameter));
  }
  if (toolName === "cli_action") {
    return cliTarget(cliName, stringValue(input.action_name));
  }
  if (toolName === "click_anchor" || toolName === "set_field") {
    return stringValue(input.anchor);
  }
  if (toolName === "observe") {
    const rois = stringArray(input.rois);
    return rois.length > 0 ? `rois=${rois.join(",")}` : undefined;
  }

  return undefined;
}

function callSummaryParts(toolName: string, input: Record<string, unknown>): string[] {
  if (isRecord(input.args)) {
    return [formatAssignments(input.args)];
  }

  if (toolName === "cli_set" && input.value !== undefined) {
    return [`value=${formatValue(input.value)}`];
  }
  if (toolName === "cli_ramp") {
    return [
      `start=${formatValue(input.start)}`,
      `end=${formatValue(input.end)}`,
      `step=${formatValue(input.step)}`,
      `interval_s=${formatValue(input.interval_s)}`,
    ];
  }
  if (toolName === "sleep_seconds" && input.seconds !== undefined) {
    return [`seconds=${formatValue(input.seconds)}`];
  }
  if (toolName === "quailbot_planwrite") {
    return firstEntries(input, ["mode", "clean"]);
  }

  return firstEntries(input, ["parameter", "action_name", "typed_text", "submit", "seconds"]);
}

function firstEntries(input: Record<string, unknown>, keys: string[]): string[] {
  const entries = keys
    .filter((key) => input[key] !== undefined)
    .slice(0, 3)
    .map((key) => `${key}=${formatValue(input[key])}`);

  if (entries.length > 0) {
    return entries;
  }

  return Object.entries(input)
    .filter(([, value]) => value !== undefined)
    .slice(0, 3)
    .map(([key, value]) => `${key}=${formatValue(value)}`);
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

function firstTextContent(content: AgentToolResult<unknown>["content"]): string | undefined {
  for (const item of content) {
    if (isRecord(item) && item.type === "text" && typeof item.text === "string") {
      return item.text;
    }
  }

  return undefined;
}

function isQuailbotToolResult(value: unknown): value is QuailbotToolResult {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.ok === "boolean" && typeof value.action === "string" && "primary_result" in value;
}

function formatAssignments(value: Record<string, unknown>): string {
  return Object.entries(value)
    .map(([key, entry]) => `${key}=${formatValue(entry)}`)
    .join(" ");
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

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
}
