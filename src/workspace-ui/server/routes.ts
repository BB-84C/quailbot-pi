import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdirSync, realpathSync } from "node:fs";
import { dirname, parse } from "node:path";

import { quailbotStateRoot } from "../../workspace/workspace-state.js";
import { probeCliCapabilities } from "./cli-import.js";
import { browseDirectory, loadWorkspaceFile, saveWorkspaceFile } from "./file-browser.js";
import type { AllowedRoots } from "./path-policy.js";

export type DeclaredCliNamesProvider = () => ReadonlySet<string> | Promise<ReadonlySet<string>>;

export interface FileBrowserRouteContext {
  token: string;
  currentWorkspacePath: string;
  cwd: string;
}

export function buildAllowedRoots(currentWorkspacePath: string, cwd: string): AllowedRoots {
  const statePath = quailbotStateRoot(cwd);
  mkdirSync(statePath, { recursive: true });
  const realCwd = realpathSync(cwd);
  return {
    workspaceDir: realpathSync(dirname(realpathSync(currentWorkspacePath))),
    stateDir: realpathSync(statePath),
    extraRoots: [realCwd, realpathSync(parse(realCwd).root)],
  };
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function authorized(req: IncomingMessage, token: string): boolean {
  return req.headers["x-quailbot-token"] === token || req.headers["x-quailbot-workspace-ui-token"] === token;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export async function handleCliImportRequest(req: IncomingMessage, res: ServerResponse, declaredCliNamesProvider: DeclaredCliNamesProvider): Promise<boolean> {
  if (req.method !== "POST" || req.url?.split("?")[0] !== "/api/cli-import") {
    return false;
  }
  let body: unknown;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    sendJson(res, 400, { ok: false, usedSubcommand: "", error: "invalid JSON body" });
    return true;
  }
  const cliName = body !== null && typeof body === "object" && !Array.isArray(body) ? String((body as Record<string, unknown>).cliName ?? "") : "";
  const declaredCliNames = await declaredCliNamesProvider();
  const result = probeCliCapabilities({ cliName, declaredCliNames });
  sendJson(res, result.ok ? 200 : 400, result);
  return true;
}

export async function handleFileBrowserRequest(req: IncomingMessage, res: ServerResponse, context: FileBrowserRouteContext): Promise<boolean> {
  const route = req.url?.split("?")[0] ?? "";
  if (req.method !== "POST" || !["/api/browse", "/api/load", "/api/save"].includes(route)) {
    return false;
  }
  if (!authorized(req, context.token)) {
    sendJson(res, 403, { ok: false, error: "forbidden" });
    return true;
  }
  let body: Record<string, unknown>;
  try {
    body = record(JSON.parse(await readBody(req)));
  } catch {
    sendJson(res, 400, { ok: false, error: "invalid JSON body" });
    return true;
  }
  const targetPath = stringValue(body.path);
  if (!targetPath) {
    sendJson(res, 400, { ok: false, error: "path must be a non-empty string" });
    return true;
  }
  let roots: AllowedRoots;
  try {
    roots = buildAllowedRoots(context.currentWorkspacePath, context.cwd);
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
    return true;
  }
  if (route === "/api/browse") {
    const result = browseDirectory(targetPath, roots);
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }
  if (route === "/api/load") {
    const result = loadWorkspaceFile(targetPath, roots);
    sendJson(res, result.ok ? 200 : 400, result);
    return true;
  }
  const workspaceJson = body.workspaceJson;
  if (workspaceJson === null || typeof workspaceJson !== "object" || Array.isArray(workspaceJson)) {
    sendJson(res, 400, { ok: false, error: "workspaceJson must be a JSON object" });
    return true;
  }
  const result = saveWorkspaceFile({ targetPath, workspaceJson: workspaceJson as Record<string, unknown>, roots });
  sendJson(res, result.ok ? 200 : result.errors ? 422 : 400, result);
  return true;
}
