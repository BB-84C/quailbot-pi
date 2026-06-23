import { execFile, execFileSync, type ExecFileOptions } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { closeSync, fsyncSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { CaptureFrame } from "../shared/geometry.js";

export type CaptureResult = { frame: CaptureFrame; pngPath: string };

const CAPTURE_PNG_FILE = "workspace-capture.png";
const CAPTURE_METADATA_FILE = "workspace-capture.metadata.json";
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const POWERSHELL_CAPTURE_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$csharp = @'
using System;
using System.Runtime.InteropServices;

public static class QuailbotNativeCapture {
  [DllImport("user32.dll")]
  public static extern bool SetProcessDpiAwarenessContext(IntPtr dpiContext);

  [DllImport("shcore.dll")]
  public static extern int SetProcessDpiAwareness(int awareness);

  [DllImport("user32.dll")]
  public static extern bool SetProcessDPIAware();

  [DllImport("user32.dll")]
  public static extern int GetSystemMetrics(int nIndex);
}
'@
Add-Type -TypeDefinition $csharp

$awarenessMode = 'unaware'
try {
  if ([QuailbotNativeCapture]::SetProcessDpiAwarenessContext([IntPtr]::new(-4))) {
    $awarenessMode = 'PerMonitorV2'
  }
} catch {}
if ($awarenessMode -eq 'unaware') {
  try {
    if ([QuailbotNativeCapture]::SetProcessDpiAwareness(2) -eq 0) {
      $awarenessMode = 'PerMonitor'
    }
  } catch {}
}
if ($awarenessMode -eq 'unaware') {
  try {
    if ([QuailbotNativeCapture]::SetProcessDPIAware()) {
      $awarenessMode = 'System'
    }
  } catch {}
}

Add-Type -AssemblyName System.Drawing
$OutputPath = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:QUAILBOT_CAPTURE_PATH_B64))
$left = [QuailbotNativeCapture]::GetSystemMetrics(76)
$top = [QuailbotNativeCapture]::GetSystemMetrics(77)
$width = [QuailbotNativeCapture]::GetSystemMetrics(78)
$height = [QuailbotNativeCapture]::GetSystemMetrics(79)
if ($width -le 0 -or $height -le 0) { throw ("invalid virtual screen bounds " + $width + "x" + $height) }

