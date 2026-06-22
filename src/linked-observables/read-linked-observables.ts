import type { ToolContext } from "../tools/tool-context.js";
import { observeRois, type RoiObservationReadback, type RoiObservationResult } from "../tools/roi-observation.js";
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
