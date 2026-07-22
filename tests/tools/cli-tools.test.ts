import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { CliAction, CliParameter, Workspace } from "../../src/workspace/types.js";
import { loadWorkspace } from "../../src/workspace/load-workspace.js";
import { runCli, type RunCli } from "../../src/cli/cli-driver.js";
import { createToolContext } from "../../src/tools/tool-context.js";
import { executeCliAction } from "../../src/tools/cli_action.js";
import { executeCliGet } from "../../src/tools/cli_get.js";
import { executeCliRamp } from "../../src/tools/cli_ramp.js";
import { executeCliSet } from "../../src/tools/cli_set.js";
import { disabledMutationPolicy, enabledMutationPolicy, mutationPolicyDisabledResult } from "../../src/tools/mutation-policy.js";
import { registerQuailbotTools } from "../../src/tools/register-tools.js";

describe("CLI-backed tools", () => {
  it("executeCliGet validates the workspace target and dispatches through the generic driver", async () => {
    const runCli = vi.fn<RunCli>().mockResolvedValue({
      ok: true,
      exitCode: 0,
      stdout: '{"current":1.2}',
      stderr: "",
      payload: { current: 1.2 },
      argv: ["nqctl", "get", "current"],
    });
    const ctx = createToolContext({ workspace: fixtureWorkspace(), runCli });

    const result = await executeCliGet(ctx, { cli_name: "nqctl", parameter: "current" });

    expect(runCli).toHaveBeenCalledWith("nqctl", ["get", "current"], { timeoutMs: undefined });
    expect(result).toMatchObject({
      ok: true,
      action: "cli_get",
      action_input: { cli_name: "nqctl", parameter: "current" },
      primary_result: {
        parameter: "current",
        ok: true,
        exit_code: 0,
        stdout: '{"current":1.2}',
        stderr: "",
        payload: { current: 1.2 },
        argv: ["nqctl", "get", "current"],
      },
    });
  });

  it("executeCliGet preserves driver error metadata", async () => {
    const runCli = vi.fn<RunCli>().mockResolvedValue({
      ok: false,
      exitCode: -1,
      stdout: "",
      stderr: "process timed out after 25ms",
      payload: undefined,
      argv: ["nqctl", "get", "current"],
      error_type: "timeout",
      error_message: "process timed out after 25ms",
    });
    const ctx = createToolContext({ workspace: fixtureWorkspace(), runCli });

    const result = await executeCliGet(ctx, { cli_name: "nqctl", parameter: "current" });

    expect(result.primary_result).toMatchObject({
      error_type: "timeout",
      error_message: "process timed out after 25ms",
    });
  });

  it("executeCliSet rejects an unknown parameter before driver execution", async () => {
    const runCli = vi.fn<RunCli>();
    const ctx = createToolContext({ workspace: fixtureWorkspace(), runCli, mutationPolicy: enabledMutationPolicy() });

    await expect(executeCliSet(ctx, { cli_name: "nqctl", parameter: "missing", value: 1 })).rejects.toThrow(
      /unknown CLI parameter: nqctl:missing/,
    );
    expect(runCli).not.toHaveBeenCalled();
  });

  it("executeCliSet requires exactly one input mode before driver execution", async () => {
    const runCli = vi.fn<RunCli>();
    const ctx = createToolContext({ workspace: fixtureWorkspace(), runCli, mutationPolicy: enabledMutationPolicy() });

    await expect(
      executeCliSet(ctx, { cli_name: "nqctl", parameter: "zctrl_setpnt", value: 1, args: { setpoint: 1 } }),
    ).rejects.toThrow(/cli_set requires exactly one input mode/);
    await expect(executeCliSet(ctx, { cli_name: "nqctl", parameter: "zctrl_setpnt", args: {} })).rejects.toThrow(
      /cli_set requires exactly one input mode/,
    );
    await expect(executeCliSet(ctx, { cli_name: "nqctl", parameter: "zctrl_setpnt" })).rejects.toThrow(
      /cli_set requires exactly one input mode/,
    );
    expect(runCli).not.toHaveBeenCalled();
  });

  it("executeCliSet enforces declared set arg fields and maps value mode to the single field", async () => {
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
      });
    const ctx = createToolContext({ workspace: fixtureWorkspace(), runCli, mutationPolicy: enabledMutationPolicy() });

    await expect(
      executeCliSet(ctx, { cli_name: "nqctl", parameter: "zctrl_setpnt", args: { other: 1.5 } }),
    ).rejects.toThrow(/unknown args for CLI parameter nqctl:zctrl_setpnt: other/);
    await expect(executeCliSet(ctx, { cli_name: "nqctl", parameter: "zctrl_setpnt", args: {} })).rejects.toThrow(
      /cli_set requires exactly one input mode/,
    );

    const result = await executeCliSet(ctx, { cli_name: "nqctl", parameter: "zctrl_setpnt", value: 1.5 });

    expect(runCli).toHaveBeenCalledTimes(3);
    expect(runCli).toHaveBeenCalledWith("nqctl", ["set", "zctrl_setpnt", "--arg", "setpoint=1.5"], {
      timeoutMs: undefined,
    });
    expect(runCli).toHaveBeenCalledWith("nqctl", ["get", "zctrl_setpnt"]);
    expect(runCli).toHaveBeenCalledWith("nqctl", ["get", "current"]);
    expect(result.primary_result).toMatchObject({ parameter: "zctrl_setpnt", value: 1.5, ok: true });
    expect(result.linked_observation).toMatchObject({
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
  });

  it("executeCliSet preserves explicit linked observables from the tool input", async () => {
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
        stdout: '{"aux":9}',
        stderr: "",
        payload: { aux: 9 },
        argv: ["nqctl", "get", "aux"],
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
      });
    const workspace = fixtureWorkspace();
    workspace.cli.parameters.set("nqctl:aux", readableParameter("nqctl", "aux"));
    const ctx = createToolContext({ workspace, runCli, mutationPolicy: enabledMutationPolicy() });

    const result = await executeCliSet(ctx, {
      cli_name: "nqctl",
      parameter: "zctrl_setpnt",
      value: 1.5,
      linked_observables: ["aux"],
    });

    expect(result.linked_observation).toMatchObject({
      channels: {
        cli: {
          observables: ["nqctl:aux", "nqctl:zctrl_setpnt", "nqctl:current"],
          results: {
            "nqctl:aux": { ok: true, payload: { aux: 9 } },
            "nqctl:zctrl_setpnt": { ok: true, payload: { setpoint: 1.5 } },
            "nqctl:current": { ok: true, payload: { current: 1.2 } },
          },
        },
      },
      unresolved: [],
    });
  });

  it("executeCliSet keeps positional value mode when no arg fields are declared", async () => {
    const runCli = vi.fn<RunCli>().mockResolvedValue({
      ok: true,
      exitCode: 0,
      stdout: "",
      stderr: "",
      payload: undefined,
      argv: ["nqctl", "set", "legacy", "7"],
    });
    const workspace = fixtureWorkspace();
    workspace.cli.parameters.set("nqctl:legacy", writableParameter("nqctl", "legacy", { set_cmd: { command: "LegacySet" } }));
    const ctx = createToolContext({ workspace, runCli, mutationPolicy: enabledMutationPolicy() });

    await executeCliSet(ctx, { cli_name: "nqctl", parameter: "legacy", value: 7 });

    expect(runCli).toHaveBeenCalledWith("nqctl", ["set", "legacy", "7"], { timeoutMs: undefined });
  });

  it("executeCliSet rejects required and unknown args declared by arg_fields", async () => {
    const runCli = vi.fn<RunCli>();
    const workspace = fixtureWorkspace();
    workspace.cli.parameters.set(
      "nqctl:window",
      writableParameter("nqctl", "window", {
        set_cmd: {
          command: "WindowSet",
          arg_fields: [
            { name: "start", required: true },
            { name: "end", required: true },
          ],
        },
      }),
    );
    const ctx = createToolContext({ workspace, runCli, mutationPolicy: enabledMutationPolicy() });

    await expect(executeCliSet(ctx, { cli_name: "nqctl", parameter: "window", args: { start: 0 } })).rejects.toThrow(
      /missing required args for CLI parameter nqctl:window: end/,
    );
    await expect(
      executeCliSet(ctx, { cli_name: "nqctl", parameter: "window", args: { start: 0, end: 1, extra: 2 } }),
    ).rejects.toThrow(/unknown args for CLI parameter nqctl:window: extra/);
    await expect(executeCliSet(ctx, { cli_name: "nqctl", parameter: "window", value: 1 })).rejects.toThrow(
      /value mode requires zero or one declared arg field for CLI parameter nqctl:window/,
    );
    expect(runCli).not.toHaveBeenCalled();
  });

  it("executeCliSet rejects disabled CLI surfaces before driver execution", async () => {
    const runCli = vi.fn<RunCli>();
    const disabledWorkspace = fixtureWorkspace();
    disabledWorkspace.cli.enabled = false;

    await expect(
      executeCliSet(createToolContext({ workspace: disabledWorkspace, runCli, mutationPolicy: enabledMutationPolicy() }), {
        cli_name: "nqctl",
        parameter: "zctrl_setpnt",
        value: 1,
      }),
    ).rejects.toThrow(/workspace CLI is not enabled/);

    const disabledParamWorkspace = fixtureWorkspace();
    const parameter = disabledParamWorkspace.cli.parameters.get("nqctl:zctrl_setpnt");
    if (!parameter) {
      throw new Error("test fixture missing zctrl_setpnt");
    }
    parameter.enabled = false;

    await expect(
      executeCliSet(createToolContext({ workspace: disabledParamWorkspace, runCli, mutationPolicy: enabledMutationPolicy() }), {
        cli_name: "nqctl",
        parameter: "zctrl_setpnt",
        value: 1,
      }),
    ).rejects.toThrow(/CLI parameter is disabled: nqctl:zctrl_setpnt/);
    expect(runCli).not.toHaveBeenCalled();
  });

  it("executeCliSet enforces numeric safety ranges for value and single-field args modes before driver execution", async () => {
    const runCli = vi.fn<RunCli>().mockResolvedValue({
      ok: true,
      exitCode: 0,
      stdout: "",
      stderr: "",
      payload: undefined,
      argv: ["nqctl", "set", "limited_bias"],
    });
    const workspace = fixtureWorkspace();
    workspace.cli.parameters.set(
      "nqctl:limited_bias",
      writableParameter("nqctl", "limited_bias", {
        set_cmd: { arg_fields: [{ name: "setpoint", required: true }] },
        safety: { min_value: "-5", max_value: "5" },
      }),
    );
    const ctx = createToolContext({ workspace, runCli, mutationPolicy: enabledMutationPolicy() });

    await executeCliSet(ctx, { cli_name: "nqctl", parameter: "limited_bias", value: 4 });
    await executeCliSet(ctx, { cli_name: "nqctl", parameter: "limited_bias", args: { setpoint: 3 } });
    const callsAfterCompliantSets = runCli.mock.calls.length;
    await expect(executeCliSet(ctx, { cli_name: "nqctl", parameter: "limited_bias", value: 6 })).rejects.toThrow(
      /cli_set rejected: value 6 exceeds max_value 5 for nqctl:limited_bias \(safety gate\)/,
    );
    await expect(
      executeCliSet(ctx, { cli_name: "nqctl", parameter: "limited_bias", args: { setpoint: -6 } }),
    ).rejects.toThrow(/cli_set rejected: value -6 is below min_value -5 for nqctl:limited_bias \(safety gate\)/);

    expect(runCli).toHaveBeenCalledTimes(callsAfterCompliantSets);
  });

  it("executeCliSet leaves parameters without a safety block unchanged", async () => {
    const runCli = vi.fn<RunCli>().mockResolvedValue({
      ok: true,
      exitCode: 0,
      stdout: "",
      stderr: "",
      payload: undefined,
      argv: ["nqctl", "set", "unlimited_bias", "999999"],
    });
    const workspace = fixtureWorkspace();
    workspace.cli.parameters.set("nqctl:unlimited_bias", writableParameter("nqctl", "unlimited_bias", {}));
    const ctx = createToolContext({ workspace, runCli, mutationPolicy: enabledMutationPolicy() });

    await executeCliSet(ctx, { cli_name: "nqctl", parameter: "unlimited_bias", value: 999999 });

    expect(runCli).toHaveBeenCalledWith("nqctl", ["set", "unlimited_bias", "999999"], { timeoutMs: undefined });
  });

  it("executeCliRamp dispatches ramp arguments as strings for a ramp-enabled workspace parameter", async () => {
    const runCli = vi
      .fn<RunCli>()
      .mockResolvedValueOnce({
      ok: true,
      exitCode: 0,
      stdout: "",
      stderr: "",
      payload: undefined,
      argv: ["nqctl", "ramp", "bias", "0", "1", "0.25", "--interval-s", "0.5"],
    })
      .mockResolvedValueOnce({
        ok: true,
        exitCode: 0,
        stdout: '{"bias":1}',
        stderr: "",
        payload: { bias: 1 },
        argv: ["nqctl", "get", "bias"],
      });
    const workspace = fixtureWorkspace();
    workspace.cli.parameters.set("nqctl:bias", rampParameter("nqctl", "bias"));
    const ctx = createToolContext({ workspace, runCli, mutationPolicy: enabledMutationPolicy() });

    const result = await executeCliRamp(ctx, {
      cli_name: "nqctl",
      parameter: "bias",
      start: 0,
      end: 1,
      step: 0.25,
      interval_s: 0.5,
    });

    expect(runCli).toHaveBeenCalledWith("nqctl", ["ramp", "bias", "0", "1", "0.25", "--interval-s", "0.5"], {
      timeoutMs: undefined,
    });
    expect(runCli).toHaveBeenCalledWith("nqctl", ["get", "bias"]);
    expect(result.primary_result).toMatchObject({
      parameter: "bias",
      start: 0,
      end: 1,
      step: 0.25,
      interval_s: 0.5,
      ok: true,
    });
    expect(result.linked_observation).toMatchObject({
      channels: { cli: { observables: ["nqctl:bias"], results: { "nqctl:bias": { ok: true, payload: { bias: 1 } } } } },
      unresolved: [],
    });
  });

  it("executeCliRamp rejects a parameter whose ramp action is not allowed before driver execution", async () => {
    const runCli = vi.fn<RunCli>();
    const ctx = createToolContext({ workspace: fixtureWorkspace(), runCli, mutationPolicy: enabledMutationPolicy() });

    await expect(
      executeCliRamp(ctx, { cli_name: "nqctl", parameter: "zctrl_setpnt", start: 0, end: 1, step: 0.1, interval_s: 1 }),
    ).rejects.toThrow(/CLI parameter does not allow ramp: nqctl:zctrl_setpnt/);
    expect(runCli).not.toHaveBeenCalled();
  });

  it("executeCliRamp enforces range, step, interval, and slew safety limits before driver execution", async () => {
    const runCli = vi.fn<RunCli>().mockResolvedValue({
      ok: true,
      exitCode: 0,
      stdout: "",
      stderr: "",
      payload: undefined,
      argv: ["nqctl", "ramp", "limited_bias", "-1", "1", "0.25", "--interval-s", "0.5"],
    });
    const workspace = fixtureWorkspace();
    workspace.cli.parameters.set(
      "nqctl:limited_bias",
      writableParameter("nqctl", "limited_bias", {
        safety: { min_value: "-5", max_value: "5", max_step: "0.5", max_slew_per_s: "1" },
      }),
    );
    const ctx = createToolContext({ workspace, runCli, mutationPolicy: enabledMutationPolicy() });
    const compliant = { cli_name: "nqctl", parameter: "limited_bias", start: -1, end: 1, step: 0.25, interval_s: 0.5 };

    await executeCliRamp(ctx, compliant);
    const callsAfterCompliantRamp = runCli.mock.calls.length;
    await expect(executeCliRamp(ctx, { ...compliant, start: -6 })).rejects.toThrow(
      /cli_ramp rejected: start -6 is below min_value -5 for nqctl:limited_bias \(safety gate\)/,
    );
    await expect(executeCliRamp(ctx, { ...compliant, end: 6 })).rejects.toThrow(
      /cli_ramp rejected: end 6 exceeds max_value 5 for nqctl:limited_bias \(safety gate\)/,
    );
    await expect(executeCliRamp(ctx, { ...compliant, step: 0.6 })).rejects.toThrow(
      /cli_ramp rejected: \|step\| 0.6 exceeds max_step 0.5 for nqctl:limited_bias \(safety gate\)/,
    );
    await expect(executeCliRamp(ctx, { ...compliant, interval_s: 0 })).rejects.toThrow(
      /cli_ramp rejected: interval_s 0 must be > 0 for nqctl:limited_bias \(safety gate\)/,
    );
    await expect(executeCliRamp(ctx, { ...compliant, step: 0.5, interval_s: 0.1 })).rejects.toThrow(
      /cli_ramp rejected: slew rate 5 exceeds max_slew_per_s 1 for nqctl:limited_bias \(safety gate\)/,
    );

    expect(runCli).toHaveBeenCalledTimes(callsAfterCompliantRamp);
  });

  it("executeCliAction dispatches action arguments and blocks explicitly blocked actions", async () => {
    const runCli = vi.fn<RunCli>().mockResolvedValue({
      ok: true,
      exitCode: 0,
      stdout: "started",
      stderr: "",
      payload: undefined,
      argv: ["nqctl", "act", "Scan_Action", "--arg", "action=start"],
    });
    const workspace = fixtureWorkspace();
    workspace.cli.actions.set("nqctl:Danger", blockedAction("nqctl", "Danger"));
    const ctx = createToolContext({ workspace, runCli, mutationPolicy: enabledMutationPolicy() });

    const result = await executeCliAction(ctx, {
      cli_name: "nqctl",
      action_name: "Scan_Action",
      args: { action: "start" },
    });

    expect(runCli).toHaveBeenCalledWith("nqctl", ["act", "Scan_Action", "--arg", "action=start"], {
      timeoutMs: undefined,
    });
    expect(result.primary_result).toMatchObject({ action_name: "Scan_Action", args: { action: "start" }, ok: true });
    expect(result.linked_observation).toMatchObject({
      channels: { cli: { observables: [], results: {} }, roi: { rois: [], results: {}, unavailable: [] } },
      unresolved: ["scan_status", "scan_buffer", "scan_speed"],
    });

    await expect(executeCliAction(ctx, { cli_name: "nqctl", action_name: "Danger" })).rejects.toThrow(
      /CLI action is blocked: nqctl:Danger/,
    );
    expect(runCli).toHaveBeenCalledTimes(1);
  });

  it("executeCliAction preserves explicit linked observables from the tool input", async () => {
    const runCli = vi
      .fn<RunCli>()
      .mockResolvedValueOnce({
        ok: true,
        exitCode: 0,
        stdout: "started",
        stderr: "",
        payload: undefined,
        argv: ["nqctl", "act", "Scan_Action", "--arg", "action=start"],
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

    const result = await executeCliAction(ctx, {
      cli_name: "nqctl",
      action_name: "Scan_Action",
      args: { action: "start" },
      linked_observables: ["current"],
    });

    expect(result.linked_observation).toMatchObject({
      channels: { cli: { observables: ["nqctl:current"], results: { "nqctl:current": { ok: true, payload: { current: 1.2 } } } } },
      unresolved: ["scan_status", "scan_buffer", "scan_speed"],
    });
  });

  it("executeCliAction enforces required and known declared arg fields before driver execution", async () => {
    const runCli = vi.fn<RunCli>();
    const ctx = createToolContext({ workspace: fixtureWorkspace(), runCli, mutationPolicy: enabledMutationPolicy() });

    await expect(executeCliAction(ctx, { cli_name: "nqctl", action_name: "Scan_Action" })).rejects.toThrow(
      /missing required args for CLI action nqctl:Scan_Action: action/,
    );
    await expect(
      executeCliAction(ctx, { cli_name: "nqctl", action_name: "Scan_Action", args: { action: "start", extra: true } }),
    ).rejects.toThrow(/unknown args for CLI action nqctl:Scan_Action: extra/);
    expect(runCli).not.toHaveBeenCalled();
  });
});

