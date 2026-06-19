import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";

import type { QuailbotRuntime } from "../extension.js";
import { loadActiveWorkspace } from "../workspace/workspace-service.js";
import { declaredCliNamesForWorkspace } from "./shared/cli-import.js";
import { loadWorkspaceData, loadWorkspaceRaw } from "./shared/parse.js";
import { buildWorkspaceJson, stringifyWorkspaceJson } from "./shared/serialize.js";
import { captureVirtualScreen } from "./server/capture.js";
import { probeCliCapabilities } from "./server/cli-import.js";
import { browseDirectory, loadWorkspaceFile, saveWorkspaceFile } from "./server/file-browser.js";
import { buildAllowedRoots } from "./server/routes.js";

export interface WorkspaceUiServerHandle {
  url: string;
  token: string;
  close: () => Promise<void>;
}

export type WorkspaceUiServer = WorkspaceUiServerHandle;

type JsonRecord = Record<string, unknown>;

type ServerContext = {
  cwd: string;
  runtime: QuailbotRuntime;
  token: string;
  port: number;
};

export async function ensureWorkspaceUiServer(runtime: QuailbotRuntime, cwd: string): Promise<WorkspaceUiServerHandle> {
  if (runtime.workspaceUiServer !== undefined) {
    return runtime.workspaceUiServer;
  }

  const token = randomBytes(24).toString("hex");
  const context: ServerContext = { cwd, runtime, token, port: 0 };
  const nodeServer = createServer((request, response) => {
    void handleHttpRequest(request, response, context);
  });
  const address = await listenOnFetchSafeLocalhost(nodeServer);
  context.port = address.port;

  const handle: WorkspaceUiServerHandle = {
    url: `http://127.0.0.1:${address.port}`,
    token,
    close: () => closeServer(nodeServer),
  };
  runtime.workspaceUiServer = handle;
  return handle;
}

export async function stopWorkspaceUiServer(runtime: QuailbotRuntime): Promise<void> {
  const server = runtime.workspaceUiServer;
  runtime.workspaceUiServer = undefined;
  if (server !== undefined) {
    await server.close();
  }
}

async function handleHttpRequest(request: IncomingMessage, response: ServerResponse, context: ServerContext): Promise<void> {
  try {
    if (!isAllowedHost(request.headers.host, context.port)) {
      sendText(response, 403, "forbidden host\n", "text/plain; charset=utf-8");
      return;
    }

    const url = requestUrl(request);
    if (request.method === "GET" && url.pathname === "/") {
      sendText(response, 200, renderWorkspacePage(context.token), "text/html; charset=utf-8");
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/assets/")) {
      handleAssetRequest(url, response, context);
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      await handleApiRequest(request, response, url, context);
      return;
    }

    sendText(response, 404, "not found\n", "text/plain; charset=utf-8");
  } catch (error) {
    sendJson(response, 500, { ok: false, error: errorText(error) });
  }
}

function handleAssetRequest(url: URL, response: ServerResponse, context: ServerContext): void {
  if (url.searchParams.get("token") !== context.token) {
    sendText(response, 403, "forbidden\n", "text/plain; charset=utf-8");
    return;
  }

  if (url.pathname === "/assets/client.js") {
    sendDistAsset(response, join(process.cwd(), "dist", "workspace-ui", "client.js"), "text/javascript; charset=utf-8");
    return;
  }
  if (url.pathname === "/assets/client.js.map") {
    sendDistAsset(response, join(process.cwd(), "dist", "workspace-ui", "client.js.map"), "application/json; charset=utf-8");
    return;
  }
  if (url.pathname === "/assets/styles.css") {
    sendText(response, 200, workspaceUiCss, "text/css; charset=utf-8");
    return;
  }
  if (url.pathname === "/assets/workspace-capture") {
    handleCaptureAsset(url, response, context.cwd);
    return;
  }

  sendText(response, 404, "not found\n", "text/plain; charset=utf-8");
}

async function handleApiRequest(request: IncomingMessage, response: ServerResponse, url: URL, context: ServerContext): Promise<void> {
  if (!authorized(request, context.token)) {
    sendJson(response, 403, { ok: false, error: "forbidden" });
    return;
  }
  if (request.method !== "POST") {
    sendJson(response, 405, { ok: false, error: "method not allowed" });
    return;
  }

  const parsed = await parseJsonBody(request);
  if (!parsed.ok) {
    sendJson(response, 400, { ok: false, error: parsed.error });
    return;
  }

  const body = asRecord(parsed.body);
  switch (url.pathname) {
    case "/api/workspace":
      handleWorkspaceApi(response, context);
      return;
    case "/api/capture":
      handleCaptureApi(response, context.cwd);
      return;
    case "/api/browse":
      handleBrowseApi(response, context, body);
      return;
    case "/api/load":
      handleLoadApi(response, context, body);
      return;
    case "/api/save":
      handleSaveApi(response, context, body);
      return;
    case "/api/cli-import":
      handleCliImportApi(response, context, body);
      return;
    default:
      sendJson(response, 404, { ok: false, error: "not found" });
  }
}

