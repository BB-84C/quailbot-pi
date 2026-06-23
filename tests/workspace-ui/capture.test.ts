import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
  execFileSync: vi.fn(),
}));

import { captureVirtualScreen } from "../../src/workspace-ui/server/capture.js";

const execFileSyncMock = vi.mocked(execFileSync);

describe("workspace UI PowerShell capture", () => {
  let stateDir: string;

  beforeEach(() => {
    stateDir = mkdtempSync(join(tmpdir(), "quailbot-pi-capture-"));
    execFileSyncMock.mockReset();
  });

  afterEach(() => {
    rmSync(stateDir, { recursive: true, force: true });
  });

  it("throws when reported bounds do not match PNG IHDR dimensions", () => {
    const png = fakePng(100, 50);
    mockPowerShellCapture(png, { originX: -10, originY: 0, imageWidth: 200, imageHeight: 50, awarenessMode: "PerMonitorV2" });

    expect(() => captureVirtualScreen({ stateDir })).toThrow(/PNG dimensions 100x50.*reported 200x50/);
  });

  it("returns a frame with captureId from the PNG byte hash when dimensions match", () => {
    const png = fakePng(100, 50, 0x42);
    const expectedId = createHash("sha256").update(png).digest("hex").slice(0, 16);
    mockPowerShellCapture(png, { originX: -10, originY: 20, imageWidth: 100, imageHeight: 50, awarenessMode: "PerMonitorV2" });

    const result = captureVirtualScreen({ stateDir });

    expect(result.frame).toEqual({ imageWidth: 100, imageHeight: 50, originX: -10, originY: 20, captureId: expectedId });
    expect(result.pngPath).toBe(join(stateDir, "workspace-capture.png"));
    expect(readFileSync(join(stateDir, "workspace-capture.png"))).toEqual(png);
    // 0.1.0: per-captureId versioned PNG snapshots are no longer written; only
    // the current workspace-capture.png is kept and is overwritten by each new
    // capture. Stale captureId requests are served the current PNG only when
    // the metadata captureId matches; otherwise the server returns 404.
    expect(existsSync(join(stateDir, `workspace-capture.${expectedId}.png`))).toBe(false);
  });

  it("removes any pre-existing legacy versioned PNG snapshots on publish", () => {
    const png = fakePng(100, 50, 0x77);
    const legacyId = "deadbeefdeadbeef";
    writeFileSync(join(stateDir, `workspace-capture.${legacyId}.png`), Buffer.from("legacy bytes", "utf8"));
    mockPowerShellCapture(png, { originX: 0, originY: 0, imageWidth: 100, imageHeight: 50, awarenessMode: "System" });

    captureVirtualScreen({ stateDir });

    expect(existsSync(join(stateDir, `workspace-capture.${legacyId}.png`))).toBe(false);
    expect(existsSync(join(stateDir, "workspace-capture.png"))).toBe(true);
  });
});

function mockPowerShellCapture(
  png: Buffer,
  metadata: { originX: number; originY: number; imageWidth: number; imageHeight: number; awarenessMode: string },
): void {
  execFileSyncMock.mockImplementation((_file, _args, options) => {
    const outputPath = decodeOutputPath(options as { env?: NodeJS.ProcessEnv });
    writeFileSync(outputPath, png);
    return Buffer.from(JSON.stringify(metadata), "utf8");
  });
}

function decodeOutputPath(options: { env?: NodeJS.ProcessEnv }): string {
  const encodedPath = options.env?.QUAILBOT_CAPTURE_PATH_B64;
  if (encodedPath === undefined) {
    throw new Error("mock could not find PowerShell output path environment");
  }
  return Buffer.from(encodedPath, "base64").toString("utf8");
}

function fakePng(width: number, height: number, payloadByte = 0): Buffer {
  const bytes = Buffer.alloc(33, payloadByte);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}
