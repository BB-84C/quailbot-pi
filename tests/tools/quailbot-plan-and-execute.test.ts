import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { RunCli } from "../../src/cli/cli-driver.js";
import { executeQuailbotPlanAndExecute } from "../../src/tools/quailbot_plan_and_execute.js";
import { registerQuailbotTools } from "../../src/tools/register-tools.js";
import { createToolContext } from "../../src/tools/tool-context.js";
import { disabledMutationPolicy, enabledMutationPolicy } from "../../src/tools/mutation-policy.js";
import { loadWorkspace } from "../../src/workspace/load-workspace.js";
import type { Workspace } from "../../src/workspace/types.js";

describe("quailbot_plan_and_execute", () => {
  it("allows read-only cli_get plans under the default disabled mutation policy", async () => {
    const runCli = vi.fn<RunCli>().mockResolvedValueOnce({
      ok: true,
      exitCode: 0,
      stdout: '{"current":1.2}',
      stderr: "",
      payload: { current: 1.2 },
      argv: ["nqctl", "get", "current"],
    });
    const ctx = createToolContext({ workspace: fixtureWorkspace(), runCli, mutationPolicy: disabledMutationPolicy() });

    const result = await executeQuailbotPlanAndExecute(ctx, {
      steps: [{ kind: "cli_get", cli_name: "nqctl", parameter: "current" }],
    });

    expect(result.ok).toBe(true);
    expect(result.primary_result).toMatchObject({ ok: true, stopped_reason: "completed" });
    const primary = result.primary_result as { steps: Array<Record<string, unknown>> };
    expect(primary.steps).toHaveLength(1);
    expect(primary.steps[0]).toMatchObject({ kind: "cli_get", primary_result: { ok: true, parameter: "current" } });
    expect(runCli).toHaveBeenCalledTimes(1);
  });

  it("emits one step record after real cli_get execution", async () => {
    const runCli = vi.fn<RunCli>().mockResolvedValueOnce({
      ok: true,
      exitCode: 0,
      stdout: '{"current":1.2}',
      stderr: "",
      payload: { current: 1.2 },
      argv: ["nqctl", "get", "current"],
    });
    const ctx = createToolContext({ workspace: fixtureWorkspace(), runCli, mutationPolicy: disabledMutationPolicy() });
    const records: Array<Record<string, unknown>> = [];

    const result = await executeQuailbotPlanAndExecute(
      ctx,
      { steps: [{ kind: "cli_get", cli_name: "nqctl", parameter: "current" }] },
      { onStepResult: (step) => { records.push(step); } },
    );

    expect(result.ok).toBe(true);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      index: 0,
      kind: "cli_get",
      args: { kind: "cli_get", cli_name: "nqctl", parameter: "current" },
      primary_result: { ok: true, parameter: "current" },
    });
    expect(runCli).toHaveBeenCalledTimes(1);
  });

  it("emits zero step records on validation failure", async () => {
    const runCli = vi.fn<RunCli>();
    const ctx = createToolContext({ workspace: fixtureWorkspace(), runCli, mutationPolicy: enabledMutationPolicy() });
    const onStepResult = vi.fn();

    const result = await executeQuailbotPlanAndExecute(
      ctx,
      { steps: [{ kind: "cli_get", cli_name: "nqctl", parameter: "missing" }] },
      { onStepResult },
    );

    expect(result.primary_result).toMatchObject({
      ok: false,
      stopped_reason: "validation_failed",
      validation_error: expect.stringContaining("unknown CLI parameter: nqctl:missing"),
      steps: [],
    });
    expect(onStepResult).not.toHaveBeenCalled();
    expect(runCli).not.toHaveBeenCalled();
  });

  it("swallows recorder throws without changing the plan result", async () => {
    const runCli = vi.fn<RunCli>().mockResolvedValueOnce({
      ok: true,
      exitCode: 0,
      stdout: '{"current":1.2}',
      stderr: "",
      payload: { current: 1.2 },
      argv: ["nqctl", "get", "current"],
    });
    const ctx = createToolContext({ workspace: fixtureWorkspace(), runCli, mutationPolicy: disabledMutationPolicy() });
    const onStepResult = vi.fn().mockRejectedValueOnce(new Error("recorder offline"));

    const result = await executeQuailbotPlanAndExecute(
      ctx,
      { steps: [{ kind: "cli_get", cli_name: "nqctl", parameter: "current" }] },
      { onStepResult },
    );

    expect(result.ok).toBe(true);
    expect(result.primary_result).toMatchObject({ ok: true, stopped_reason: "completed" });
    const primary = result.primary_result as { steps: Array<Record<string, unknown>> };
    expect(primary.steps).toHaveLength(1);
    expect(primary.steps[0]).toMatchObject({ kind: "cli_get", primary_result: { ok: true, parameter: "current" } });
    expect(onStepResult).toHaveBeenCalledTimes(1);
  });

  it("rejects mutating cli_set plans during preflight under the default disabled mutation policy", async () => {
    const runCli = vi.fn<RunCli>();
    const ctx = createToolContext({ workspace: fixtureWorkspace(), runCli, mutationPolicy: disabledMutationPolicy() });

    const result = await executeQuailbotPlanAndExecute(ctx, {
      steps: [{ kind: "cli_set", cli_name: "nqctl", parameter: "zctrl_setpnt", value: 1.5 }],
    });

    expect(result.primary_result).toMatchObject({
      ok: false,
      stopped_reason: "validation_failed",
      validation_error: expect.stringContaining("mutation policy disabled"),
      steps: [],
    });
    expect(runCli).not.toHaveBeenCalled();
  });

  it("rejects disabled mutating plans before validating earlier read-only CLI steps", async () => {
    const executeCliGet = vi.fn().mockResolvedValue({
      ok: true,
      action: "cli_get",
      action_input: { kind: "cli_get", cli_name: "nqctl", parameter: "current" },
      primary_result: { ok: true, parameter: "current" },
    });

    vi.resetModules();
    vi.doMock("../../src/tools/cli_get.js", () => ({ executeCliGet }));

    try {
      const { executeQuailbotPlanAndExecute: executePlan } = await import(
        "../../src/tools/quailbot_plan_and_execute.js"
      );
      const runCli = vi.fn<RunCli>();
      const ctx = createToolContext({ workspace: fixtureWorkspace(), runCli, mutationPolicy: disabledMutationPolicy() });

      const result = await executePlan(ctx, {
        steps: [
          { kind: "cli_get", cli_name: "nqctl", parameter: "current" },
          { kind: "cli_set", cli_name: "nqctl", parameter: "zctrl_setpnt", value: 1.5 },
        ],
      });

      expect(result.primary_result).toMatchObject({
        ok: false,
        stopped_reason: "validation_failed",
        validation_error: expect.stringContaining("mutation policy disabled"),
        steps: [],
      });
      expect(executeCliGet).not.toHaveBeenCalled();
      expect(runCli).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock("../../src/tools/cli_get.js");
      vi.resetModules();
    }
  });

  it("runs a serial cli_set then cli_get program and preserves per-step linked observations", async () => {
    const runCli = vi
      .fn<RunCli>()
      .mockResolvedValueOnce({
        ok: true,
        exitCode: 0,
        stdout: "",
        stderr: "",
        payload: undefined,
        argv: ["nqctl", "set", "zctrl_setpnt", "--arg", "setpoint=1.5"],
      })
      .mockResolvedValueOnce({
        ok: true,
        exitCode: 0,
        stdout: '{"setpoint":1.5}',
        stderr: "",
        payload: { setpoint: 1.5 },
        argv: ["nqctl", "get", "zctrl_setpnt"],
      })
      .mockResolvedValueOnce({
        ok: true,
        exitCode: 0,
        stdout: '{"current":1.2}',
        stderr: "",
        payload: { current: 1.2 },
        argv: ["nqctl", "get", "current"],
      })
      .mockResolvedValueOnce({
        ok: true,
        exitCode: 0,
        stdout: '{"current":1.2}',
        stderr: "",
        payload: { current: 1.2 },
        argv: ["nqctl", "get", "current"],
      });
    const ctx = createToolContext({ workspace: fixtureWorkspace(), runCli, mutationPolicy: enabledMutationPolicy() });

    const result = await executeQuailbotPlanAndExecute(ctx, {
      steps: [
        { kind: "cli_set", cli_name: "nqctl", parameter: "zctrl_setpnt", value: 1.5 },
        { kind: "cli_get", cli_name: "nqctl", parameter: "current" },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.action).toBe("quailbot_plan_and_execute");
    expect(result.primary_result).toMatchObject({ ok: true, stopped_reason: "completed" });

    const primary = result.primary_result as { steps: Array<Record<string, unknown>> };
    expect(primary.steps).toHaveLength(2);
    expect(primary.steps.map((step) => step.kind)).toEqual(["cli_set", "cli_get"]);
    expect(primary.steps.map((step) => step.index)).toEqual([0, 1]);
    expect(primary.steps[0].primary_result).toMatchObject({ parameter: "zctrl_setpnt", ok: true });
    expect(primary.steps[0].linked_observation).toMatchObject({
      channels: {
        cli: {
          observables: ["nqctl:zctrl_setpnt", "nqctl:current"],
          results: {
            "nqctl:zctrl_setpnt": { ok: true, payload: { setpoint: 1.5 } },
            "nqctl:current": { ok: true, payload: { current: 1.2 } },
          },
        },
      },
      unresolved: [],
    });
    expect(primary.steps[1].primary_result).toMatchObject({ parameter: "current", ok: true });
  });

  it("rejects an empty step list", async () => {
    const ctx = createToolContext({ workspace: fixtureWorkspace(), runCli: vi.fn<RunCli>(), mutationPolicy: enabledMutationPolicy() });

    await expect(executeQuailbotPlanAndExecute(ctx, { steps: [] })).rejects.toThrow(
      /quailbot_plan_and_execute requires at least one step/,
    );
  });

  it("validates the full program before executing any real CLI side effects", async () => {
    const runCli = vi.fn<RunCli>();
    const ctx = createToolContext({ workspace: fixtureWorkspace(), runCli, mutationPolicy: enabledMutationPolicy() });

    const result = await executeQuailbotPlanAndExecute(ctx, {
      steps: [
        { kind: "cli_set", cli_name: "nqctl", parameter: "zctrl_setpnt", value: 1.5 },
        { kind: "cli_get", cli_name: "nqctl", parameter: "missing" },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.primary_result).toMatchObject({
      ok: false,
      stopped_reason: "validation_failed",
      validation_error: expect.stringContaining("unknown CLI parameter: nqctl:missing"),
      steps: [],
    });
    expect(runCli).not.toHaveBeenCalled();
  });

  it("preflight-validates CLI timeout options before any real mutating side effects", async () => {
    const runCli = vi.fn<RunCli>();
    const ctx = createToolContext({ workspace: fixtureWorkspace(), runCli, mutationPolicy: enabledMutationPolicy() });

    const result = await executeQuailbotPlanAndExecute(ctx, {
      steps: [
        { kind: "cli_set", cli_name: "nqctl", parameter: "zctrl_setpnt", value: 1.5 },
        { kind: "cli_get", cli_name: "nqctl", parameter: "current", timeout_ms: 0 },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.primary_result).toMatchObject({
      ok: false,
      stopped_reason: "validation_failed",
      validation_error: expect.stringContaining("timeoutMs must be a finite positive number"),
      steps: [],
    });
    expect(runCli).not.toHaveBeenCalled();
  });

  it("preflight-validates GUI ROI arguments before any real mutating CLI side effects", async () => {
    const runCli = vi.fn<RunCli>();
    const ctx = createToolContext({ workspace: workspaceWithGuiTargets(), runCli, mutationPolicy: enabledMutationPolicy() });

    const result = await executeQuailbotPlanAndExecute(ctx, {
      steps: [
        { kind: "cli_set", cli_name: "nqctl", parameter: "zctrl_setpnt", value: 1.5 },
        { kind: "set_field", anchor: "active_anchor", typed_text: "42", rois: ["missing_roi"] },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.primary_result).toMatchObject({
      ok: false,
      stopped_reason: "validation_failed",
      validation_error: expect.stringContaining("unknown or inactive ROI: missing_roi"),
      steps: [],
    });
    expect(runCli).not.toHaveBeenCalled();
  });

  it("reports unsupported step kinds as validation failures before execution", async () => {
    const runCli = vi.fn<RunCli>();
    const ctx = createToolContext({ workspace: fixtureWorkspace(), runCli, mutationPolicy: enabledMutationPolicy() });

    const result = await executeQuailbotPlanAndExecute(ctx, {
      steps: [
        { kind: "cli_set", cli_name: "nqctl", parameter: "zctrl_setpnt", value: 1.5 },
        { kind: "not_supported" } as never,
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.primary_result).toMatchObject({
      ok: false,
      stopped_reason: "validation_failed",
      validation_error: expect.stringContaining("unsupported step"),
      steps: [],
    });
    expect(runCli).not.toHaveBeenCalled();
  });

  it("distinguishes real execution step failure from validation failure and stops later steps", async () => {
    const runCli = vi.fn<RunCli>().mockResolvedValueOnce({
      ok: false,
      exitCode: 1,
      stdout: "",
      stderr: "instrument refused read",
      payload: undefined,
      argv: ["nqctl", "get", "current"],
    });
    const ctx = createToolContext({ workspace: fixtureWorkspace(), runCli, mutationPolicy: enabledMutationPolicy() });

    const result = await executeQuailbotPlanAndExecute(ctx, {
      steps: [
        { kind: "cli_get", cli_name: "nqctl", parameter: "current" },
        { kind: "cli_get", cli_name: "nqctl", parameter: "current" },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.primary_result).toMatchObject({ ok: false, stopped_reason: "step_failed" });
    const primary = result.primary_result as { steps: Array<Record<string, unknown>> };
    expect(primary.steps).toHaveLength(1);
    expect(primary.steps[0]).toMatchObject({
      index: 0,
      kind: "cli_get",
      primary_result: { ok: false, exit_code: 1, stderr: "instrument refused read" },
    });
    expect(runCli).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["observe", { kind: "observe", rois: ["status_roi"] }, "roi_backend_unavailable"],
    ["click_anchor", { kind: "click_anchor", anchor: "active_anchor" }, "gui_backend_unavailable"],
    ["set_field", { kind: "set_field", anchor: "active_anchor", typed_text: "42" }, "gui_backend_unavailable"],
  ] as const)("accepts %s GUI steps as supported plan steps", async (_name, step, errorType) => {
    const runCli = vi.fn<RunCli>();
    const ctx = createToolContext({ workspace: workspaceWithGuiTargets(), runCli, mutationPolicy: enabledMutationPolicy() });

    const result = await executeQuailbotPlanAndExecute(ctx, { steps: [step as never] });

    expect(result.ok).toBe(false);
    expect(result.primary_result).toMatchObject({ ok: false, stopped_reason: "step_failed" });
    const primary = result.primary_result as { steps: Array<Record<string, unknown>> };
    expect(primary.steps).toHaveLength(1);
    expect(primary.steps[0]).toMatchObject({ kind: step.kind, primary_result: { error_type: errorType } });
    expect(runCli).not.toHaveBeenCalled();
  });

  it("aggregates observe step image content into the plan tool result", async () => {
    const workspace = workspaceWithGuiTargets();
    const ctx = createToolContext({
      workspace,
      runCli: vi.fn<RunCli>(),
      mutationPolicy: enabledMutationPolicy(),
      roiCaptureBackend: async ({ rois }) =>
        rois.map((roi) => ({
          ref: roi.ref,
          ...(roi.name === undefined ? {} : { name: roi.name }),
          rect: roi.schema as { x: number; y: number; w: number; h: number },
          imagePath: "C:\\tmp\\status-roi.png",
          mimeType: "image/png" as const,
          width: 1,
          height: 1,
          captureId: "capture-test",
          data: "iVBORw0KGgo=",
        })),
    });

    const result = await executeQuailbotPlanAndExecute(ctx, { steps: [{ kind: "observe", rois: ["status_roi"] }] });

    expect(result.ok).toBe(true);
    expect(result.model_content).toEqual([{ type: "image", data: "iVBORw0KGgo=", mimeType: "image/png" }]);
    expect(result.primary_result).toMatchObject({
      steps: [
        {
          kind: "observe",
          primary_result: {
            channels: { roi: { results: { "roi:status": { attached_image: true } } } },
          },
        },
      ],
    });
  });

  it("does not call GUI executors during preflight before validation completes", async () => {
    const executeClickAnchor = vi.fn().mockResolvedValue({
      ok: false,
      action: "click_anchor",
      action_input: { anchor: "active_anchor" },
      primary_result: { error_type: "mock_gui_backend" },
    });
    const validateClickAnchorInput = vi.fn().mockReturnValue({
      ref: "anchor:active",
      name: "active_anchor",
      active: true,
      linkedObservables: [],
      linkedRois: [],
      schema: {},
    });

    vi.resetModules();
    vi.doMock("../../src/tools/click_anchor.js", () => ({ executeClickAnchor, validateClickAnchorInput }));

    try {
      const { executeQuailbotPlanAndExecute: executePlan } = await import(
        "../../src/tools/quailbot_plan_and_execute.js"
      );
      const runCli = vi.fn<RunCli>();

      const result = await executePlan(createToolContext({ workspace: workspaceWithGuiTargets(), runCli, mutationPolicy: enabledMutationPolicy() }), {
        steps: [{ kind: "click_anchor", anchor: "active_anchor" }, { kind: "not_supported" }] as never,
      });

      expect(result.ok).toBe(false);
      expect(result.primary_result).toMatchObject({
        ok: false,
        stopped_reason: "validation_failed",
        validation_error: expect.stringContaining("unsupported step"),
        steps: [],
      });
      expect(executeClickAnchor).not.toHaveBeenCalled();
      expect(validateClickAnchorInput).toHaveBeenCalledWith(expect.any(Object), { kind: "click_anchor", anchor: "active_anchor" });
      expect(runCli).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock("../../src/tools/click_anchor.js");
      vi.resetModules();
    }
  });

  it("registers the tool and returns the projected result envelope", async () => {
    const tools: Array<{
      name: string;
      label: string;
      description: string;
      parameters: { properties?: Record<string, unknown> };
      execute: (id: string, params: unknown) => Promise<unknown>;
      renderCall?: unknown;
      renderResult?: unknown;
    }> = [];
    const pi = {
      registerTool: (tool: {
        name: string;
        label: string;
        description: string;
        parameters: { properties?: Record<string, unknown> };
        execute: (id: string, params: unknown) => Promise<unknown>;
        renderCall?: unknown;
        renderResult?: unknown;
      }) => tools.push(tool),
    };

    registerQuailbotTools(pi as never, { workspace: fixtureWorkspace() } as never);

    const tool = tools.find((tool) => tool.name === "quailbot_plan_and_execute");
    expect(tool).toBeDefined();
    expect(tool?.label).toBe("Quailbot Plan And Execute");
    expect(tool?.description).toBe(
      "Execute a concrete serial Quailbot program and return one final result with per-step readbacks.",
    );
    expect(typeof tool?.renderResult).toBe("function");
    expect(typeof tool?.renderCall).toBe("function");
    expect(tool?.parameters.properties?.steps).toMatchObject({ type: "array", minItems: 1 });
    const schemaText = JSON.stringify(tool?.parameters.properties?.steps);
    for (const kind of [
      "cli_get",
      "cli_set",
      "cli_ramp",
      "cli_action",
      "click_anchor",
      "set_field",
      "observe",
    ]) {
      expect(schemaText).toContain(kind);
    }
    expect(schemaText).not.toContain("additionalProperties");

    const result = await tool?.execute("tool-call", { steps: [{ kind: "observe" }] });

    expect(result).toMatchObject({
      details: {
        ok: true,
        action: "quailbot_plan_and_execute",
        primary_result: { ok: true, stopped_reason: "completed" },
      },
      content: [{ type: "text" }],
    });
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    expect(text).toContain("quailbot_plan_and_execute plan [ok, aggregate_result]");
    expect(text).toContain("stopped_reason: completed");
    expect(text).not.toContain('"action_input"');
    expect((result as { details: { action: string } }).details.action).toBe("quailbot_plan_and_execute");
  });
});

function fixtureWorkspace(): Workspace {
  return loadWorkspace(join(process.cwd(), "tests/workspaces/nanonis-minimal.workspace.json"));
}

function workspaceWithGuiTargets(): Workspace {
  const workspace = fixtureWorkspace();
  workspace.rois.push({
    ref: "roi:status",
    name: "status_roi",
    active: true,
    linkedObservables: [],
    schema: { x: 0, y: 0, w: 1, h: 1 },
  });
  workspace.anchors.push({
    ref: "anchor:active",
    name: "active_anchor",
    active: true,
    linkedObservables: [],
    linkedRois: [],
    schema: {},
  });
  return workspace;
}
