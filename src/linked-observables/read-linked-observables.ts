import { readFileSync } from "node:fs";

import type { ToolContext } from "../tools/tool-context.js";
import {
  observeRois,
  ROI_IMAGE_UNREADABLE_BY_MODEL_WARNING,
  type RoiObservationReadback,
  type RoiObservationResult,
} from "../tools/roi-observation.js";
import type { QuailbotToolContent } from "../tools/tool-result.js";
import type { WorkspaceRoi } from "../workspace/types.js";
import type { ResolvedLinkedObservables } from "./resolve-linked-observables.js";

export type LinkedCliObservationResult = {
  ok: boolean;
  exit_code: number;
  stdout: string;
  stderr: string;
  payload: unknown;
  argv: string[];
  error_type?: string;
  error_message?: string;
  warning?: string;
};

export type LinkedRoiObservationResult = RoiObservationResult;

export type LinkedObservation = {
  channels: {
    cli: { observables: string[]; results: Record<string, LinkedCliObservationResult> };
    roi: RoiObservationReadback;
  };
  unresolved: string[];
};

export type ReadLinkedObservablesResult = {
  observation: LinkedObservation;
  content: QuailbotToolContent[];
};

export async function readLinkedObservables(
  ctx: ToolContext,
  resolved: ResolvedLinkedObservables,
): Promise<LinkedObservation> {
  return (await readLinkedObservablesWithContent(ctx, resolved)).observation;
}

export async function readLinkedObservablesWithContent(
  ctx: ToolContext,
  resolved: ResolvedLinkedObservables,
): Promise<ReadLinkedObservablesResult> {
  const roiReadbackPromise = observeRois(ctx, resolvedRois(ctx, resolved.roi));
  const cliResultsPromise = readCliObservables(ctx, resolved.cli);

  const [cliResults, { observation: roiObservation, content }] = await Promise.all([cliResultsPromise, roiReadbackPromise]);
  appendCliImageContent(ctx, cliResults, content);

  return {
    observation: {
      channels: {
        cli: { observables: [...resolved.cli], results: cliResults },
        roi: roiObservation,
      },
      unresolved: [...resolved.unresolved],
    },
    content,
  };
}

function appendCliImageContent(
  ctx: ToolContext,
  cliResults: Record<string, LinkedCliObservationResult>,
  content: QuailbotToolContent[],
): void {
  for (const result of Object.values(cliResults)) {
    const image = imageReference(result.payload);
    if (image === undefined) {
      continue;
    }

    if (ctx.modelSupportsImages === false) {
      result.warning = ROI_IMAGE_UNREADABLE_BY_MODEL_WARNING;
      ctx.notifyWarning?.(result.warning);
      continue;
    }

    try {
      content.push({ type: "image", data: readFileSync(image.path).toString("base64"), mimeType: image.mimeType });
    } catch (error) {
      result.warning = `linked observable image readback failed for ${image.path}: ${errorMessage(error)}`;
      ctx.notifyWarning?.(result.warning);
    }
  }
}

async function readCliObservables(ctx: ToolContext, refs: string[]): Promise<Record<string, LinkedCliObservationResult>> {
  const cliResults: Record<string, LinkedCliObservationResult> = {};
  for (const ref of refs) {
    const [cliName, parameter] = splitCliRef(ref);
    try {
      const run = await ctx.runCli(cliName, ["get", parameter]);
      cliResults[ref] = {
        ok: run.ok,
        exit_code: run.exitCode,
        stdout: run.stdout,
        stderr: run.stderr,
        payload: run.payload,
        argv: run.argv,
        ...(run.error_type !== undefined ? { error_type: run.error_type } : {}),
        ...(run.error_message !== undefined ? { error_message: run.error_message } : {}),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      cliResults[ref] = {
        ok: false,
        exit_code: -1,
        stdout: "",
        stderr: message,
        payload: undefined,
        argv: [cliName, "get", parameter],
        error_type: "readback_exception",
        error_message: message,
      };
    }
  }

  return cliResults;
}

function splitCliRef(ref: string): [string, string] {
  const separator = ref.indexOf(":");
  if (separator === -1) {
    return ["cli", ref];
  }

  return [ref.slice(0, separator), ref.slice(separator + 1)];
}

function imageReference(payload: unknown): { path: string; mimeType: string } | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const path = stringValue(payload.image_path);
  const mimeType = stringValue(payload.mime_type);
  if (path === undefined || mimeType === undefined || !mimeType.startsWith("image/")) {
    return undefined;
  }

  return { path, mimeType };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resolvedRois(ctx: ToolContext, refs: string[]): WorkspaceRoi[] {
  const rois: WorkspaceRoi[] = [];
  for (const ref of refs) {
    const roi = ctx.workspace.rois.find((item) => item.active && (item.ref === ref || item.name === ref));
    if (roi === undefined) {
      rois.push({
        ref,
        active: false,
        linkedObservables: [],
        schema: {},
      });
      continue;
    }
    rois.push(roi);
  }
  return rois;
}
