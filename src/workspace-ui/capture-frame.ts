import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type WorkspaceCaptureFrame = {
  path: string;
  contentType: string;
  imageWidth: number;
  imageHeight: number;
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function findWorkspaceCaptureFrame(cwd: string): WorkspaceCaptureFrame | undefined {
  const path = join(cwd, ".quailbot-pi", "workspace-capture.png");
  if (!existsSync(path)) {
    return undefined;
  }

  const bytes = readFileSync(path);
  const dimensions = pngDimensions(bytes, path);
  return { path, contentType: "image/png", imageWidth: dimensions.width, imageHeight: dimensions.height };
}

export function readWorkspaceCaptureBytes(frame: WorkspaceCaptureFrame): Buffer {
  return readFileSync(frame.path);
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
