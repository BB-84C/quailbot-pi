import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { EXPERIMENT_LOG_SCHEMA_VERSION, type ExperimentLogEvent } from "../../src/experiment-log/experiment-log-types.js";
import { findExperimentEventsPath, listExperiments, readExperiment } from "../../src/experiment-log/experiment-log-reader.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("readExperiment", () => {
  it("summarizes a closed experiment from complete jsonl events", () => {
    const root = makeTempDir();
    const eventsPath = writeExperiment(root, "2026-06-16/exp_closed/events.jsonl", [
      event({
        event_id: "evt-open",
        experiment_id: "exp_closed",
        sequence: 1,
        timestamp_utc: "2026-06-16T06:30:00.000Z",
        event_kind: "experiment_open",
        workspace: workspace("sha256:open"),
      }),
      event({
        event_id: "evt-result",
        experiment_id: "exp_closed",
        sequence: 2,
        timestamp_utc: "2026-06-16T06:31:00.000Z",
        event_kind: "tool_result",
        outcome: "applied",
        workspace: workspace("sha256:result"),
        result: { ok: true, action: "cli_set", action_input: {}, primary_result: { ok: true } },
      }),
      event({
        event_id: "evt-close",
        experiment_id: "exp_closed",
        sequence: 3,
        timestamp_utc: "2026-06-16T06:32:00.000Z",
        event_kind: "experiment_close",
        reason: "session_shutdown",
        event_count: 3,
        last_sequence: 3,
      }),
    ]);

    const result = readExperiment(eventsPath);

    expect(result.ignoredTail).toBeUndefined();
    expect(result.events).toHaveLength(3);
    expect(result.summary).toMatchObject({
      experiment_id: "exp_closed",
      events_path: eventsPath,
      started_at: "2026-06-16T06:30:00.000Z",
      closed_at: "2026-06-16T06:32:00.000Z",
      status: "closed",
      workspace: { hash: "sha256:result" },
      event_count: 3,
      outcome_counts: { applied: 1 },
    });
  });

  it("reports interrupted_unknown for experiments with events but no close without synthesizing a close event", () => {
    const root = makeTempDir();
    const eventsPath = writeExperiment(root, "2026-06-16/exp_interrupted/events.jsonl", [
      event({
        event_id: "evt-open",
        experiment_id: "exp_interrupted",
        sequence: 1,
        timestamp_utc: "2026-06-16T06:30:00.000Z",
        event_kind: "experiment_open",
      }),
      event({
        event_id: "evt-result",
        experiment_id: "exp_interrupted",
        sequence: 2,
        timestamp_utc: "2026-06-16T06:31:00.000Z",
        event_kind: "tool_result",
        outcome: "measured",
        result: { ok: true, action: "cli_get", action_input: {}, primary_result: { ok: true } },
      }),
    ]);

    const result = readExperiment(eventsPath);

    expect(result.summary.status).toBe("interrupted_unknown");
    expect(result.summary.outcome_counts).toMatchObject({ measured: 1, interrupted_unknown: 1 });
    expect(result.events.map((entry) => entry.event_kind)).toEqual(["experiment_open", "tool_result"]);
  });

  it("does not report a resumed experiment as closed when the resume segment has no close yet", () => {
    const root = makeTempDir();
    const eventsPath = writeExperiment(root, "2026-06-16/exp_resumed/events.jsonl", [
      event({
        event_id: "evt-open",
        experiment_id: "exp_resumed",
        sequence: 1,
        timestamp_utc: "2026-06-16T06:30:00.000Z",
        event_kind: "experiment_open",
      }),
      event({
        event_id: "evt-close",
        experiment_id: "exp_resumed",
        sequence: 2,
        timestamp_utc: "2026-06-16T06:32:00.000Z",
        event_kind: "experiment_close",
        reason: "session_shutdown",
        event_count: 2,
        last_sequence: 2,
      }),
      event({
        event_id: "evt-reopen",
        experiment_id: "exp_resumed",
        sequence: 3,
        timestamp_utc: "2026-06-16T07:00:00.000Z",
        event_kind: "experiment_open",
        resumed: true,
      }),
      event({
        event_id: "evt-result",
        experiment_id: "exp_resumed",
        sequence: 4,
        timestamp_utc: "2026-06-16T07:01:00.000Z",
        event_kind: "tool_result",
        outcome: "measured",
        result: { ok: true, action: "cli_get", action_input: {}, primary_result: { ok: true } },
      }),
    ]);

    const result = readExperiment(eventsPath);

    expect(result.summary.status).toBe("interrupted_unknown");
    expect(result.summary.closed_at).toBeUndefined();
    expect(result.summary.started_at).toBe("2026-06-16T06:30:00.000Z");
  });

  it("reports a resumed experiment as closed when the resume segment ends with a close", () => {
    const root = makeTempDir();
    const eventsPath = writeExperiment(root, "2026-06-16/exp_resumed_closed/events.jsonl", [
      event({
        event_id: "evt-open",
        experiment_id: "exp_resumed_closed",
        sequence: 1,
        timestamp_utc: "2026-06-16T06:30:00.000Z",
        event_kind: "experiment_open",
      }),
      event({
        event_id: "evt-close",
        experiment_id: "exp_resumed_closed",
        sequence: 2,
        timestamp_utc: "2026-06-16T06:32:00.000Z",
        event_kind: "experiment_close",
        reason: "session_shutdown",
        event_count: 2,
        last_sequence: 2,
      }),
      event({
        event_id: "evt-reopen",
        experiment_id: "exp_resumed_closed",
        sequence: 3,
        timestamp_utc: "2026-06-16T07:00:00.000Z",
        event_kind: "experiment_open",
        resumed: true,
      }),
      event({
        event_id: "evt-close-2",
        experiment_id: "exp_resumed_closed",
        sequence: 4,
        timestamp_utc: "2026-06-16T07:05:00.000Z",
        event_kind: "experiment_close",
        reason: "session_shutdown",
        event_count: 4,
        last_sequence: 4,
      }),
    ]);

    const result = readExperiment(eventsPath);

    expect(result.summary.status).toBe("closed");
    expect(result.summary.closed_at).toBe("2026-06-16T07:05:00.000Z");
  });

  it("ignores and exposes a partial trailing line", () => {
    const root = makeTempDir();
    const eventsPath = join(root, "2026-06-16", "exp_partial", "events.jsonl");
    mkdirSync(dirname(eventsPath), { recursive: true });
    writeFileSync(
      eventsPath,
      [
        JSON.stringify(
          event({
            event_id: "evt-open",
            experiment_id: "exp_partial",
            sequence: 1,
            timestamp_utc: "2026-06-16T06:30:00.000Z",
            event_kind: "experiment_open",
          }),
        ),
        JSON.stringify(
          event({
            event_id: "evt-close",
            experiment_id: "exp_partial",
            sequence: 2,
            timestamp_utc: "2026-06-16T06:31:00.000Z",
            event_kind: "experiment_close",
            reason: "session_shutdown",
            event_count: 2,
            last_sequence: 2,
          }),
        ),
        "{\"event_kind\":\"tool_result\"",
      ].join("\n"),
      "utf8",
    );

    const result = readExperiment(eventsPath);

    expect(result.events.map((entry) => entry.event_kind)).toEqual(["experiment_open", "experiment_close"]);
    expect(result.ignoredTail).toBe("{\"event_kind\":\"tool_result\"");
    expect(result.summary.status).toBe("closed");
  });

  it("skips and exposes malformed complete jsonl lines while keeping valid events", () => {
    const root = makeTempDir();
    const eventsPath = join(root, "2026-06-16", "exp_corrupt", "events.jsonl");
    mkdirSync(dirname(eventsPath), { recursive: true });
    writeFileSync(
      eventsPath,
      [
        JSON.stringify(
          event({
            event_id: "evt-open",
            experiment_id: "exp_corrupt",
            sequence: 1,
            timestamp_utc: "2026-06-16T06:30:00.000Z",
            event_kind: "experiment_open",
          }),
        ),
        "{not valid json}",
        JSON.stringify(
          event({
            event_id: "evt-result",
            experiment_id: "exp_corrupt",
            sequence: 2,
            timestamp_utc: "2026-06-16T06:31:00.000Z",
            event_kind: "tool_result",
            outcome: "measured",
            result: { ok: true, action: "cli_get", action_input: {}, primary_result: { ok: true } },
          }),
        ),
      ].join("\n") + "\n",
      "utf8",
    );

    const result = readExperiment(eventsPath);

    expect(result.events.map((entry) => entry.event_id)).toEqual(["evt-open", "evt-result"]);
    expect(result.ignoredLines).toEqual([{ lineNumber: 2, line: "{not valid json}", error: expect.any(String) }]);
    expect(result.summary.event_count).toBe(2);
    expect(result.summary.outcome_counts).toMatchObject({ measured: 1, interrupted_unknown: 1 });
  });
});

