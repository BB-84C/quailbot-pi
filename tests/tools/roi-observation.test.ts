import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { quailbotStateRoot } from "../../src/workspace/workspace-state.js";
import type { Workspace, WorkspaceRoi } from "../../src/workspace/types.js";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));
vi.mock("../../src/workspace-ui/server/capture.js", () => ({
  captureVirtualScreenAsync: vi.fn(),
}));

import { createDefaultRoiCaptureBackend, observeRois } from "../../src/tools/roi-observation.js";
import { captureVirtualScreenAsync } from "../../src/workspace-ui/server/capture.js";

const execFileMock = vi.mocked(execFile);
const captureVirtualScreenAsyncMock = vi.mocked(captureVirtualScreenAsync);

describe("ROI observation", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "quailbot-roi-observation-"));
    execFileMock.mockReset();
    captureVirtualScreenAsyncMock.mockReset();
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it("passes multiple ROI crops to PowerShell without wrapping the JSON array as one object", async () => {
    const capturePath = join(cwd, "capture.png");
    writeFileSync(capturePath, Buffer.from("capture"));
    captureVirtualScreenAsyncMock.mockResolvedValue({
      pngPath: capturePath,
      frame: { imageWidth: 6240, imageHeight: 1080, originX: -4800, originY: 0, captureId: "capture-id" },
    });
    execFileMock.mockImplementation(((
      _file: string,
      args: readonly string[],
      options: { env?: NodeJS.ProcessEnv },
      callback?: (error: Error | null, stdout: Buffer, stderr: Buffer) => void,
    ) => {
      const argv = args as string[];
      const env = options.env;
      const script = Buffer.from(argv[5] ?? "", "base64").toString("utf16le");
      const crops = JSON.parse(Buffer.from(env?.QUAILBOT_ROI_CROPS_B64 ?? "", "base64").toString("utf8")) as Array<{
        outputPath: string;
        x: number;
        y: number;
        w: number;
        h: number;
      }>;

      expect(script).toContain("$ParsedCrops = $CropsJson | ConvertFrom-Json");
      expect(script).toContain("$ParsedCrops -is [System.Array]");
      expect(script).not.toContain("$Crops = @($CropsJson | ConvertFrom-Json)");
      expect(crops).toEqual([
        expect.objectContaining({ x: 3864, y: 294, w: 896, h: 181 }),
        expect.objectContaining({ x: 3866, y: 98, w: 892, h: 186 }),
      ]);

      for (const crop of crops) {
        mkdirSync(join(crop.outputPath, ".."), { recursive: true });
        writeFileSync(crop.outputPath, Buffer.from(`roi ${crop.w}x${crop.h}`));
      }

      callback?.(null, Buffer.alloc(0), Buffer.alloc(0));
      return {} as ReturnType<typeof execFile>;
    }) as never);

    const backend = createDefaultRoiCaptureBackend();
    const captures = await backend({
      workspace: workspaceWithRois([]),
      rois: [
        roi("LiveSignalChart_Z", -936, 294, 896, 181),
        roi("LiveSignalChart_Current(A)", -934, 98, 892, 186),
      ],
    });

    expect(captures).toEqual([
      expect.objectContaining({ ref: "LiveSignalChart_Z", width: 896, height: 181, data: expect.any(String) }),
      expect.objectContaining({ ref: "LiveSignalChart_Current(A)", width: 892, height: 186, data: expect.any(String) }),
    ]);
  });

  it("writes ROI PNGs into the active experiment directory with human-readable names", async () => {
    const experimentDir = join(quailbotStateRoot(), "experiments", "2026", "06", "22", "exp_test01");
    const capturePath = join(quailbotStateRoot(), "workspace-capture.png");
    mkdirSync(dirname(capturePath), { recursive: true });
    writeFileSync(capturePath, Buffer.from("capture"));
    captureVirtualScreenAsyncMock.mockResolvedValue({
      pngPath: capturePath,
      frame: { imageWidth: 1920, imageHeight: 1080, originX: 0, originY: 0, captureId: "abcdef0123456789" },
    });
    execFileMock.mockImplementation(((
      _file: string,
      args: readonly string[],
      options: { env?: NodeJS.ProcessEnv },
      callback?: (error: Error | null, stdout: Buffer, stderr: Buffer) => void,
    ) => {
      const env = options.env;
      const crops = JSON.parse(Buffer.from(env?.QUAILBOT_ROI_CROPS_B64 ?? "", "base64").toString("utf8")) as Array<{
        outputPath: string;
      }>;
      for (const crop of crops) {
        mkdirSync(dirname(crop.outputPath), { recursive: true });
        writeFileSync(crop.outputPath, Buffer.from("roi-bytes"));
      }
      callback?.(null, Buffer.alloc(0), Buffer.alloc(0));
      return {} as ReturnType<typeof execFile>;
    }) as never);

    const backend = createDefaultRoiCaptureBackend({ resolveExperimentDir: () => experimentDir });
    const captures = await backend({
      workspace: workspaceWithRois([]),
      rois: [roi("LiveScan", 100, 50, 200, 150)],
    });

    expect(captures).toHaveLength(1);
    const capture = captures[0]!;
    expect(capture.imagePath).toBe(join(experimentDir, "roi-LiveScan-301b4447-abcdef0123456789.png"));
    expect(existsSync(capture.imagePath)).toBe(true);
    // The legacy <stateDir>/roi-observations/ pile must NOT be created.
    expect(existsSync(join(quailbotStateRoot(), "roi-observations"))).toBe(false);
  });

  it("falls back to <stateRoot>/observations-orphan/ when no experiment is open", async () => {
    const capturePath = join(quailbotStateRoot(), "workspace-capture.png");
    mkdirSync(dirname(capturePath), { recursive: true });
    writeFileSync(capturePath, Buffer.from("capture"));
    captureVirtualScreenAsyncMock.mockResolvedValue({
      pngPath: capturePath,
      frame: { imageWidth: 1920, imageHeight: 1080, originX: 0, originY: 0, captureId: "fedcba9876543210" },
    });
    execFileMock.mockImplementation(((
      _file: string,
      args: readonly string[],
      options: { env?: NodeJS.ProcessEnv },
      callback?: (error: Error | null, stdout: Buffer, stderr: Buffer) => void,
    ) => {
      const env = options.env;
      const crops = JSON.parse(Buffer.from(env?.QUAILBOT_ROI_CROPS_B64 ?? "", "base64").toString("utf8")) as Array<{
        outputPath: string;
      }>;
      for (const crop of crops) {
        mkdirSync(dirname(crop.outputPath), { recursive: true });
        writeFileSync(crop.outputPath, Buffer.from("orphan-roi-bytes"));
      }
      callback?.(null, Buffer.alloc(0), Buffer.alloc(0));
      return {} as ReturnType<typeof execFile>;
    }) as never);

    const backend = createDefaultRoiCaptureBackend({ resolveExperimentDir: () => undefined });
    const captures = await backend({
      workspace: workspaceWithRois([]),
      rois: [roi("LiveScan", 100, 50, 200, 150)],
    });

    expect(captures).toHaveLength(1);
    expect(captures[0]!.imagePath.startsWith(join(quailbotStateRoot(), "observations-orphan"))).toBe(true);
    expect(existsSync(captures[0]!.imagePath)).toBe(true);
  });

  it("compacts PowerShell CLIXML crop failures before returning model-visible ROI errors", async () => {
    const { observation } = await observeRois(
      {
        workspace: workspaceWithRois([]),
        roiCaptureBackend: async () => {
          throw new Error(
            `Command failed: powershell.exe -NoProfile -EncodedCommand ${"A".repeat(1200)}\n` +
              "#< CLIXML\r\n" +
              '<Objs><S S="Error">Cannot convert the &quot;System.Object[]&quot; value of type &quot;System.Object[]&quot; to type &quot;System.Int32&quot;._x000D__x000A_</S></Objs>',
          );
        },
      },
      [roi("scope", 10, 20, 30, 40)],
    );

    const result = observation.results.scope;
    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        error_type: "roi_backend_unavailable",
        error_message: expect.stringContaining("Cannot convert"),
      }),
    );
    expect(result?.ok).toBe(false);
    if (result?.ok !== false) {
      throw new Error("ROI result unexpectedly succeeded");
    }
    expect(result.error_message).not.toContain("-EncodedCommand");
    expect(result.error_message).not.toContain("#< CLIXML");
    expect(result.error_message.length).toBeLessThanOrEqual(500);
  });
});

function roi(name: string, x: number, y: number, w: number, h: number): WorkspaceRoi {
  return {
    ref: name,
    name,
    active: true,
    linkedObservables: [],
    schema: { x, y, w, h },
  };
}

function workspaceWithRois(rois: WorkspaceRoi[]): Workspace {
  return { rois } as Workspace;
}
