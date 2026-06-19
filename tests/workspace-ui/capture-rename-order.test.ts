// Pre-merge fix-up regression test: §13.2 / lens P1 finding —
// PNG must be renamed AFTER metadata so a concurrent reader of the captureId asset
// either sees old-PNG+old-metadata or new-PNG+new-metadata, never the mismatched pair.
// This test pins the publish order at the syscall level.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { renameOrder } = vi.hoisted(() => ({ renameOrder: [] as Array<"metadata" | "png" | "other"> }));

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));

vi.mock("node:fs", async () => {
  const real = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...real,
    renameSync: (from: string, to: string) => {
      const dest = String(to);
      const kind: "metadata" | "png" | "other" = dest.endsWith("workspace-capture.png")
        ? "png"
        : dest.endsWith("workspace-capture.metadata.json")
          ? "metadata"
          : "other";
      renameOrder.push(kind);
      return real.renameSync(from, to);
    },
  };
});

import { execFileSync } from "node:child_process";
import { captureVirtualScreen } from "../../src/workspace-ui/server/capture.js";

const execFileSyncMock = vi.mocked(execFileSync);

describe("workspace UI capture publish order", () => {
  let stateDir: string;

  beforeEach(() => {
    stateDir = mkdtempSync(join(tmpdir(), "quailbot-pi-capture-order-"));
    execFileSyncMock.mockReset();
    renameOrder.length = 0;
  });

  afterEach(() => {
    rmSync(stateDir, { recursive: true, force: true });
  });

  it("renames metadata BEFORE PNG so captureId match guarantees PNG match", () => {
    const png = fakePng(40, 30);
    execFileSyncMock.mockImplementation((_file, _args, options) => {
      const env = (options as { env?: NodeJS.ProcessEnv }).env;
      const encodedPath = env?.QUAILBOT_CAPTURE_PATH_B64;
      if (encodedPath === undefined) throw new Error("missing output path env");
      const outputPath = Buffer.from(encodedPath, "base64").toString("utf8");
      writeFileSync(outputPath, png);
      return Buffer.from(
        JSON.stringify({ originX: 0, originY: 0, imageWidth: 40, imageHeight: 30, awarenessMode: "PerMonitorV2" }),
        "utf8",
      );
    });

    captureVirtualScreen({ stateDir });

    expect(renameOrder).toEqual(["metadata", "png"]);
  });
});

function fakePng(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(33, 0);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}
