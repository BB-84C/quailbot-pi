import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type WorkspaceCaptureFrame = {
  path: string;
  contentType: string;
  imageWidth: number;
  imageHeight: number;
  originX: number;
  originY: number;
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CAPTURE_METADATA_FILE = "workspace-capture.metadata.json";

export function findWorkspaceCaptureFrame(cwd: string): WorkspaceCaptureFrame | undefined {
  const path = join(cwd, ".quailbot-pi", "workspace-capture.png");
  if (!existsSync(path)) {
    return undefined;
  }

  const bytes = readFileSync(path);
  const dimensions = pngDimensions(bytes, path);
  const origin = readWorkspaceCaptureOrigin(cwd);
  return { path, contentType: "image/png", imageWidth: dimensions.width, imageHeight: dimensions.height, ...origin };
}

export function readWorkspaceCaptureBytes(frame: WorkspaceCaptureFrame): Buffer {
  return readFileSync(frame.path);
}

export function refreshWorkspaceCaptureFrame(cwd: string): WorkspaceCaptureFrame {
  const stateRoot = join(cwd, ".quailbot-pi");
  const path = join(stateRoot, "workspace-capture.png");
  mkdirSync(stateRoot, { recursive: true });

  if (process.platform !== "win32") {
    throw new Error("workspace screenshot capture is currently implemented for Windows hosts only");
  }

  const origin = captureWindowsDesktop(path);
  const frame = findWorkspaceCaptureFrame(cwd);
  if (frame === undefined) {
    throw new Error("workspace screenshot capture did not create workspace-capture.png");
  }
  return { ...frame, ...origin };
}

export function persistWorkspaceCaptureFrameOrigin(cwd: string, frame: Pick<WorkspaceCaptureFrame, "originX" | "originY">): void {
  const stateRoot = join(cwd, ".quailbot-pi");
  mkdirSync(stateRoot, { recursive: true });
  writeFileSync(captureMetadataPath(cwd), `${JSON.stringify({ originX: frame.originX, originY: frame.originY }, null, 2)}\n`, "utf8");
}

function readWorkspaceCaptureOrigin(cwd: string): { originX: number; originY: number } {
  const path = captureMetadataPath(cwd);
  if (!existsSync(path)) {
    return { originX: 0, originY: 0 };
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { originX?: unknown; originY?: unknown };
    return {
      originX: typeof parsed.originX === "number" ? parsed.originX : 0,
      originY: typeof parsed.originY === "number" ? parsed.originY : 0,
    };
  } catch {
    return { originX: 0, originY: 0 };
  }
}

function captureMetadataPath(cwd: string): string {
  return join(cwd, ".quailbot-pi", CAPTURE_METADATA_FILE);
}

function captureWindowsDesktop(path: string): { originX: number; originY: number } {
  const escapedPath = path.replaceAll("'", "''");
  const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
if ($bounds.Width -le 0 -or $bounds.Height -le 0) { throw "invalid virtual screen bounds" }
$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  $graphics.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bitmap.Size)
  $bitmap.Save('${escapedPath}', [System.Drawing.Imaging.ImageFormat]::Png)
  [Console]::Out.Write((ConvertTo-Json @{ originX = [int]$bounds.Left; originY = [int]$bounds.Top } -Compress))
} finally {
  $graphics.Dispose()
  $bitmap.Dispose()
}
`;
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const stdout = execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], {
    stdio: "pipe",
    timeout: 15000,
    windowsHide: true,
  });
  const parsed = JSON.parse(stdout.toString("utf8") || "{}");
  return {
    originX: typeof parsed.originX === "number" ? parsed.originX : 0,
    originY: typeof parsed.originY === "number" ? parsed.originY : 0,
  };
}

function pngDimensions(bytes: Buffer, path: string): { width: number; height: number } {
  if (bytes.length < 24 || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error(`workspace capture image must be a PNG file: ${path}`);
  }

  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}
