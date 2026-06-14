import { existsSync, lstatSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

import { loadActiveWorkspace, validateWorkspaceJson, writeWorkspaceJson } from "../workspace/workspace-service.js";
import type { QuailbotRuntime } from "../extension.js";
import { findWorkspaceCaptureFrame } from "./capture-frame.js";
import { loadCliCapabilityPayload, mergeCliCapabilities, type ConflictResolution } from "./cli-import.js";
import { createWorkspaceDraft, serializeWorkspaceDraft } from "./draft.js";

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
      const captureFrame = findWorkspaceCaptureFrame(backend.cwd);
      return jsonResponse({
        ok: true,
        summary: active.summary,
        ...(captureFrame !== undefined
          ? {
              captureFrame: {
                href: `/assets/workspace-capture?token=${encodeURIComponent(backend.token)}`,
                imageWidth: captureFrame.imageWidth,
                imageHeight: captureFrame.imageHeight,
                contentType: captureFrame.contentType,
              },
            }
          : {}),
        workspaceJson: serializeWorkspaceDraft(createWorkspaceDraft(JSON.parse(readFileSync(active.selection.path, "utf8")) as unknown)),
      });
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
      const target = resolve(backend.cwd, targetPath);
      const targetAuth = authorizeWorkspaceTarget(target, backend);
      if (targetAuth !== undefined) {
        return targetAuth;
      }

      const result = writeWorkspaceJson({ workspaceJson: body.workspaceJson, targetPath: target, cwd: backend.cwd });
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
      const target = resolve(backend.cwd, targetPath);
      const targetAuth = authorizeWorkspaceTarget(target, backend);
      if (targetAuth !== undefined) {
        return targetAuth;
      }

      backend.runtime.pendingWorkspaceActivation = { targetPath: target, expectedHash };
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
      if (!declaredCliNames(workspaceJson).has(cliName)) {
        return jsonResponse({ ok: false, error: `cliName must be declared by the workspace before import: ${cliName}` }, 400);
      }
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

function authorizeWorkspaceTarget(targetPath: string, backend: WorkspaceUiBackend): Response | undefined {
  const target = resolve(backend.cwd, targetPath);
  const stateRoot = resolve(backend.cwd, ".quailbot-pi");
  if (isSubpathOrSame(target, stateRoot) && !hasSymlinkedPathSegment(target, stateRoot)) {
    return undefined;
  }

  try {
    const active = loadActiveWorkspace({ cwd: backend.cwd });
    if (samePath(target, active.selection.path)) {
      return undefined;
    }
  } catch {
    // No active workspace is available yet; only the Quailbot state directory is writable from the browser UI.
  }

  return jsonResponse(
    { ok: false, error: "targetPath is outside the active workspace and Quailbot state directory" },
    403,
  );
}

function samePath(left: string, right: string): boolean {
  return normalizePath(resolve(left)) === normalizePath(resolve(right));
}

function isSubpathOrSame(child: string, parent: string): boolean {
  const normalizedChild = normalizePath(resolve(child));
  const normalizedParent = normalizePath(resolve(parent));
  const childRelativeToParent = relative(normalizedParent, normalizedChild);
  return childRelativeToParent === "" || (!childRelativeToParent.startsWith("..") && !isAbsolute(childRelativeToParent));
}

function hasSymlinkedPathSegment(target: string, root: string): boolean {
  const pathFromRoot = relative(resolve(root), resolve(target));
  if (pathFromRoot === "" || pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) {
    return false;
  }

  let current = resolve(root);
  for (const segment of pathFromRoot.split(/[\\/]+/).filter((part) => part.length > 0)) {
    current = resolve(current, segment);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
      return true;
    }
  }

  return false;
}

function normalizePath(path: string): string {
  return process.platform === "win32" ? path.toLowerCase() : path;
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

function declaredCliNames(workspaceJson: JsonRecord): Set<string> {
  const cliParams = record(workspaceJson.cli_params);
  const names = new Set<string>();
  addCliName(names, cliParams.cli_name);
  addCliName(names, cliParams.CLI_Name);
  collectItemCliNames(names, record(cliParams.parameters).items);
  collectItemCliNames(names, record(cliParams.action_commands).items);
  return names;
}

function collectItemCliNames(names: Set<string>, items: unknown): void {
  if (!Array.isArray(items)) {
    return;
  }
  for (const item of items) {
    if (isRecord(item)) {
      addCliName(names, item.cli_name);
      addCliName(names, item.CLI_Name);
    }
  }
}

function addCliName(names: Set<string>, value: unknown): void {
  if (typeof value === "string" && value.trim().length > 0) {
    names.add(value.trim());
  }
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