describe("listExperiments and findExperimentEventsPath", () => {
  it("recursively discovers experiment logs, finds by id, and sorts newest started experiments first", () => {
    const root = makeTempDir();
    const olderPath = writeExperiment(root, "2026-06-15/exp_older/events.jsonl", [
      event({
        event_id: "evt-open-older",
        experiment_id: "exp_older",
        sequence: 1,
        timestamp_utc: "2026-06-15T23:59:00.000Z",
        event_kind: "experiment_open",
      }),
    ]);
    const newerPath = writeExperiment(root, "2026-06-16/exp_newer/events.jsonl", [
      event({
        event_id: "evt-open-newer",
        experiment_id: "exp_newer",
        sequence: 1,
        timestamp_utc: "2026-06-16T06:30:00.000Z",
        event_kind: "experiment_open",
      }),
    ]);

    const summaries = listExperiments(root);

    expect(summaries.map((summary) => summary.experiment_id)).toEqual(["exp_newer", "exp_older"]);
    expect(findExperimentEventsPath(root, "exp_newer")).toBe(newerPath);
    expect(findExperimentEventsPath(root, "exp_older")).toBe(olderPath);
    expect(findExperimentEventsPath(root, "exp_missing")).toBeUndefined();
  });

  it("does not throw when one discovered experiment has a malformed complete line", () => {
    const root = makeTempDir();
    const validPath = writeExperiment(root, "2026-06-16/exp_valid/events.jsonl", [
      event({
        event_id: "evt-valid-open",
        experiment_id: "exp_valid",
        sequence: 1,
        timestamp_utc: "2026-06-16T06:30:00.000Z",
        event_kind: "experiment_open",
      }),
    ]);
    const corruptPath = join(root, "2026-06-16", "exp_corrupt_discovered", "events.jsonl");
    mkdirSync(dirname(corruptPath), { recursive: true });
    writeFileSync(
      corruptPath,
      `${JSON.stringify(
        event({
          event_id: "evt-corrupt-open",
          experiment_id: "exp_corrupt_discovered",
          sequence: 1,
          timestamp_utc: "2026-06-16T06:31:00.000Z",
          event_kind: "experiment_open",
        }),
      )}\n{broken}\n`,
      "utf8",
    );

    expect(() => listExperiments(root)).not.toThrow();
    expect(listExperiments(root).map((summary) => summary.experiment_id)).toEqual(["exp_corrupt_discovered", "exp_valid"]);
    expect(findExperimentEventsPath(root, "exp_valid")).toBe(validPath);
    expect(findExperimentEventsPath(root, "exp_corrupt_discovered")).toBe(corruptPath);
  });
});

function writeExperiment(root: string, relativePath: string, events: ExperimentLogEvent[]): string {
  const path = join(root, ...relativePath.split("/"));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${events.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
  return path;
}

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "quailbot-experiment-log-reader-"));
  tempDirs.push(dir);
  return dir;
}

function event(overrides: Partial<ExperimentLogEvent>): ExperimentLogEvent {
  return {
    schema_version: EXPERIMENT_LOG_SCHEMA_VERSION,
    event_id: "evt-default",
    experiment_id: "exp_default",
    sequence: 1,
    timestamp_utc: "2026-06-16T06:30:00.000Z",
    event_kind: "experiment_open",
    ...overrides,
  } as ExperimentLogEvent;
}

function workspace(hash: string) {
  return { path: `D:/vault/${hash}.workspace.json`, hash, source: "explicit" as const };
}
