import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { RunCli } from "../../src/cli/cli-driver.js";
import { executeQuailbotPlanAndExecute } from "../../src/tools/quailbot_plan_and_execute.js";
import { registerQuailbotTools } from "../../src/tools/register-tools.js";
import { createToolContext } from "../../src/tools/tool-context.js";
import { loadWorkspace } from "../../src/workspace/load-workspace.js";
import type { Workspace } from "../../src/workspace/types.js";

describe("quailbot_plan_and_execute", () => {
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
    const ctx = createToolContext({ workspace: fixtureWorkspace(), runCli });

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
    const ctx = createToolContext({ workspace: fixtureWorkspace(), runCli: vi.fn<RunCli>() });

    await expect(executeQuailbotPlanAndExecute(ctx, { steps: [] })).rejects.toThrow(
      /quailbot_plan_and_execute requires at least one step/,
    );
  });

  it("registers the tool and returns the JSON result envelope", async () => {
    const tools: Array<{
      name: string;
      label: string;
      description: string;
      parameters: { properties?: Record<string, unknown> };
      execute: (id: string, params: unknown) => Promise<unknown>;
    }> = [];
    const pi = {
      registerTool: (tool: {
        name: string;
        label: string;
        description: string;
        parameters: { properties?: Record<string, unknown> };
        execute: (id: string, params: unknown) => Promise<unknown>;
      }) => tools.push(tool),
    };

    registerQuailbotTools(pi as never, { workspace: fixtureWorkspace() } as never);

    const tool = tools.find((tool) => tool.name === "quailbot_plan_and_execute");
    expect(tool).toBeDefined();
    expect(tool?.label).toBe("Quailbot Plan And Execute");
    expect(tool?.description).toBe(
      "Execute a concrete serial Quailbot program and return one final result with per-step readbacks.",
    );
    expect(tool?.parameters.properties?.steps).toMatchObject({ type: "array" });

    const result = await tool?.execute("tool-call", { steps: [{ kind: "sleep_seconds", seconds: 0 }] });

    expect(result).toMatchObject({
      details: {
        ok: true,
        action: "quailbot_plan_and_execute",
        primary_result: { ok: true, stopped_reason: "completed" },
      },
      content: [{ type: "text" }],
    });
    const text = (result as { content: Array<{ text: string }> }).content[0].text;
    expect(JSON.parse(text)).toMatchObject({ ok: true, action: "quailbot_plan_and_execute" });
  });
});

function fixtureWorkspace(): Workspace {
  return loadWorkspace(join(process.cwd(), "tests/workspaces/nanonis-minimal.workspace.json"));
}
