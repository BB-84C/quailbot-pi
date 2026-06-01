import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { readLinkedObservables } from "../../src/linked-observables/read-linked-observables.js";
import type { RunCli } from "../../src/cli/cli-driver.js";
import { createToolContext } from "../../src/tools/tool-context.js";
import { loadWorkspace } from "../../src/workspace/load-workspace.js";

describe("readLinkedObservables", () => {
  it("reads CLI observables through the generic driver and stores payloads by ref", async () => {
    const runCli = vi.fn<RunCli>().mockResolvedValue({
      ok: true,
      exitCode: 0,
      stdout: '{"current":1.2}',
      stderr: "",
      payload: { current: 1.2 },
      argv: ["nqctl", "get", "current"],
    });
    const ctx = createToolContext({ workspace: loadWorkspace(join(process.cwd(), "tests/workspaces/nanonis-minimal.workspace.json")), runCli });

    const observation = await readLinkedObservables(ctx, { cli: ["nqctl:current"], roi: [], unresolved: [] });

    expect(runCli).toHaveBeenCalledWith("nqctl", ["get", "current"]);
    expect(observation).toEqual({
      channels: {
        cli: {
          observables: ["nqctl:current"],
          results: {
            "nqctl:current": {
              ok: true,
              exit_code: 0,
              stdout: '{"current":1.2}',
              stderr: "",
              payload: { current: 1.2 },
              argv: ["nqctl", "get", "current"],
            },
          },
        },
        roi: { rois: [], results: {}, unavailable: [] },
      },
      unresolved: [],
    });
  });

  it("records partial CLI failures without throwing and marks ROI readback unavailable", async () => {
    const runCli = vi.fn<RunCli>().mockResolvedValue({
      ok: false,
      exitCode: 7,
      stdout: "",
      stderr: "read failed",
      payload: undefined,
      argv: ["nqctl", "get", "current"],
      error_type: "driver_error",
      error_message: "read failed",
    });
    const ctx = createToolContext({ workspace: loadWorkspace(join(process.cwd(), "tests/workspaces/nanonis-minimal.workspace.json")), runCli });

    const observation = await readLinkedObservables(ctx, {
      cli: ["nqctl:current"],
      roi: ["roi:scan-window"],
      unresolved: ["missing_signal"],
    });

    expect(observation.channels.cli.results["nqctl:current"]).toMatchObject({
      ok: false,
      exit_code: 7,
      stderr: "read failed",
      error_type: "driver_error",
      error_message: "read failed",
    });
    expect(observation.channels.roi).toEqual({
      rois: ["roi:scan-window"],
      results: {
        "roi:scan-window": {
          ok: false,
          error_type: "roi_backend_unavailable",
          error_message: "ROI linked-observable readback is not implemented in this round",
        },
      },
      unavailable: ["roi:scan-window"],
    });
    expect(observation.unresolved).toEqual(["missing_signal"]);
  });
});
