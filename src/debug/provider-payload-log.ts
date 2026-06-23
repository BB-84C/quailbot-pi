import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { quailbotStateRoot } from "../workspace/workspace-state.js";

/**
 * Provider payload logging is opt-in. Set `QUAILBOT_PROVIDER_PAYLOAD_LOG=1`
 * to enable; any other value (or unset) leaves logging disabled. This
 * avoids leaking provider request/response bodies (which may include
 * conversation context, tool args, and the rendered system prompt) into
 * an on-disk file by default. Errors from append are swallowed so a
 * full or unwritable state directory cannot break a provider call.
 */
const PROVIDER_PAYLOAD_LOG_ENV = "QUAILBOT_PROVIDER_PAYLOAD_LOG";
const PROVIDER_PAYLOAD_LOG_LIMIT = 50;
const PROVIDER_PAYLOAD_LOG_FILE = "provider-payloads.jsonl";

export type ProviderPayloadLogRecord = {
  timestamp_utc: string;
  kind: "provider_request" | "provider_response" | "assistant_message";
  request_id?: string;
  payload?: unknown;
  status?: number;
  headers?: Record<string, string>;
  message?: unknown;
};

let requestSequence = 0;
let activeRequestId: string | undefined;

export function registerProviderPayloadLog(pi: ExtensionAPI): void {
  pi.on("before_provider_request", (event, ctx) => {
    if (!providerPayloadLogEnabled()) {
      return;
    }

    activeRequestId = nextRequestId();
    safeAppend(ctx.cwd, {
      timestamp_utc: new Date().toISOString(),
      kind: "provider_request",
      request_id: activeRequestId,
      payload: jsonSafe(event.payload),
    });
  });

  pi.on("after_provider_response", (event, ctx) => {
    if (!providerPayloadLogEnabled()) {
      return;
    }

    safeAppend(ctx.cwd, {
      timestamp_utc: new Date().toISOString(),
      kind: "provider_response",
      ...(activeRequestId === undefined ? {} : { request_id: activeRequestId }),
      status: event.status,
      headers: jsonSafe(event.headers) as Record<string, string>,
    });
  });

  pi.on("message_end", (event, ctx) => {
    if (!providerPayloadLogEnabled() || !isAssistantMessage(event.message)) {
      return;
    }

    safeAppend(ctx.cwd, {
      timestamp_utc: new Date().toISOString(),
      kind: "assistant_message",
      ...(activeRequestId === undefined ? {} : { request_id: activeRequestId }),
      message: jsonSafe(event.message),
    });
    activeRequestId = undefined;
  });
}

export function appendProviderPayloadLogRecord(cwd: string, record: ProviderPayloadLogRecord): void {
  const stateDir = quailbotStateRoot(cwd);
  mkdirSync(stateDir, { recursive: true });
  const logPath = join(stateDir, PROVIDER_PAYLOAD_LOG_FILE);
  const records = readExistingRecords(logPath);
  records.push(record);
  const retained = records.slice(-PROVIDER_PAYLOAD_LOG_LIMIT);
  writeFileSync(logPath, `${retained.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf8");
}

function safeAppend(cwd: string, record: ProviderPayloadLogRecord): void {
  try {
    appendProviderPayloadLogRecord(cwd, record);
  } catch {
    // Provider payload logging is opt-in diagnostic telemetry; an unwritable
    // state directory must never break a real provider call.
  }
}

function readExistingRecords(logPath: string): ProviderPayloadLogRecord[] {
  if (!existsSync(logPath)) {
    return [];
  }

  try {
    return readFileSync(logPath, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as ProviderPayloadLogRecord];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

function providerPayloadLogEnabled(): boolean {
  return process.env[PROVIDER_PAYLOAD_LOG_ENV] === "1";
}

function nextRequestId(): string {
  requestSequence += 1;
  return `provider-${Date.now()}-${requestSequence}`;
}

function isAssistantMessage(value: unknown): boolean {
  return isRecord(value) && value.role === "assistant";
}

function jsonSafe(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value)) as unknown;
  } catch (error) {
    return { unserializable: error instanceof Error ? error.message : String(error) };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