describe("runCli", () => {
  it("captures JSON payloads and non-zero exits", async () => {
    const ok = await runCli(process.execPath, ["-e", "console.log(JSON.stringify({value: 42}))"], { timeoutMs: 1000 });
    const failed = await runCli(process.execPath, ["-e", "console.error('bad'); process.exit(7)"], { timeoutMs: 1000 });

    expect(ok).toMatchObject({ ok: true, exitCode: 0, payload: { value: 42 } });
    expect(failed).toMatchObject({ ok: false, exitCode: 7, stderr: "bad\n" });
  });

  it("rejects invalid timeouts before spawning", async () => {
    await expect(runCli(process.execPath, ["-e", "console.log('never')"], { timeoutMs: 0 })).rejects.toThrow(
      /timeoutMs must be a finite positive number/,
    );
    await expect(runCli(process.execPath, ["-e", "console.log('never')"], { timeoutMs: Number.NaN })).rejects.toThrow(
      /timeoutMs must be a finite positive number/,
    );
  });

  it("resolves with a timeout result without waiting for normal process completion", async () => {
    const startedAt = Date.now();
    const result = await runCli(process.execPath, ["-e", "setTimeout(() => {}, 5000)"], { timeoutMs: 25 });

    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(result).toMatchObject({ ok: false, exitCode: -1, error_type: "timeout" });
    expect(result.stderr).toContain("process timed out after 25ms");
  });
});

