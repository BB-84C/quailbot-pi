import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { CliAction, CliParameter, Workspace } from "../../src/workspace/types.js";
import { loadWorkspace } from "../../src/workspace/load-workspace.js";
import type { RunCli } from "../../src/cli/cli-driver.js";
import { createToolContext } from "../../src/tools/tool-context.js";
import { executeCliAction } from "../../src/tools/cli_action.js";
import { executeCliGet } from "../../src/tools/cli_get.js";
import { executeCliRamp } from "../../src/tools/cli_ramp.js";
import { executeCliSet } from "../../src/tools/cli_set.js";

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
});

function fixtureWorkspace(): Workspace {
  return loadWorkspace(join(process.cwd(), "tests/workspaces/nanonis-minimal.workspace.json"));
}

function rampParameter(cliName: string, name: string): CliParameter {
  return {
    ref: `${cliName}:${name}`,
    cliName,
    name,
    enabled: true,
    actions: { get: true, set: true, ramp: true },
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
