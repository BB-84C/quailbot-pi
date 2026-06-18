import { readFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ExperimentLogService } from "../../src/experiment-log/experiment-log-service.js";
import type { ExperimentLogEvent } from "../../src/experiment-log/experiment-log-types.js";
import type { QuailbotRuntime } from "../../src/extension.js";
import { createKnowledgeRuntime } from "../../src/knowledge/knowledge-runtime.js";
import { PlanContextStore } from "../../src/prompt/plan-context.js";
import { registerQuailbotTools } from "../../src/tools/register-tools.js";
import { loadWorkspace } from "../../src/workspace/load-workspace.js";
import type { Workspace } from "../../src/workspace/types.js";

type RegisteredTool = {
  name: string;
  execute: (id: string, params: unknown) => Promise<unknown>;
};

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("registered tool experiment logging", () => {
  it("logs observe invocation start and GUI-unavailable result while preserving the returned tool envelope", async () => {
    const service = openExperimentLog(["exp_20260616-110200Z_observe", "evt-open", "evt-start", "evt-result"]);
    const tools = registerTools(runtimeWithExperimentLog(service, workspaceWithRoi()));
    const params = { rois: ["status_roi"] };

    const result = await requireTool(tools, "observe").execute("tool-call-observe", params);

    expect(result).toMatchObject({
      details: {
        ok: false,
        action: "observe",
        action_input: params,
        primary_result: {
          requested_rois: ["status_roi"],
          error_type: "roi_backend_unavailable",
        },
      },
      content: [{ type: "text" }],
    });
    expect((result as { details: unknown }).details).toEqual({
      ok: false,
      action: "observe",
      action_input: params,
      primary_result: {
        requested_rois: ["status_roi"],
        error_type: "roi_backend_unavailable",
        message: "ROI screenshot/OCR backend is not configured in this plugin implementation round.",
      },
    });

    const events = readEvents(service);
    expect(events.map((event) => event.event_kind)).toEqual([
      "experiment_open",
      "tool_invocation_started",
      "tool_result",
    ]);
    expect(events[1]).toMatchObject({
      event_id: "evt-start",
      tool_call_id: "tool-call-observe",
      tool_name: "observe",
      action_input: params,
    });
    expect(events[2]).toMatchObject({
      event_id: "evt-result",
      tool_call_id: "tool-call-observe",
      parent_event_id: "evt-start",
      tool_name: "observe",
      outcome: "gui_backend_unavailable",
      duration_ms: expect.any(Number),
      result: (result as { details: unknown }).details,
    });
  });

  it("logs tool exceptions and rethrows the original error", async () => {
    const service = openExperimentLog(["exp_20260616-110200Z_exception", "evt-open", "evt-start", "evt-exception"]);
    const tools = registerTools(runtimeWithExperimentLog(service, workspaceWithRoi()));
    const params = { rois: ["missing_roi"] };

    await expect(requireTool(tools, "observe").execute("tool-call-throws", params)).rejects.toThrow(
      /unknown or inactive ROI: missing_roi/,
    );

    const events = readEvents(service);
    expect(events.map((event) => event.event_kind)).toEqual([
      "experiment_open",
      "tool_invocation_started",
      "tool_exception",
    ]);
    expect(events[1]).toMatchObject({
      event_id: "evt-start",
      tool_call_id: "tool-call-throws",
      tool_name: "observe",
      action_input: params,
    });
    expect(events[2]).toMatchObject({
      event_id: "evt-exception",
      tool_call_id: "tool-call-throws",
      parent_event_id: "evt-start",
      tool_name: "observe",
      action_input: params,
      outcome: "exception",
      duration_ms: expect.any(Number),
      error: { name: "Error", message: "unknown or inactive ROI: missing_roi" },
    });
  });

  it("logs plan-and-execute invocation, sleep step result, and aggregate result in order", async () => {
    const service = openExperimentLog([
      "exp_20260616-110200Z_plan_execute",
      "evt-open",
      "evt-start",
      "evt-step",
      "evt-result",
    ]);
    const tools = registerTools(runtimeWithExperimentLog(service, fixtureWorkspace()));
    const params = { steps: [{ kind: "sleep_seconds", seconds: 0 }] };

    const result = await requireTool(tools, "quailbot_plan_and_execute").execute("tool-call-plan", params);

    expect(result).toMatchObject({
      details: {
        ok: true,
        action: "quailbot_plan_and_execute",
        primary_result: { ok: true, stopped_reason: "completed" },
      },
    });
    const events = readEvents(service);
    expect(events.map((event) => event.event_kind)).toEqual([
      "experiment_open",
      "tool_invocation_started",
      "plan_step_result",
      "tool_result",
    ]);
    expect(events[1]).toMatchObject({
      event_id: "evt-start",
      tool_call_id: "tool-call-plan",
      tool_name: "quailbot_plan_and_execute",
      action_input: params,
    });
    expect(events[2]).toMatchObject({
      event_id: "evt-step",
      tool_call_id: "tool-call-plan",
      parent_event_id: "evt-start",
      outcome: "measured",
      step: {
        index: 0,
        kind: "sleep_seconds",
        args: { kind: "sleep_seconds", seconds: 0 },
        primary_result: { slept_seconds: 0 },
      },
    });
    expect(events[3]).toMatchObject({
      event_id: "evt-result",
      tool_call_id: "tool-call-plan",
      parent_event_id: "evt-start",
      tool_name: "quailbot_plan_and_execute",
      outcome: "measured",
      duration_ms: expect.any(Number),
      result: jsonPersisted((result as { details: unknown }).details),
    });
  });

  it("does not log top-level planwrite or sleep_seconds calls", async () => {
    const service = openExperimentLog(["exp_20260616-110200Z_unwrapped", "evt-open"]);
    const tools = registerTools(runtimeWithExperimentLog(service, fixtureWorkspace()));

    await requireTool(tools, "quailbot_planwrite").execute("tool-call-planwrite", {
      mode: "ephemeral",
      text: "Operator note",
    });
    await requireTool(tools, "sleep_seconds").execute("tool-call-sleep", { seconds: 0 });

    const events = readEvents(service);
    expect(events.map((event) => event.event_kind)).toEqual(["experiment_open"]);
  });
});

