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
import { sleepSecondsParameters } from "../../src/tools/register-tools.js";
import { executeSleepSeconds } from "../../src/tools/sleep_seconds.js";

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

  it("executeCliSet rejects an unknown parameter before driver execution", async () => {
    const runCli = vi.fn<RunCli>();
    const ctx = createToolContext({ workspace: fixtureWorkspace(), runCli });

    await expect(executeCliSet(ctx, { cli_name: "nqctl", parameter: "missing", value: 1 })).rejects.toThrow(
      /unknown CLI parameter: nqctl:missing/,
    );
    expect(runCli).not.toHaveBeenCalled();
  });

  it("executeCliSet requires exactly one input mode before driver execution", async () => {
    const runCli = vi.fn<RunCli>();
    const ctx = createToolContext({ workspace: fixtureWorkspace(), runCli });

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
    const runCli = vi.fn<RunCli>().mockResolvedValue({
      ok: true,
      exitCode: 0,
      stdout: "",
      stderr: "",
      payload: undefined,
      argv: ["nqctl", "set", "zctrl_setpnt", "--arg", "setpoint=1.5"],
    });
    const ctx = createToolContext({ workspace: fixtureWorkspace(), runCli });

    await expect(
      executeCliSet(ctx, { cli_name: "nqctl", parameter: "zctrl_setpnt", args: { other: 1.5 } }),
    ).rejects.toThrow(/unknown args for CLI parameter nqctl:zctrl_setpnt: other/);
    await expect(executeCliSet(ctx, { cli_name: "nqctl", parameter: "zctrl_setpnt", args: {} })).rejects.toThrow(
      /cli_set requires exactly one input mode/,
    );

    const result = await executeCliSet(ctx, { cli_name: "nqctl", parameter: "zctrl_setpnt", value: 1.5 });

    expect(runCli).toHaveBeenCalledTimes(1);
    expect(runCli).toHaveBeenCalledWith("nqctl", ["set", "zctrl_setpnt", "--arg", "setpoint=1.5"], {
      timeoutMs: undefined,
    });
    expect(result.primary_result).toMatchObject({ parameter: "zctrl_setpnt", value: 1.5, ok: true });
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
    const ctx = createToolContext({ workspace, runCli });

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
    const ctx = createToolContext({ workspace, runCli });

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
      executeCliSet(createToolContext({ workspace: disabledWorkspace, runCli }), {
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
      executeCliSet(createToolContext({ workspace: disabledParamWorkspace, runCli }), {
        cli_name: "nqctl",
        parameter: "zctrl_setpnt",
        value: 1,
      }),
    ).rejects.toThrow(/CLI parameter is disabled: nqctl:zctrl_setpnt/);
    expect(runCli).not.toHaveBeenCalled();
  });

  it("executeCliRamp dispatches ramp arguments as strings for a ramp-enabled workspace parameter", async () => {
    const runCli = vi.fn<RunCli>().mockResolvedValue({
      ok: true,
      exitCode: 0,
      stdout: "",
      stderr: "",
      payload: undefined,
      argv: ["nqctl", "ramp", "bias", "0", "1", "0.25", "--interval-s", "0.5"],
    });
    const workspace = fixtureWorkspace();
    workspace.cli.parameters.set("nqctl:bias", rampParameter("nqctl", "bias"));
    const ctx = createToolContext({ workspace, runCli });

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
    expect(result.primary_result).toMatchObject({
      parameter: "bias",
      start: 0,
      end: 1,
      step: 0.25,
      interval_s: 0.5,
      ok: true,
    });
  });

  it("executeCliRamp rejects a parameter whose ramp action is not allowed before driver execution", async () => {
    const runCli = vi.fn<RunCli>();
    const ctx = createToolContext({ workspace: fixtureWorkspace(), runCli });

    await expect(
      executeCliRamp(ctx, { cli_name: "nqctl", parameter: "zctrl_setpnt", start: 0, end: 1, step: 0.1, interval_s: 1 }),
    ).rejects.toThrow(/CLI parameter does not allow ramp: nqctl:zctrl_setpnt/);
    expect(runCli).not.toHaveBeenCalled();
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
    const ctx = createToolContext({ workspace, runCli });

    const result = await executeCliAction(ctx, {
      cli_name: "nqctl",
      action_name: "Scan_Action",
      args: { action: "start" },
    });

    expect(runCli).toHaveBeenCalledWith("nqctl", ["act", "Scan_Action", "--arg", "action=start"], {
      timeoutMs: undefined,
    });
    expect(result.primary_result).toMatchObject({ action_name: "Scan_Action", args: { action: "start" }, ok: true });

    await expect(executeCliAction(ctx, { cli_name: "nqctl", action_name: "Danger" })).rejects.toThrow(
      /CLI action is blocked: nqctl:Danger/,
    );
    expect(runCli).toHaveBeenCalledTimes(1);
  });

  it("executeCliAction enforces required and known declared arg fields before driver execution", async () => {
    const runCli = vi.fn<RunCli>();
    const ctx = createToolContext({ workspace: fixtureWorkspace(), runCli });

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

describe("sleep_seconds", () => {
  it("accepts zero seconds and rejects negative seconds", async () => {
    await expect(executeSleepSeconds({ seconds: 0 })).resolves.toMatchObject({
      ok: true,
      action: "sleep_seconds",
      primary_result: { slept_seconds: 0 },
    });

    await expect(executeSleepSeconds({ seconds: -1 })).rejects.toThrow(
      /sleep_seconds requires a finite non-negative seconds value/,
    );
  });

  it("declares sleep seconds as non-negative in the registered schema", () => {
    const schema = sleepSecondsParameters as unknown as {
      properties: { seconds: { minimum?: number; exclusiveMinimum?: number } };
    };

    expect(schema.properties.seconds.minimum).toBe(0);
    expect(schema.properties.seconds.exclusiveMinimum).toBeUndefined();
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
