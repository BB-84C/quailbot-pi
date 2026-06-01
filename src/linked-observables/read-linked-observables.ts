import type { ToolContext } from "../tools/tool-context.js";
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

export type LinkedRoiObservationResult = {
  ok: false;
  error_type: "roi_backend_unavailable";
  error_message: string;
};

export type LinkedObservation = {
  channels: {
    cli: { observables: string[]; results: Record<string, LinkedCliObservationResult> };
    roi: { rois: string[]; results: Record<string, LinkedRoiObservationResult>; unavailable: string[] };
  };
  unresolved: string[];
};

export async function readLinkedObservables(
  ctx: ToolContext,
  resolved: ResolvedLinkedObservables,
): Promise<LinkedObservation> {
  const cliResults: Record<string, LinkedCliObservationResult> = {};
  for (const ref of resolved.cli) {
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

  const roiResults: Record<string, LinkedRoiObservationResult> = {};
  for (const ref of resolved.roi) {
    roiResults[ref] = {
      ok: false,
      error_type: "roi_backend_unavailable",
      error_message: "ROI linked-observable readback is not implemented in this round",
    };
  }

  return {
    channels: {
      cli: { observables: [...resolved.cli], results: cliResults },
      roi: { rois: [...resolved.roi], results: roiResults, unavailable: [...resolved.roi] },
    },
    unresolved: [...resolved.unresolved],
  };
}

function splitCliRef(ref: string): [string, string] {
  const separator = ref.indexOf(":");
  if (separator === -1) {
    return ["cli", ref];
  }

  return [ref.slice(0, separator), ref.slice(separator + 1)];
}