function registerTools(runtime: QuailbotRuntime): RegisteredTool[] {
  const tools: RegisteredTool[] = [];
  registerQuailbotTools(
    {
      registerTool: (tool: RegisteredTool) => tools.push(tool),
    } as never,
    runtime,
  );
  return tools;
}

function requireTool(tools: RegisteredTool[], name: string): RegisteredTool {
  const tool = tools.find((candidate) => candidate.name === name);
  if (tool === undefined) {
    throw new Error(`tool not registered: ${name}`);
  }

  return tool;
}

function runtimeWithExperimentLog(experimentLog: ExperimentLogService, workspace: Workspace): QuailbotRuntime {
  return {
    workspace,
    experimentLog,
    planStore: new PlanContextStore(),
    knowledge: createKnowledgeRuntime(),
  };
}

function openExperimentLog(ids: string[]): ExperimentLogService {
  const service = new ExperimentLogService({ root: makeTempDir(), idFactory: idFactory(ids), warn: () => {} });
  const result = service.open({ sessionStartReason: "fresh_session" });
  if (!result.ok) {
    throw new Error(`experiment log failed to open: ${result.error}`);
  }

  return service;
}

function readEvents(service: ExperimentLogService): ExperimentLogEvent[] {
  const eventsPath = service.currentIdentity()?.events_path;
  if (eventsPath === undefined) {
    throw new Error("experiment log is not open");
  }

  return readFileSync(eventsPath, "utf8")
    .trimEnd()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ExperimentLogEvent);
}

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "quailbot-tool-log-wrapper-"));
  tempDirs.push(dir);
  return dir;
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

function jsonPersisted(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function fixtureWorkspace(): Workspace {
  return loadWorkspace(join(process.cwd(), "tests/workspaces/nanonis-minimal.workspace.json"));
}

function workspaceWithRoi(): Workspace {
  const workspace = fixtureWorkspace();
  workspace.rois.push({ ref: "roi:status", name: "status_roi", active: true, linkedObservables: [], schema: {} });
  return workspace;
}
