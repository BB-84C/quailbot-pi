import { execFile, type ExecFileOptions } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

import { captureScreenToFile } from "../workspace-ui/server/capture.js";
import type { Workspace, WorkspaceRoi } from "../workspace/types.js";
import { quailbotStateRoot } from "../workspace/workspace-state.js";
import type { QuailbotToolContent } from "./tool-result.js";

export const ROI_IMAGE_UNREADABLE_BY_MODEL_WARNING =
  "ROI screenshots were captured, but the current model does not accept image input; continuing with ROI metadata only.";

export type RoiRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type CapturedRoiImage = {
  ref: string;
  name?: string;
  rect: RoiRect;
  imagePath: string;
  mimeType: "image/png";
  width: number;
  height: number;
  captureId: string;
  data: string;
};

export type RoiCaptureBackend = (request: { workspace: Workspace; rois: WorkspaceRoi[] }) => Promise<CapturedRoiImage[]>;

export type RoiImageObservationResult = {
  ok: true;
  ref: string;
  name?: string;
  rect: RoiRect;
  image_path: string;
  mime_type: "image/png";
  width: number;
  height: number;
  capture_id: string;
  model_can_read_image: boolean;
  attached_image: boolean;
  warning?: string;
};

export type RoiErrorObservationResult = {
  ok: false;
  ref: string;
  name?: string;
  error_type: "roi_backend_unavailable" | "roi_capture_failed" | "roi_geometry_invalid" | "roi_not_found";
  error_message: string;
  rect?: RoiRect;
};

export type RoiObservationResult = RoiImageObservationResult | RoiErrorObservationResult;

export type RoiObservationReadback = {
  rois: string[];
  results: Record<string, RoiObservationResult>;
  unavailable: string[];
  warnings: string[];
};

export type RoiObservationBundle = {
  observation: RoiObservationReadback;
  content: QuailbotToolContent[];
};

export type RoiObservationContext = {
  workspace: Workspace;
  roiCaptureBackend?: RoiCaptureBackend;
  modelSupportsImages?: boolean;
  notifyWarning?: (message: string) => void;
};

const POWERSHELL_CROP_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$InputPath = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:QUAILBOT_ROI_INPUT_PATH_B64))
$CropsJson = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:QUAILBOT_ROI_CROPS_B64))
$ParsedCrops = $CropsJson | ConvertFrom-Json
if ($ParsedCrops -is [System.Array]) {
  $Crops = $ParsedCrops
} else {
  $Crops = @($ParsedCrops)
}

