import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { readLinkedObservables, readLinkedObservablesWithContent } from "../../src/linked-observables/read-linked-observables.js";
import type { RunCli } from "../../src/cli/cli-driver.js";
import { createToolContext } from "../../src/tools/tool-context.js";
import { loadWorkspace } from "../../src/workspace/load-workspace.js";
import type { Workspace } from "../../src/workspace/types.js";

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
        roi: { rois: [], results: {}, unavailable: [], warnings: [] },
      },
      unresolved: [],
    });
  });

  it("records partial CLI failures without throwing and captures ROI readback when available", async () => {
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
    const workspace = loadWorkspace(join(process.cwd(), "tests/workspaces/nanonis-minimal.workspace.json"));
    workspace.rois.push({
      ref: "roi:scan-window",
      name: "scan_window",
      active: true,
      linkedObservables: [],
      schema: { x: 1, y: 2, w: 3, h: 4 },
    });
    const ctx = createToolContext({
      workspace,
      runCli,
      modelSupportsImages: true,
      roiCaptureBackend: async ({ rois }) =>
        rois.map((roi) => ({
          ref: roi.ref,
          ...(roi.name === undefined ? {} : { name: roi.name }),
          rect: roi.schema as { x: number; y: number; w: number; h: number },
          imagePath: "C:\\tmp\\scan-window.png",
          mimeType: "image/png" as const,
          width: 3,
          height: 4,
          captureId: "capture-test",
          data: "iVBORw0KGgo=",
        })),
    });

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
          ok: true,
          ref: "roi:scan-window",
          name: "scan_window",
          rect: { x: 1, y: 2, w: 3, h: 4 },
          image_path: "C:\\tmp\\scan-window.png",
          mime_type: "image/png",
          width: 3,
          height: 4,
          capture_id: "capture-test",
          model_can_read_image: true,
          attached_image: true,
        },
      },
      unavailable: [],
      warnings: [],
    });
    expect(observation.unresolved).toEqual(["missing_signal"]);
  });

  it("starts ROI capture without waiting for linked CLI get readbacks to finish", async () => {
    const events: string[] = [];
    let releaseCli: () => void = () => {};
    let markCliStarted: () => void = () => {};
    const cliStarted = new Promise<void>((resolve) => {
      markCliStarted = resolve;
    });
    const cliBlocker = new Promise<void>((resolve) => {
      releaseCli = resolve;
    });
    const runCli = vi.fn<RunCli>().mockImplementation(async () => {
      events.push("cli-started");
      markCliStarted();
      await cliBlocker;
      return {
        ok: true,
        exitCode: 0,
        stdout: '{"current":1.2}',
        stderr: "",
        payload: { current: 1.2 },
        argv: ["nqctl", "get", "current"],
      };
    });
    const workspace = loadWorkspace(join(process.cwd(), "tests/workspaces/nanonis-minimal.workspace.json"));
    addScanRoi(workspace);
    const ctx = createToolContext({
      workspace,
      runCli,
      modelSupportsImages: true,
      roiCaptureBackend: async ({ rois }) => {
        events.push("roi-started");
        return rois.map((roi) => ({
          ref: roi.ref,
          ...(roi.name === undefined ? {} : { name: roi.name }),
          rect: roi.schema as { x: number; y: number; w: number; h: number },
          imagePath: "C:\\tmp\\scan-window.png",
          mimeType: "image/png" as const,
          width: 3,
          height: 4,
          captureId: "capture-test",
          data: "iVBORw0KGgo=",
        }));
      },
    });

    const readback = readLinkedObservablesWithContent(ctx, {
      cli: ["nqctl:current"],
      roi: ["roi:scan-window"],
      unresolved: [],
    });
    await cliStarted;

    expect(events).toEqual(["roi-started", "cli-started"]);

    releaseCli();
    const result = await readback;
    expect(result.observation.channels.roi.results["roi:scan-window"]).toMatchObject({ ok: true });
    expect(result.observation.channels.cli.results["nqctl:current"]).toMatchObject({ ok: true });
  });

  it("marks ROI readback unavailable when no capture backend is configured", async () => {
    const workspace = loadWorkspace(join(process.cwd(), "tests/workspaces/nanonis-minimal.workspace.json"));
    addScanRoi(workspace);
    const ctx = createToolContext({ workspace, runCli: vi.fn<RunCli>() });

    const observation = await readLinkedObservables(ctx, { cli: [], roi: ["roi:scan-window"], unresolved: [] });

    expect(observation.channels.roi).toMatchObject({
      rois: ["roi:scan-window"],
      results: {
        "roi:scan-window": {
          ok: false,
          error_type: "roi_backend_unavailable",
          error_message: "ROI screenshot backend is not configured",
        },
      },
      unavailable: ["roi:scan-window"],
      warnings: [],
    });
  });
});

function addScanRoi(workspace: Workspace): void {
  workspace.rois.push({
    ref: "roi:scan-window",
    name: "scan_window",
    active: true,
    linkedObservables: [],
    schema: { x: 1, y: 2, w: 3, h: 4 },
  });
}