function handleWorkspaceApi(response: ServerResponse, context: ServerContext): void {
  const workspace = currentWorkspaceSnapshot(context.runtime, context.cwd);
  if (!workspace.ok) {
    sendJson(response, 400, { ok: false, error: "no active workspace" });
    return;
  }
  sendJson(response, 200, {
    ok: true,
    workspaceJson: workspace.canonicalJson,
    canonicalJson: workspace.canonicalJson,
    summary: workspace.summary,
  });
}

function handleCaptureApi(response: ServerResponse, cwd: string): void {
  const result = captureVirtualScreen({ stateDir: join(cwd, ".quailbot-pi") });
  sendJson(response, 200, { ok: true, frame: result.frame, pngPath: result.pngPath });
}

function handleBrowseApi(response: ServerResponse, context: ServerContext, body: JsonRecord): void {
  const path = stringValue(body.path);
  if (path === null) {
    sendJson(response, 400, { ok: false, error: "path must be a non-empty string" });
    return;
  }
  const roots = allowedRootsForRequest(context);
  if (!roots.ok) {
    sendJson(response, 400, { ok: false, error: roots.error });
    return;
  }
  const result = browseDirectory(path, roots.roots);
  sendJson(response, result.ok ? 200 : 400, result);
}

function handleLoadApi(response: ServerResponse, context: ServerContext, body: JsonRecord): void {
  const path = stringValue(body.path);
  if (path === null) {
    sendJson(response, 400, { ok: false, error: "path must be a non-empty string" });
    return;
  }
  const roots = allowedRootsForRequest(context);
  if (!roots.ok) {
    sendJson(response, 400, { ok: false, error: roots.error });
    return;
  }
  const result = loadWorkspaceFile(path, roots.roots);
  sendJson(response, result.ok ? 200 : 400, result);
}

function handleSaveApi(response: ServerResponse, context: ServerContext, body: JsonRecord): void {
  const path = stringValue(body.path);
  if (path === null) {
    sendJson(response, 400, { ok: false, error: "path must be a non-empty string" });
    return;
  }
  if (!isRecord(body.workspaceJson)) {
    sendJson(response, 400, { ok: false, error: "workspaceJson must be a JSON object" });
    return;
  }
  const roots = allowedRootsForRequest(context);
  if (!roots.ok) {
    sendJson(response, 400, { ok: false, error: roots.error });
    return;
  }
  const result = saveWorkspaceFile({ targetPath: path, workspaceJson: body.workspaceJson, roots: roots.roots });
  sendJson(response, result.ok ? 200 : result.errors ? 422 : 400, result);
}

function handleCliImportApi(response: ServerResponse, context: ServerContext, body: JsonRecord): void {
  const cliName = stringValue(body.cliName) ?? "";
  const workspace = currentWorkspaceSnapshot(context.runtime, context.cwd);
  if (!workspace.ok) {
    sendJson(response, 400, { ok: false, usedSubcommand: "", error: "no active workspace" });
    return;
  }
  const declaredCliNames = declaredCliNamesForWorkspace({
    cliName: workspace.data.cliName,
    cliParams: workspace.data.cliParams,
    cli_params: workspace.canonicalJson.cli_params,
    tools: workspace.canonicalJson.tools,
  });
  const result = probeCliCapabilities({ cliName, declaredCliNames });
  sendJson(response, result.ok ? 200 : 400, result);
}

function handleCaptureAsset(url: URL, response: ServerResponse, cwd: string): void {
  const requestedId = url.searchParams.get("captureId") ?? "";
  const stateDir = join(cwd, ".quailbot-pi");
  const metadataPath = join(stateDir, "workspace-capture.metadata.json");
  const pngPath = join(stateDir, "workspace-capture.png");
  if (!requestedId || !existsSync(metadataPath) || !existsSync(pngPath)) {
    sendText(response, 404, "workspace capture image not found\n", "text/plain; charset=utf-8");
    return;
  }
  const metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as { captureId?: unknown };
  if (metadata.captureId !== requestedId) {
    sendText(response, 404, "workspace capture image not found\n", "text/plain; charset=utf-8");
    return;
  }
  sendBinary(response, 200, readFileSync(pngPath), "image/png");
}

function currentWorkspaceSnapshot(runtime: QuailbotRuntime, cwd: string):
  | {
      ok: true;
      path: string;
      raw: JsonRecord;
      data: ReturnType<typeof loadWorkspaceData>;
      canonicalJson: JsonRecord;
      summary: { path: string; hash: string };
    }
  | { ok: false; error: string } {
  try {
    const path = runtime.activeWorkspace?.selection.path ?? loadActiveWorkspace({ cwd }).selection.path;
    const raw = loadWorkspaceRaw(readFileSync(path, "utf8"));
    const data = loadWorkspaceData(raw);
    const canonicalJson = buildWorkspaceJson({ raw, ...data });
    const canonicalText = stringifyWorkspaceJson(canonicalJson);
    return {
      ok: true,
      path,
      raw,
      data,
      canonicalJson,
      summary: { path, hash: createHash("sha256").update(canonicalText).digest("hex") },
    };
  } catch (error) {
    return { ok: false, error: errorText(error) };
  }
}