$bitmap = [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  $graphics.CopyFromScreen($left, $top, 0, 0, $bitmap.Size)
  $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  [Console]::Out.Write((ConvertTo-Json @{
    originX = [int]$left;
    originY = [int]$top;
    imageWidth = [int]$width;
    imageHeight = [int]$height;
    awarenessMode = $awarenessMode
  } -Compress))
} finally {
  $graphics.Dispose()
  $bitmap.Dispose()
}
`;

export function captureVirtualScreen(opts: { stateDir: string }): CaptureResult {
  mkdirSync(opts.stateDir, { recursive: true });

  const paths = capturePaths(opts.stateDir);

  const reported = runPowerShellCapture(paths.tmpPngPath);
  return publishCapture(paths, reported);
}

export async function captureVirtualScreenAsync(opts: { stateDir: string }): Promise<CaptureResult> {
  mkdirSync(opts.stateDir, { recursive: true });

  const paths = capturePaths(opts.stateDir);

  const reported = await runPowerShellCaptureAsync(paths.tmpPngPath);
  return publishCapture(paths, reported);
}

type CapturePaths = {
  finalPngPath: string;
  finalMetadataPath: string;
  tmpPngPath: string;
  tmpMetadataPath: string;
};

function capturePaths(stateDir: string): CapturePaths {
  const finalPngPath = join(stateDir, CAPTURE_PNG_FILE);
  const finalMetadataPath = join(stateDir, CAPTURE_METADATA_FILE);
  const suffix = randomBytes(8).toString("hex");
  return {
    finalPngPath,
    finalMetadataPath,
    tmpPngPath: `${finalPngPath}.tmp.${suffix}`,
    tmpMetadataPath: `${finalMetadataPath}.tmp.${suffix}`,
  };
}

function publishCapture(paths: CapturePaths, reported: CaptureScriptResult): CaptureResult {
  const pngBytes = readFileSync(paths.tmpPngPath);
  const pngDimensions = readPngDimensions(pngBytes);
  if (pngDimensions.width !== reported.imageWidth || pngDimensions.height !== reported.imageHeight) {
    throw new Error(
      `workspace capture self-check failed: PNG dimensions ${pngDimensions.width}x${pngDimensions.height} ` +
        `did not match reported ${reported.imageWidth}x${reported.imageHeight}`,
    );
  }

  const captureId = createHash("sha256").update(pngBytes).digest("hex").slice(0, 16);
  const frame: CaptureFrame = {
    imageWidth: reported.imageWidth,
    imageHeight: reported.imageHeight,
    originX: reported.originX,
    originY: reported.originY,
    captureId,
  };

  writeFileSync(
    paths.tmpMetadataPath,
    `${JSON.stringify({ ...frame, awarenessMode: reported.awarenessMode, capturedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );
  fsyncFile(paths.tmpMetadataPath);
  renameSync(paths.tmpMetadataPath, paths.finalMetadataPath);
  fsyncFile(paths.tmpPngPath);
  renameSync(paths.tmpPngPath, paths.finalPngPath);

  // 0.1.0: single workspace-capture.png; legacy hashed snapshots are removed
  // as a best-effort cleanup so old per-captureId files do not accumulate.
  cleanupLegacyVersionedCaptures(paths.finalPngPath);

  return { frame, pngPath: paths.finalPngPath };
}

function cleanupLegacyVersionedCaptures(finalPngPath: string): void {
  const dir = join(finalPngPath, "..");
  try {
    for (const entry of readdirSync(dir)) {
      if (/^workspace-capture\.[a-f0-9]{16}\.png$/.test(entry)) {
        try {
          unlinkSync(join(dir, entry));
        } catch {
          // best-effort
        }
      }
    }
  } catch {
    // best-effort
  }
}

function fsyncFile(path: string): void {
  const fd = openSync(path, "r+");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function runPowerShellCapture(outputPath: string): CaptureScriptResult {
  const encoded = Buffer.from(POWERSHELL_CAPTURE_SCRIPT, "utf16le").toString("base64");
  const stdout = execFileSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
    {
      env: { ...process.env, QUAILBOT_CAPTURE_PATH_B64: Buffer.from(outputPath, "utf8").toString("base64") },
      stdio: "pipe",
      timeout: 30_000,
      windowsHide: true,
    },
  );
  return parseCaptureScriptResult(stdout.toString("utf8"));
}

async function runPowerShellCaptureAsync(outputPath: string): Promise<CaptureScriptResult> {
  const encoded = Buffer.from(POWERSHELL_CAPTURE_SCRIPT, "utf16le").toString("base64");
  const stdout = await execFileBuffer(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
    {
      env: { ...process.env, QUAILBOT_CAPTURE_PATH_B64: Buffer.from(outputPath, "utf8").toString("base64") },
      timeout: 30_000,
      windowsHide: true,
    },
  );
  return parseCaptureScriptResult(stdout.toString("utf8"));
}

function execFileBuffer(file: string, args: string[], options: ExecFileOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { ...options, encoding: "buffer" }, (error, stdout, stderr) => {
      if (error !== null) {
        const stderrText = Buffer.isBuffer(stderr) ? stderr.toString("utf8").trim() : String(stderr ?? "").trim();
        reject(new Error(stderrText ? `${error.message}\n${stderrText}` : error.message));
        return;
      }

      resolve(Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout ?? "", "utf8"));
    });
  });
}

type CaptureScriptResult = {
  originX: number;
  originY: number;
  imageWidth: number;
  imageHeight: number;
  awarenessMode: string;
};

function parseCaptureScriptResult(stdout: string): CaptureScriptResult {
  const parsed = JSON.parse(stdout || "{}");
  if (!isFiniteNumber(parsed.originX) || !isFiniteNumber(parsed.originY)) {
    throw new Error("workspace capture PowerShell returned invalid origin metadata");
  }
  if (!isFiniteNumber(parsed.imageWidth) || !isFiniteNumber(parsed.imageHeight)) {
    throw new Error("workspace capture PowerShell returned invalid image dimensions");
  }

  return {
    originX: parsed.originX,
    originY: parsed.originY,
    imageWidth: parsed.imageWidth,
    imageHeight: parsed.imageHeight,
    awarenessMode: typeof parsed.awarenessMode === "string" ? parsed.awarenessMode : "unknown",
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readPngDimensions(bytes: Buffer): { width: number; height: number } {
  if (bytes.length < 24 || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error("workspace capture self-check failed: capture output is not a PNG");
  }

  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}
