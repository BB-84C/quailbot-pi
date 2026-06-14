import { loadActiveWorkspace, validateWorkspaceJson, writeWorkspaceJson } from "../workspace/workspace-service.js";
import type { QuailbotRuntime } from "../extension.js";
import { loadCliCapabilityPayload, mergeCliCapabilities, type ConflictResolution } from "./cli-import.js";

export type WorkspaceUiBackend = {
  cwd: string;
  runtime: QuailbotRuntime;
  token: string;
};

type JsonRecord = Record<string, unknown>;

export async function handleWorkspaceApi(request: Request, backend: WorkspaceUiBackend): Promise<Response> {
  const url = new URL(request.url);
  const queryAuth = authorizeQueryToken(url, backend);
  if (queryAuth !== undefined) {
    return queryAuth;
  }

  try {
    if (request.method === "GET" && url.pathname === "/api/workspace") {
      const active = loadActiveWorkspace({ cwd: backend.cwd });
      backend.runtime.activeWorkspace = active;
      backend.runtime.workspace = active.workspace;
      return jsonResponse({ ok: true, summary: active.summary });
    }

    if (request.method === "POST" && url.pathname === "/api/validate") {
      const body = record(await readJsonBody(request));
      const validation = validateWorkspaceJson(body.workspaceJson, { cwd: backend.cwd });
      if (!validation.ok) {
        return jsonResponse(validation, 422);
      }
      return jsonResponse({ ok: true, hash: validation.hash, selection: validation.selection, summary: validation.summary });
    }

    if (request.method === "POST" && url.pathname === "/api/write") {
      const headerAuth = authorizeHeaderToken(request, backend);
      if (headerAuth !== undefined) {
        return headerAuth;
      }
      const body = record(await readJsonBody(request));
      const targetPath = stringValue(body.targetPath);
      if (targetPath === undefined) {
        return jsonResponse({ ok: false, error: "targetPath must be a non-empty string" }, 400);
      }

      const result = writeWorkspaceJson({ workspaceJson: body.workspaceJson, targetPath, cwd: backend.cwd });
      if (!result.ok) {
        return jsonResponse(result, 422);
      }
      return jsonResponse({
        ok: true,
        targetPath: result.targetPath,
        previousHash: result.previousHash,
        hash: result.hash,
        summary: result.summary,
      });
    }

    if (request.method === "POST" && url.pathname === "/api/request-activation") {
      const headerAuth = authorizeHeaderToken(request, backend);
      if (headerAuth !== undefined) {
        return headerAuth;
      }
      const body = record(await readJsonBody(request));
      const targetPath = stringValue(body.targetPath);
      const expectedHash = stringValue(body.expectedHash);
      if (targetPath === undefined || expectedHash === undefined) {
        return jsonResponse({ ok: false, error: "targetPath and expectedHash must be non-empty strings" }, 400);
      }

      backend.runtime.pendingWorkspaceActivation = { targetPath, expectedHash };
      return jsonResponse({ ok: true, pendingWorkspaceActivation: backend.runtime.pendingWorkspaceActivation });
    }

    if (request.method === "POST" && url.pathname === "/api/import-cli") {
      const headerAuth = authorizeHeaderToken(request, backend);
      if (headerAuth !== undefined) {
        return headerAuth;
      }
      const body = record(await readJsonBody(request));
      const cliName = stringValue(body.cliName);
      if (cliName === undefined) {
        return jsonResponse({ ok: false, error: "cliName must be a non-empty string" }, 400);
      }
      const workspaceJson = record(body.workspaceJson);
      const payload = loadCliCapabilityPayload(cliName);
      const merged = mergeCliCapabilities(workspaceJson.cli_params, payload, conflictResolutions(body.resolutions));
      return jsonResponse({
        ok: true,
        added: merged.added,
        skipped: merged.skipped,
        conflicts: merged.conflicts,
        workspaceJson: { ...workspaceJson, cli_params: merged.cliParams },
      });
    }
  } catch (error) {
    return jsonResponse({ ok: false, error: errorMessage(error) }, 500);
  }

  return jsonResponse({ ok: false, error: "workspace UI route not found" }, 404);
}

function authorizeQueryToken(url: URL, backend: WorkspaceUiBackend): Response | undefined {
  if (url.searchParams.get("token") !== backend.token) {
    return jsonResponse({ ok: false, error: "forbidden" }, 403);
  }
  return undefined;
}

function authorizeHeaderToken(request: Request, backend: WorkspaceUiBackend): Response | undefined {
  if (request.headers.get("x-quailbot-workspace-ui-token") !== backend.token) {
    return jsonResponse({ ok: false, error: "forbidden" }, 403);
  }
  return undefined;
}

async function readJsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  return text.trim().length === 0 ? {} : (JSON.parse(text) as unknown);
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(`${JSON.stringify(value)}\n`, {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function conflictResolutions(value: unknown): Record<string, ConflictResolution> {
  const input = record(value);
  const output: Record<string, ConflictResolution> = {};
  for (const [key, resolution] of Object.entries(input)) {
    if (resolution === "existing" || resolution === "imported" || resolution === "skip") {
      output[key] = resolution;
    }
  }
  return output;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