function allowedRootsForRequest(context: ServerContext): { ok: true; roots: ReturnType<typeof buildAllowedRoots> } | { ok: false; error: string } {
  const workspace = currentWorkspaceSnapshot(context.runtime, context.cwd);
  if (!workspace.ok) {
    return { ok: false, error: "no active workspace" };
  }
  try {
    return { ok: true, roots: buildAllowedRoots(workspace.path, context.cwd) };
  } catch (error) {
    return { ok: false, error: errorText(error) };
  }
}

function renderWorkspacePage(token: string): string {
  const encoded = encodeURIComponent(token);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="quailbot-workspace-ui-token" content="${escapeHtml(token)}">
    <title>Quailbot Workspace Calibrator</title>
    <link rel="stylesheet" href="/assets/styles.css?token=${encoded}">
  </head>
  <body>
    <main class="workspace-ui-shell" data-workspace-ui-root>
      <section class="workspace-pane workspace-pane-canvas" data-canvas-root id="canvas-root"></section>
      <section class="workspace-pane workspace-pane-items">
        <div data-items-tree-root></div>
        <div data-filter-root></div>
      </section>
      <section class="workspace-pane workspace-pane-form" data-form-root></section>
      <section data-cli-import-modal-root></section>
      <section data-file-browser-modal-root></section>
    </main>
    <script>window.__quailbotToken = document.querySelector('meta[name="quailbot-workspace-ui-token"]')?.content || "";</script>
    <script src="/assets/client.js?token=${encoded}"></script>
  </body>
</html>
`;
}

const workspaceUiCss = `
html, body {
  box-sizing: border-box;
  height: 100%;
  margin: 0;
  font-family: system-ui, sans-serif;
}
*, *::before, *::after { box-sizing: inherit; }
.workspace-ui-shell {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  grid-template-areas: "canvas items form";
  gap: 8px;
  height: 100dvh;
  overflow: hidden;
  padding: 8px;
  background: #101316;
  color: #e8edf2;
}
.workspace-pane { min-width: 0; min-height: 0; overflow: auto; border: 1px solid #2f3b45; border-radius: 4px; background: #182027; padding: 8px; }
.workspace-pane-canvas { grid-area: canvas; min-width: 600px; }
.workspace-pane-items { grid-area: items; width: 260px; min-width: 260px; }
.workspace-pane-form { grid-area: form; min-width: 360px; }
button, input, select, textarea { font: inherit; }
`;

function sendDistAsset(response: ServerResponse, path: string, contentType: string): void {
  if (!existsSync(path)) {
    sendText(response, 500, "client bundle missing; run `npm run build`\n", "text/plain; charset=utf-8");
    return;
  }
  sendBinary(response, 200, readFileSync(path), contentType);
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function sendText(response: ServerResponse, statusCode: number, body: string, contentType: string): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", contentType);
  response.end(body);
}

function sendBinary(response: ServerResponse, statusCode: number, body: Buffer, contentType: string): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", contentType);
  response.end(body);
}

async function parseJsonBody(request: IncomingMessage): Promise<{ ok: true; body: unknown } | { ok: false; error: string }> {
  const text = await readRequestBody(request);
  if (text.trim().length === 0) {
    return { ok: true, body: {} };
  }
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, error: "invalid JSON body" };
  }
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function requestUrl(request: IncomingMessage): URL {
  return new URL(request.url ?? "/", "http://127.0.0.1");
}

function authorized(request: IncomingMessage, token: string): boolean {
  return request.headers["x-quailbot-workspace-ui-token"] === token || request.headers["x-quailbot-token"] === token;
}

function isAllowedHost(host: string | undefined, port: number): boolean {
  const normalized = (host ?? "").toLowerCase();
  return normalized === `127.0.0.1:${port}` || normalized === `localhost:${port}`;
}

function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function listenOnLocalhost(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

async function listenOnFetchSafeLocalhost(server: Server): Promise<AddressInfo> {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    await listenOnLocalhost(server);
    const address = server.address();
    if (!isAddressInfo(address)) {
      await closeServer(server);
      continue;
    }
    if (!isWorkspaceUiFetchBlockedPort(address.port)) {
      return address;
    }
    await closeServer(server);
  }
  throw new Error("workspace UI server could not bind to a browser-fetch-safe TCP port");
}

export function isWorkspaceUiFetchBlockedPort(port: number): boolean {
  return FETCH_BLOCKED_PORTS.has(port);
}

const FETCH_BLOCKED_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103,
  104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514,
  515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049,
  3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6697, 10080,
]);

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function isAddressInfo(address: string | AddressInfo | null): address is AddressInfo {
  return typeof address === "object" && address !== null && typeof address.port === "number";
}