$image = [System.Drawing.Image]::FromFile($InputPath)
try {
  foreach ($crop in $Crops) {
    $OutputPath = [string]$crop.outputPath
    $x = [int]$crop.x
    $y = [int]$crop.y
    $w = [int]$crop.w
    $h = [int]$crop.h
    if ($w -le 0 -or $h -le 0) { throw ("invalid ROI crop size " + $w + "x" + $h) }
    if ($x -lt 0 -or $y -lt 0 -or ($x + $w) -gt $image.Width -or ($y + $h) -gt $image.Height) {
      throw ("ROI crop outside capture bounds: crop=" + $x + "," + $y + "," + $w + "," + $h + " image=" + $image.Width + "x" + $image.Height)
    }

    $bitmap = $null
    $graphics = $null
    try {
      $bitmap = [System.Drawing.Bitmap]::new($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      $sourceRect = [System.Drawing.Rectangle]::new($x, $y, $w, $h)
      $targetRect = [System.Drawing.Rectangle]::new(0, 0, $w, $h)
      $graphics.DrawImage($image, $targetRect, $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)
      $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      if ($graphics -ne $null) { $graphics.Dispose() }
      if ($bitmap -ne $null) { $bitmap.Dispose() }
    }
  }
} finally {
  $image.Dispose()
}
`;

export async function observeRois(ctx: RoiObservationContext, rois: WorkspaceRoi[]): Promise<RoiObservationBundle> {
  const requested = uniqueRois(rois);
  const results: Record<string, RoiObservationResult> = {};
  const unavailable: string[] = [];
  const content: QuailbotToolContent[] = [];
  const warnings = new Set<string>();
  const captureTargets: WorkspaceRoi[] = [];

  for (const roi of requested) {
    const rect = roiRectFromSchema(roi);
    if (rect === undefined) {
      results[roi.ref] = {
        ok: false,
        ref: roi.ref,
        ...(roi.name === undefined ? {} : { name: roi.name }),
        error_type: "roi_geometry_invalid",
        error_message: `ROI ${roi.name ?? roi.ref} must define finite x, y, w, and h values`,
      };
      unavailable.push(roi.ref);
      continue;
    }

    captureTargets.push(roi);
  }

  if (captureTargets.length > 0) {
    const backend = ctx.roiCaptureBackend;
    if (backend === undefined) {
      for (const roi of captureTargets) {
        results[roi.ref] = backendUnavailable(roi, "ROI screenshot backend is not configured");
        unavailable.push(roi.ref);
      }
    } else {
      try {
        const captures = await backend({ workspace: ctx.workspace, rois: captureTargets });
        const capturesByRef = new Map(captures.map((capture) => [capture.ref, capture]));
        const modelCanReadImage = ctx.modelSupportsImages !== false;

        for (const roi of captureTargets) {
          const capture = capturesByRef.get(roi.ref);
          if (capture === undefined) {
            results[roi.ref] = {
              ok: false,
              ref: roi.ref,
              ...(roi.name === undefined ? {} : { name: roi.name }),
              error_type: "roi_capture_failed",
              error_message: `ROI capture backend did not return ${roi.ref}`,
              rect: roiRectFromSchema(roi),
            };
            unavailable.push(roi.ref);
            continue;
          }

          const warning = modelCanReadImage ? undefined : ROI_IMAGE_UNREADABLE_BY_MODEL_WARNING;
          if (warning !== undefined) {
            warnings.add(warning);
          }

          results[roi.ref] = {
            ok: true,
            ref: roi.ref,
            ...(roi.name === undefined ? {} : { name: roi.name }),
            rect: capture.rect,
            image_path: capture.imagePath,
            mime_type: capture.mimeType,
            width: capture.width,
            height: capture.height,
            capture_id: capture.captureId,
            model_can_read_image: modelCanReadImage,
            attached_image: modelCanReadImage,
            ...(warning === undefined ? {} : { warning }),
          };

          if (modelCanReadImage) {
            content.push({ type: "image", data: capture.data, mimeType: capture.mimeType });
          }
        }
      } catch (error) {
        const message = sanitizeRoiCaptureError(errorMessage(error));
        for (const roi of captureTargets) {
          results[roi.ref] = backendUnavailable(roi, message);
          unavailable.push(roi.ref);
        }
      }
    }
  }

  for (const warning of warnings) {
    ctx.notifyWarning?.(warning);
  }

  return {
    observation: {
      rois: requested.map((roi) => roi.ref),
      results,
      unavailable,
      warnings: [...warnings],
    },
    content,
  };
}

export type DefaultRoiCaptureBackendOptions = {
  /**
   * Resolves the current active experiment directory at capture time. When
   * an experiment is open, ROI PNGs are written there with their human-
   * readable name so the captured evidence travels with the experiment
   * record. When undefined (no active experiment), ROI PNGs fall back to
   * `<stateRoot>/observations-orphan/` so observations are never lost.
   */
  resolveExperimentDir?: () => string | undefined;
};

export function createDefaultRoiCaptureBackend(options: DefaultRoiCaptureBackendOptions = {}): RoiCaptureBackend {
  return async ({ rois }) => {
    const stateDir = quailbotStateRoot();
    const experimentDir = options.resolveExperimentDir?.();
    // ROI PNGs land directly in the experiment's blobs/images directory with
    // their human-readable name. The image-artifacts pass on the recorded
    // tool result sees the file is already inside blobs/images and records
    // the artifact metadata (size, sha256 for integrity) without copying,
    // so there is exactly one file per ROI capture.
    const outputDir = experimentDir
      ? join(experimentDir, "blobs", "images")
      : join(stateDir, "observations-orphan");
    mkdirSync(outputDir, { recursive: true });

    // ROI captures use their OWN private screenshot file -- they never
    // touch the workspace UI's workspace-capture.png. The transient
    // source PNG is written into the same blobs/images directory with a
    // hidden temp basename, cropped, then deleted in the finally block.
    // No metadata sidecar is written; the captureId is computed in memory
    // and embedded in each cropped ROI's filename for traceability.
    const tempCaptureSuffix = randomBytes(8).toString("hex");
    const tempCapturePath = join(outputDir, `_roi-source-${tempCaptureSuffix}.png`);

    try {
      const captureFrame = await captureScreenToFile(tempCapturePath);
      const pendingCaptures = rois.map((roi) => {
        const rect = requireRoiRect(roi);
        const crop = {
          x: Math.round(rect.x - captureFrame.originX),
          y: Math.round(rect.y - captureFrame.originY),
          w: Math.round(rect.w),
          h: Math.round(rect.h),
        };
        const imagePath = join(
          outputDir,
          `roi-${safeFilePart(roi.name ?? roi.ref)}-${shortHash(roi.ref)}-${captureFrame.captureId}.png`,
        );
        return { roi, rect, crop, imagePath };
      });

      await cropPngBatch(
        tempCapturePath,
        pendingCaptures.map(({ imagePath, crop }) => ({ outputPath: imagePath, rect: crop })),
      );

      return pendingCaptures.map(({ roi, rect, crop, imagePath }) => {
        const bytes = readFileSync(imagePath);

        return {
          ref: roi.ref,
          ...(roi.name === undefined ? {} : { name: roi.name }),
          rect,
          imagePath,
          mimeType: "image/png" as const,
          width: crop.w,
          height: crop.h,
          captureId: captureFrame.captureId,
          data: bytes.toString("base64"),
        };
      });
    } finally {
      try {
        unlinkSync(tempCapturePath);
      } catch {
        // best-effort cleanup: the temp source file is regenerated on
        // every ROI capture, so a leaked file is at worst one extra PNG
        // until the next capture overwrites it.
      }
    }
  };
}

export function roiRectFromSchema(roi: WorkspaceRoi): RoiRect | undefined {
  const schema = roi.schema;
  const x = numberValue(schema.x ?? schema.left);
  const y = numberValue(schema.y ?? schema.top);
  const w = numberValue(schema.w ?? schema.width);
  const h = numberValue(schema.h ?? schema.height);

  if (x === undefined || y === undefined || w === undefined || h === undefined || w <= 0 || h <= 0) {
    return undefined;
  }

  return { x, y, w, h };
}

function requireRoiRect(roi: WorkspaceRoi): RoiRect {
  const rect = roiRectFromSchema(roi);
  if (rect === undefined) {
    throw new Error(`ROI ${roi.name ?? roi.ref} must define finite x, y, w, and h values`);
  }

  return rect;
}

function backendUnavailable(roi: WorkspaceRoi, message: string): RoiErrorObservationResult {
  return {
    ok: false,
    ref: roi.ref,
    ...(roi.name === undefined ? {} : { name: roi.name }),
    error_type: "roi_backend_unavailable",
    error_message: message,
    ...(roiRectFromSchema(roi) === undefined ? {} : { rect: roiRectFromSchema(roi) }),
  };
}

async function cropPngBatch(inputPath: string, crops: Array<{ outputPath: string; rect: RoiRect }>): Promise<void> {
  if (crops.length === 0) {
    return;
  }

  const encoded = Buffer.from(POWERSHELL_CROP_SCRIPT, "utf16le").toString("base64");
  await execFileBuffer(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
    {
      env: {
        ...process.env,
        QUAILBOT_ROI_INPUT_PATH_B64: Buffer.from(inputPath, "utf8").toString("base64"),
        QUAILBOT_ROI_CROPS_B64: Buffer.from(
          JSON.stringify(
            crops.map(({ outputPath, rect }) => ({
              outputPath,
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              w: Math.round(rect.w),
              h: Math.round(rect.h),
            })),
          ),
          "utf8",
        ).toString("base64"),
      },
      timeout: 30_000,
      windowsHide: true,
    },
  );
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

function uniqueRois(rois: WorkspaceRoi[]): WorkspaceRoi[] {
  const seen = new Set<string>();
  const result: WorkspaceRoi[] = [];
  for (const roi of rois) {
    if (seen.has(roi.ref)) {
      continue;
    }
    seen.add(roi.ref);
    result.push(roi);
  }
  return result;
}

function safeFilePart(value: string): string {
  const safe = value.replace(/[^A-Za-z0-9_.-]+/g, "_").slice(0, 80);
  return safe.length > 0 ? safe : "roi";
}

function shortHash(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 8);
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sanitizeRoiCaptureError(message: string): string {
  const psErrors = [...message.matchAll(/<S S="Error">([\s\S]*?)<\/S>/g)]
    .map((match) => decodePowerShellXmlText(match[1] ?? ""))
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (psErrors.length > 0) {
    return compactDiagnostic(uniqueStrings(psErrors).join(" "));
  }

  const withoutEncodedCommand = message.replace(/-EncodedCommand\s+\S+/g, "-EncodedCommand <omitted>");
  return compactDiagnostic(withoutEncodedCommand);
}

function decodePowerShellXmlText(value: string): string {
  return value
    .replace(/_x000D__x000A_/g, "\n")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function compactDiagnostic(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  const maxChars = 500;
  return normalized.length <= maxChars ? normalized : `${normalized.slice(0, maxChars - " [truncated]".length)} [truncated]`;
}
