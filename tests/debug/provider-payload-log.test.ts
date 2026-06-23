import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { appendProviderPayloadLogRecord } from "../../src/debug/provider-payload-log.js";
import { quailbotStateRoot } from "../../src/workspace/workspace-state.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("provider payload log", () => {
  it("keeps only the newest fifty JSONL records", () => {
    const cwd = makeTempDir();

    for (let index = 0; index < 55; index += 1) {
      appendProviderPayloadLogRecord(cwd, {
        timestamp_utc: `2026-06-22T00:00:${String(index).padStart(2, "0")}.000Z`,
        kind: "provider_request",
        request_id: `request-${index}`,
        payload: { index },
      });
    }

    const records = readRecords();
    expect(records).toHaveLength(50);
    expect(records[0]).toMatchObject({ request_id: "request-5", payload: { index: 5 } });
    expect(records.at(-1)).toMatchObject({ request_id: "request-54", payload: { index: 54 } });
  });

  it("ignores corrupted existing lines when appending", () => {
    const cwd = makeTempDir();
    const stateDir = quailbotStateRoot();
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(join(stateDir, "provider-payloads.jsonl"), "{bad json\n", "utf8");

    appendProviderPayloadLogRecord(cwd, {
      timestamp_utc: "2026-06-22T00:00:00.000Z",
      kind: "provider_response",
      request_id: "request-ok",
      status: 200,
      headers: { "x-test": "ok" },
    });

    expect(readRecords()).toEqual([
      {
        timestamp_utc: "2026-06-22T00:00:00.000Z",
        kind: "provider_response",
        request_id: "request-ok",
        status: 200,
        headers: { "x-test": "ok" },
      },
    ]);
  });
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "quailbot-provider-payload-log-"));
  tempDirs.push(dir);
  return dir;
}

function readRecords(): unknown[] {
  return readFileSync(join(quailbotStateRoot(), "provider-payloads.jsonl"), "utf8")
    .trimEnd()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line) as unknown);
}