describe("registered CLI tool schemas", () => {
  it("accept explicit linked observables on mutating CLI tools", () => {
    const tools: Array<{ name: string; parameters: { properties?: Record<string, unknown> } }> = [];
    const pi = { registerTool: (tool: { name: string; parameters: { properties?: Record<string, unknown> } }) => tools.push(tool) };

    registerQuailbotTools(pi as never, { workspace: fixtureWorkspace() } as never);

    for (const name of ["cli_set", "cli_ramp", "cli_action"]) {
      const tool = tools.find((item) => item.name === name);
      expect(tool?.parameters.properties).toHaveProperty("linked_observables");
    }
  });

  it("registers compact renderers for CLI tools", () => {
    const tools: Array<{
      name: string;
      renderCall?: (args: unknown, theme: unknown, context: unknown) => { render: (width: number) => string[] };
      renderResult?: (
        result: { content: Array<{ type: "text"; text: string }>; details: unknown },
        options: { expanded: boolean; isPartial: boolean },
        theme: unknown,
        context: unknown,
      ) => { render: (width: number) => string[] };
      parameters: { properties?: Record<string, unknown> };
    }> = [];
    const pi = {
      registerTool: (tool: {
        name: string;
        renderCall?: (args: unknown, theme: unknown, context: unknown) => { render: (width: number) => string[] };
        renderResult?: (
          result: { content: Array<{ type: "text"; text: string }>; details: unknown },
          options: { expanded: boolean; isPartial: boolean },
          theme: unknown,
          context: unknown,
        ) => { render: (width: number) => string[] };
        parameters: { properties?: Record<string, unknown> };
      }) => tools.push(tool),
    };

    registerQuailbotTools(pi as never, { workspace: fixtureWorkspace() } as never);

    for (const { name, input, expected } of [
      { name: "cli_get", input: { cli_name: "nqctl", parameter: "bias_v" }, expected: "cli_get nqctl:bias_v" },
      { name: "cli_set", input: { cli_name: "nqctl", parameter: "bias_v", value: 0.18 }, expected: "cli_set nqctl:bias_v value=0.18" },
      {
        name: "cli_ramp",
        input: { cli_name: "nqctl", parameter: "bias_v", start: 0, end: 1, step: 0.1, interval_s: 1 },
        expected: "cli_ramp nqctl:bias_v start=0 end=1 step=0.1 interval_s=1",
      },
      {
        name: "cli_action",
        input: { cli_name: "nqctl", action_name: "Scan_Action", args: { action: "start" } },
        expected: "cli_action nqctl:Scan_Action action=start",
      },
    ]) {
      const tool = tools.find((item) => item.name === name);
      expect(tool?.renderCall).toEqual(expect.any(Function));
      expect(tool?.renderResult).toEqual(expect.any(Function));
      const renderedCall = tool?.renderCall?.(input, {}, {}).render(120).join("\n");
      expect(renderedCall).toContain(expected);
      expect(renderedCall).not.toContain("{");
      expect(renderedCall).not.toContain("}");
    }

    const cliGet = tools.find((item) => item.name === "cli_get");
    const renderedResult = cliGet?.renderResult?.(
      {
        content: [{ type: "text", text: "fallback text should not render when details are present" }],
        details: {
          ok: true,
          action: "cli_get",
          action_input: { cli_name: "nqctl", parameter: "bias_v" },
          primary_result: {
            parameter: "bias_v",
            ok: true,
            exit_code: 0,
            stdout: "REGISTERED_RENDERER_RAW_STDOUT_SHOULD_NOT_APPEAR",
            stderr: "",
            payload: { parameter: "bias_v", value: 0.17, fields: { "Bias value": 0.17 } },
            argv: ["nqctl", "get", "bias_v"],
          },
        },
      },
      { expanded: false, isPartial: false },
      {},
      {},
    ).render(120).join("\n");
    expect(renderedResult).toContain("cli_get nqctl:bias_v [ok, parsed_payload]");
    expect(renderedResult).not.toContain("REGISTERED_RENDERER_RAW_STDOUT_SHOULD_NOT_APPEAR");
  });

  it("blocks cli_set, cli_ramp, and cli_action before validation or driver execution when mutation policy is disabled", async () => {
    const runCli = vi.fn<RunCli>();
    const ctx = createToolContext({ workspace: fixtureWorkspace(), runCli, mutationPolicy: disabledMutationPolicy() });

    await expect(executeCliSet(ctx, { cli_name: "nqctl", parameter: "missing", value: 1 })).resolves.toEqual(
      mutationPolicyDisabledResult("cli_set", { cli_name: "nqctl", parameter: "missing", value: 1 }),
    );
    await expect(
      executeCliRamp(ctx, {
        cli_name: "nqctl",
        parameter: "missing",
        start: 0,
        end: 1,
        step: 0.5,
        interval_s: 1,
      }),
    ).resolves.toEqual(
      mutationPolicyDisabledResult("cli_ramp", {
        cli_name: "nqctl",
        parameter: "missing",
        start: 0,
        end: 1,
        step: 0.5,
        interval_s: 1,
      }),
    );
    await expect(
      executeCliAction(ctx, { cli_name: "nqctl", action_name: "Missing_Action", args: { action: "start" } }),
    ).resolves.toEqual(
      mutationPolicyDisabledResult("cli_action", {
        cli_name: "nqctl",
        action_name: "Missing_Action",
        args: { action: "start" },
      }),
    );
    expect(runCli).not.toHaveBeenCalled();
  });
});

function fixtureWorkspace(): Workspace {
  return loadWorkspace(join(process.cwd(), "tests/workspaces/nanonis-minimal.workspace.json"));
}

function rampParameter(cliName: string, name: string): CliParameter {
  return writableParameter(cliName, name, {});
}

function writableParameter(cliName: string, name: string, schema: Record<string, unknown>): CliParameter {
  return {
    ref: `${cliName}:${name}`,
    cliName,
    name,
    enabled: true,
    actions: { get: true, set: true, ramp: true },
    linkedObservables: [],
    schema,
  };
}

function readableParameter(cliName: string, name: string): CliParameter {
  return {
    ref: `${cliName}:${name}`,
    cliName,
    name,
    enabled: true,
    actions: { get: true, set: false, ramp: false },
    linkedObservables: [],
    schema: {},
  };
}

function blockedAction(cliName: string, name: string): CliAction {
  return {
    ref: `${cliName}:${name}`,
    cliName,
    name,
    enabled: true,
    safetyMode: "blocked",
    actions: { get: false, set: false, ramp: false },
    linkedObservables: [],
    schema: {},
  };
}
