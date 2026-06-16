import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { EXPERIMENT_LOG_SCHEMA_VERSION, type ExperimentLogEvent } from "../../src/experiment-log/experiment-log-types.js";
import { ExperimentLogService, experimentLogRoot } from "../../src/experiment-log/experiment-log-service.js";
import { disabledMutationPolicy, enabledMutationPolicy } from "../../src/tools/mutation-policy.js";
import type { QuailbotToolResult } from "../../src/tools/tool-result.js";
import type { LoadedWorkspace } from "../../src/workspace/workspace-service.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("experimentLogRoot", () => {
  it("places experiment logs below the existing quailbot state root", () => {
    const cwd = join("D:", "vault", "project");

    expect(experimentLogRoot(cwd)).toBe(join(cwd, ".quailbot-pi", "experiments"));
  });
});

describe("ExperimentLogService", () => {
  it("opens a deterministic append-only log, writes complete events, and clears identity on close", () => {
    const root = makeTempDir();
    const experimentId = "exp_20260616-063000Z_alpha";
    const eventsPath = join(root, "2026", "06", "16", experimentId, "events.jsonl");
    const blobsPath = join(root, "2026", "06", "16", experimentId, "blobs");
    const service = new ExperimentLogService({
      root,
      now: fixedNow,
      idFactory: idFactory([experimentId, "evt-open", "evt-start", "evt-result", "evt-close"]),
    });
    const initialWorkspace = loadedWorkspace("sha256:workspace-A");
    const updatedWorkspace = loadedWorkspace("sha256:workspace-B");
    const toolResult: QuailbotToolResult = {
      ok: true,
      action: "cli_set",
      action_input: { cli_name: "nqctl", parameter: "bias_v", value: 1.25 },
      primary_result: { ok: true, exit_code: 0, stdout: "", stderr: "" },
      linked_observation: { channels: { cli: { results: { "nqctl:bias_v": { ok: true, payload: { bias_v: 1.25 } } } } } },
    };

    const open = service.open({
      sessionStartReason: "fresh_session",
      previousSessionFile: "previous.jsonl",
      workspace: initialWorkspace,
      mutationPolicy: enabledMutationPolicy(),
    });
    expect(open).toMatchObject({ ok: true, path: eventsPath, event_id: "evt-open", sequence: 1 });
    expect(service.currentIdentity()).toMatchObject({ experiment_id: experimentId, events_path: eventsPath, blobs_path: blobsPath });
    expect(service.currentWorkspaceHash()).toBe("sha256:workspace-A");
    expect(existsSync(blobsPath)).toBe(true);

    const started = service.recordToolInvocationStarted({ toolName: "cli_set", input: toolResult.action_input });
    expect(started).toMatchObject({ ok: true, path: eventsPath, event_id: "evt-start", sequence: 2 });

    service.updateContext({ workspace: updatedWorkspace, mutationPolicy: disabledMutationPolicy() });
    expect(service.currentWorkspaceHash()).toBe("sha256:workspace-B");
    const result = service.recordToolResult(toolResult);
    expect(result).toMatchObject({ ok: true, path: eventsPath, event_id: "evt-result", sequence: 3 });

    const close = service.close("session_shutdown");
    expect(close).toMatchObject({ ok: true, path: eventsPath, event_id: "evt-close", sequence: 4 });
    expect(service.currentIdentity()).toBeUndefined();

    const events = readJsonl(eventsPath);
    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3, 4]);
    expect(events.map((event) => event.event_kind)).toEqual([
      "experiment_open",
      "tool_invocation_started",
      "tool_result",
      "experiment_close",
    ]);
    for (const event of events) {
      expect(event.schema_version).toBe(EXPERIMENT_LOG_SCHEMA_VERSION);
      expect(event.experiment_id).toBe(experimentId);
      expect(event.timestamp_utc).toBe("2026-06-16T06:30:00.000Z");
    }

    expect(events[0]).toMatchObject({
      event_id: "evt-open",
      event_kind: "experiment_open",
      session_start_reason: "fresh_session",
      previous_session_file: "previous.jsonl",
      workspace: { hash: "sha256:workspace-A" },
      mutation_policy: { mutating_tools_enabled: true },
    });
    expect(events[1]).toMatchObject({ event_id: "evt-start", tool_name: "cli_set", input: toolResult.action_input });
    expect(events[2]).toMatchObject({
      event_id: "evt-result",
      event_kind: "tool_result",
      outcome: "applied",
      result: toolResult,
      workspace: { hash: "sha256:workspace-B" },
      mutation_policy: { mutating_tools_enabled: false },
    });
    expect(events[3]).toMatchObject({
      event_id: "evt-close",
      event_kind: "experiment_close",
      reason: "session_shutdown",
      event_count: 4,
      last_sequence: 4,
    });
  });

  it("records tool exceptions and plan step results with classified outcomes", () => {
    const root = makeTempDir();
    const service = new ExperimentLogService({
      root,
      now: fixedNow,
      idFactory: idFactory(["exp_20260616-063000Z_methods", "evt-open", "evt-exception", "evt-step"]),
    });
    service.open({ sessionStartReason: "fresh_session" });
    const error = new TypeError("driver exploded");

    const exception = service.recordToolException({ toolName: "cli_get", input: { parameter: "current" }, error });
    const step = service.recordPlanStepResult({
      index: 0,
      kind: "cli_set",
      args: { parameter: "bias_v", value: 1.25 },
      primary_result: { ok: true, exit_code: 0 },
    });

    expect(exception).toMatchObject({ ok: true, event: { event_kind: "tool_exception", outcome: "exception" } });
    if (!exception.ok) {
      throw new Error("expected exception event write to pass");
    }
    expect(exception.event).toMatchObject({
      tool_name: "cli_get",
      input: { parameter: "current" },
      error: { name: "TypeError", message: "driver exploded" },
    });
    expect(typeof exception.event.error.stack).toBe("string");
    expect(step).toMatchObject({ ok: true, event: { event_kind: "plan_step_result", outcome: "applied" } });
  });

  it("fails soft when appending a line fails and emits a warning with the attempted event", () => {
    const warnings: string[] = [];
    const service = new ExperimentLogService({
      root: makeTempDir(),
      now: fixedNow,
      idFactory: idFactory(["exp_20260616-063000Z_failsoft", "evt-open"]),
      appendLine: () => {
        throw new Error("disk full");
      },
      warn: (message) => warnings.push(message),
    });

    const result = service.open({ sessionStartReason: "fresh_session" });

    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining("disk full"),
      event: { event_kind: "experiment_open", sequence: 1 },
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("experiment log write failed");
  });
});

function readJsonl(path: string): ExperimentLogEvent[] {
  return readFileSync(path, "utf8")
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line) as ExperimentLogEvent);
}

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "quailbot-experiment-log-service-"));
  tempDirs.push(dir);
  return dir;
}

function fixedNow(): Date {
  return new Date("2026-06-16T06:30:00.000Z");
}

function idFactory(ids: string[]): () => string {
  let index = 0;
  return () => {
    const id = ids[index];
    index += 1;
    if (id === undefined) {
      throw new Error("test idFactory exhausted");
    }
    return id;
  };
}

function loadedWorkspace(hash: string): LoadedWorkspace {
  return {
    selection: { path: `D:/vault/${hash}.workspace.json`, source: "explicit" },
    workspace: {} as LoadedWorkspace["workspace"],
    hash,
    summary: {
      path: `D:/vault/${hash}.workspace.json`,
      source: "explicit",
      hash,
      active_rois: [],
      active_anchors: [],
      cli: { enabled: true, default_cli_name: "nqctl", parameter_count: 1, action_count: 0 },
    },
  };
}
