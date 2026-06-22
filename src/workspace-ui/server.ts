import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const CLIENT_BUNDLE_PATH = resolveClientBundlePath("client.js");
const CLIENT_BUNDLE_MAP_PATH = resolveClientBundlePath("client.js.map");
const CLI_NAME_PATTERN = /^[A-Za-z0-9_.-]+$/;
const CAPTURE_ID_PATTERN = /^[a-f0-9]{16}$/;

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
    if (request.method === "GET" && url.pathname === "/favicon.ico") {
      sendNoContent(response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/") {
      if (url.searchParams.get("token") !== context.token) {
        sendText(response, 403, "forbidden\n", "text/plain; charset=utf-8");
        return;
      }
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
    sendDistAsset(response, CLIENT_BUNDLE_PATH, "text/javascript; charset=utf-8");
    return;
  }
  if (url.pathname === "/assets/client.js.map") {
    sendDistAsset(response, CLIENT_BUNDLE_MAP_PATH, "application/json; charset=utf-8");
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
  try {
    const result = captureVirtualScreen({ stateDir: join(cwd, ".quailbot-pi") });
    sendJson(response, 200, { ok: true, frame: result.frame, pngPath: result.pngPath });
  } catch {
    sendJson(response, 200, {
      ok: false,
      error: "Screen capture unavailable. Check desktop capture permissions and try Refresh screenshot again.",
    });
  }
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
  for (const name of bodyDeclaredCliNames(body)) {
    declaredCliNames.add(name);
  }
  const result = probeCliCapabilities({ cliName, declaredCliNames });
  sendJson(response, result.ok ? 200 : 400, result);
}

function bodyDeclaredCliNames(body: JsonRecord): string[] {
  const value = body.declaredCliNames;
  if (!Array.isArray(value)) {
    return [];
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const name = item.trim();
    if (!CLI_NAME_PATTERN.test(name) || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

function handleCaptureAsset(url: URL, response: ServerResponse, cwd: string): void {
  const requestedId = url.searchParams.get("captureId") ?? "";
  if (!CAPTURE_ID_PATTERN.test(requestedId)) {
    sendText(response, 404, "workspace capture image not found\n", "text/plain; charset=utf-8");
    return;
  }
  const stateDir = join(cwd, ".quailbot-pi");
  const versionedPngPath = join(stateDir, `workspace-capture.${requestedId}.png`);
  if (existsSync(versionedPngPath)) {
    sendBinary(response, 200, readFileSync(versionedPngPath), "image/png");
    return;
  }
  const metadataPath = join(stateDir, "workspace-capture.metadata.json");
  const pngPath = join(stateDir, "workspace-capture.png");
  if (!existsSync(metadataPath) || !existsSync(pngPath)) {
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
      <nav class="workspace-menu-bar" data-menu-root></nav>
      <section data-startup-banner-root></section>
      <section class="workspace-pane workspace-pane-canvas" data-canvas-root id="canvas-root"></section>
      <section class="workspace-pane workspace-pane-items">
        <div data-items-tree-root></div>
        <div data-filter-root></div>
        <div data-workspace-toolbar-root></div>
      </section>
      <section class="workspace-pane workspace-pane-form" data-form-root></section>
      <section data-cli-import-modal-root></section>
      <section data-file-browser-modal-root></section>
      <section data-help-modal-root></section>
      <section data-confirm-modal-root></section>
      <section data-notice-modal-root></section>
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
  grid-template-columns: minmax(420px, 1fr) minmax(360px, 500px) minmax(360px, 1fr);
  grid-template-rows: auto auto minmax(0, 1fr);
  grid-template-areas:
    "menu menu menu"
    "startup startup startup"
    "canvas items form";
  gap: 8px;
  height: 100dvh;
  overflow: hidden;
  padding: 8px;
  background: #d9d9d9;
  color: #111;
}
.workspace-menu-bar {
  grid-area: menu;
  display: flex;
  align-items: center;
  gap: 0;
  min-width: 0;
  padding: 2px 4px;
  border: 1px solid #b8b8b8;
  border-radius: 4px;
  background: #f2f2f2;
  overflow: visible;
}
.workspace-menu-group {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.workspace-menu-bar button {
  padding: 2px 8px;
}
.workspace-menu-group > button[data-action="menu-toggle"] {
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #111;
}
.workspace-menu-group > button[data-action="menu-toggle"]:hover,
.workspace-menu-group > button[data-action="menu-toggle"]:focus,
.workspace-menu-group > button[data-action="menu-toggle"][aria-expanded="true"] {
  background: #dcdcdc;
}
.workspace-menu-popup {
  position: absolute;
  left: 0;
  top: calc(100% + 2px);
  z-index: 20;
  display: grid;
  min-width: 180px;
  padding: 3px;
  border: 1px solid #8f8f8f;
  background: #f2f2f2;
  box-shadow: 0 4px 12px rgb(0 0 0 / 0.18);
}
.workspace-menu-popup[hidden] { display: none; }
.workspace-menu-popup button {
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
}
.workspace-menu-popup button:hover,
.workspace-menu-popup button:focus {
  background: #2f68a3;
  color: #fff;
}
.workspace-path-status {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin-left: auto;
  padding-left: 16px;
  color: #333;
  font-size: 0.9rem;
  line-height: 1.2;
  overflow: hidden;
}
.workspace-path-file {
  flex: 0 0 auto;
  font-weight: 600;
}
.workspace-path-full {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
[data-startup-banner-root] { grid-area: startup; min-width: 0; }
.startup-error-banner { padding: 4px 8px; border: 1px solid #c8a300; background: #fff4b8; color: #111; }
.workspace-pane { min-width: 0; min-height: 0; overflow: auto; border: 1px solid #b8b8b8; border-radius: 4px; background: #efefef; padding: 8px; }
.workspace-pane-canvas { grid-area: canvas; min-width: 0; background: #111; color: #f4f4f4; }
.workspace-pane-items { grid-area: items; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.workspace-pane-form { grid-area: form; min-width: 0; }
button, input, select, textarea { font: inherit; }
.items-tree { min-height: 0; overflow: auto; }
.tree-list { list-style: none; margin: 0; padding: 0; }
.tree-row { display: grid; grid-template-columns: auto auto minmax(0, 1fr); align-items: baseline; gap: 4px; min-height: 22px; padding: 1px 2px; white-space: nowrap; cursor: default; }
.tree-row--selected { background: #2f68a3; color: #fff; }
.tree-row--active:not(.tree-row--selected) { outline: 1px solid #6f8ead; outline-offset: -1px; }
.tree-depth-guides { align-self: stretch; display: grid; grid-auto-columns: 16px; grid-auto-flow: column; min-height: 22px; }
.tree-depth-guide { position: relative; }
.tree-depth-guide::before { content: ""; position: absolute; left: 8px; top: -3px; bottom: -3px; border-left: 1px solid #c5cbd3; }
.tree-row--selected .tree-depth-guide::before { border-left-color: rgb(255 255 255 / 0.45); }
.tree-toggle { flex: 0 0 auto; border: 0; background: transparent; color: inherit; padding: 0 2px; line-height: inherit; cursor: default; }
.tree-toggle:disabled { color: inherit; opacity: 1; }
.tree-body { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.filter-panel { display: grid; gap: 6px; }
.filter-header { font-weight: 600; }
.filter-tags { display: grid; gap: 4px; max-height: 100px; overflow: auto; }
.filter-tag { display: flex; align-items: center; gap: 4px; }
.filter-keyword-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; gap: 6px; align-items: center; }
.filter-keyword { min-width: 0; }
.workspace-toolbar { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.toolbar-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 6px; align-items: stretch; }
.toolbar-grid button { width: 100%; min-width: 0; white-space: normal; line-height: 1.2; }
.toolbar-row-span { grid-column: 1 / -1; }
.toolbar-label { display: contents; }
.toolbar-label span { align-self: center; }
.toolbar-label input { min-width: 0; padding: 2px 4px; border: 1px solid #8a949e; background: #fff; color: #111; }
.toolbar-check { display: flex; gap: 6px; align-items: center; }
.toolbar-fieldset { min-width: 0; margin: 2px 0 0; padding: 8px; border: 1px solid #c4c4c4; }
.toolbar-fieldset legend { padding: 0 4px; }
.toolbar-stack { display: grid; gap: 6px; }
.toolbar-stack button { width: 100%; }
.cli-import-error { color: #9f1d12; margin: 0; font-size: 0.9rem; }
.selected-form { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.selected-form h2, .selected-form h3 { margin: 0 0 4px; font-size: 1rem; }
.form-empty { margin: 0; }
.form-grid { display: grid; gap: 6px; }
.form-row { display: grid; grid-template-columns: 145px minmax(0, 1fr); gap: 8px; align-items: start; margin: 0; }
.form-row > span { padding-top: 3px; }
.form-row input, .form-row select, .form-row textarea { min-width: 0; width: 100%; }
.form-row textarea { min-height: 5rem; resize: vertical; }
.linked-frame, .cli-meta-block { display: grid; gap: 8px; min-width: 0; padding: 8px; border: 1px solid #c4c4c4; border-radius: 4px; }
.linked-picker-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; }
.linked-list { min-height: 6rem; max-height: 6rem; overflow: auto; margin: 0; padding: 4px; list-style: none; border: 1px solid #b8b8b8; background: #fff; color: #111; }
.linked-list li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; align-items: center; }
.linked-hint { margin: 0; color: #333; }
.cli-actions-display { display: flex; gap: 12px; align-items: center; margin: 0; padding: 6px 8px; border: 1px solid #c4c4c4; }
.cli-actions-display__item { display: inline-flex; align-items: center; gap: 3px; }
.cli-meta-block .form-row textarea { min-height: 4.5rem; }
.cli-meta-payload-preview { max-height: 22rem; overflow: auto; margin: 0; padding: 8px; border: 1px solid #c4c4c4; background: #111; color: #f4f4f4; font-size: 0.85rem; }
.help-backdrop {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(0 0 0 / 0.45);
  z-index: 1000;
}
.help-dialog {
  max-width: min(640px, 100%);
  max-height: min(720px, 100%);
  overflow: auto;
  border: 1px solid #657482;
  border-radius: 4px;
  background: #f7f7f7;
  color: #111;
  box-shadow: 0 20px 60px rgb(0 0 0 / 0.35);
}
.help-dialog header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border-bottom: 1px solid #c8ced4;
}
.help-dialog h2 {
  margin: 0;
  font-size: 1rem;
}
.help-dialog pre {
  margin: 0;
  padding: 12px;
  white-space: pre-wrap;
  font-family: inherit;
}
.confirm-backdrop {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(0 0 0 / 0.35);
  z-index: 1100;
}
.confirm-dialog {
  width: min(420px, 100%);
  border: 1px solid #657482;
  border-radius: 4px;
  background: #f7f7f7;
  color: #111;
  box-shadow: 0 20px 60px rgb(0 0 0 / 0.35);
}
.confirm-dialog h2 {
  margin: 0;
  padding: 10px 12px;
  border-bottom: 1px solid #c8ced4;
  font-size: 1rem;
}
.confirm-dialog-message {
  margin: 0;
  padding: 18px 12px;
}
.confirm-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid #d4d4d4;
}
.confirm-dialog-actions button {
  min-width: 80px;
}
.notice-backdrop {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(0 0 0 / 0.35);
  z-index: 1200;
}
.notice-dialog {
  width: min(460px, 100%);
  border: 1px solid #657482;
  border-radius: 4px;
  background: #f7f7f7;
  color: #111;
  box-shadow: 0 20px 60px rgb(0 0 0 / 0.35);
}
.notice-dialog h2 {
  margin: 0;
  padding: 10px 12px;
  border-bottom: 1px solid #c8ced4;
  font-size: 1rem;
}
.notice-dialog-message {
  margin: 0;
  padding: 18px 12px;
  white-space: pre-wrap;
}
.notice-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid #d4d4d4;
}
.notice-dialog-actions button {
  min-width: 80px;
}
.file-browser-backdrop {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 0.35);
  z-index: 1050;
}
.file-browser-modal {
  position: fixed;
  left: 50%;
  top: 50%;
  z-index: 1051;
  display: grid;
  gap: 10px;
  width: min(720px, calc(100vw - 48px));
  max-height: min(760px, calc(100vh - 48px));
  overflow: auto;
  transform: translate(-50%, -50%);
  padding: 12px;
  border: 1px solid #657482;
  border-radius: 4px;
  background: #f7f7f7;
  color: #111;
  box-shadow: 0 20px 60px rgb(0 0 0 / 0.35);
}
.file-browser-modal h2,
.file-browser-path {
  margin: 0;
}
.file-browser-path {
  overflow-wrap: anywhere;
  color: #333;
}
.file-browser-entries {
  min-height: 10rem;
  max-height: min(22rem, 45vh);
  overflow: auto;
  margin: 0;
  padding: 4px;
  border: 1px solid #b8b8b8;
  background: #fff;
  list-style: none;
}
.file-browser-entries li + li {
  margin-top: 2px;
}
.file-browser-entries button {
  width: 100%;
  min-width: 0;
  text-align: left;
}
.file-browser-entries button[aria-selected="true"] {
  background: #2f68a3;
  color: #fff;
}
.file-browser-filename-row {
  display: grid;
  grid-template-columns: 90px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
}
.file-browser-filename-row input {
  min-width: 0;
  width: 100%;
}
.file-browser-error {
  margin: 0;
  color: #9f1d12;
}
.file-browser-controls {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.file-browser-controls button {
  min-width: 80px;
}
@media (max-width: 1180px) {
  .workspace-ui-shell {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto minmax(280px, 45vh) minmax(320px, auto) minmax(360px, auto);
    grid-template-areas:
      "menu"
      "startup"
      "canvas"
      "items"
      "form";
    overflow: auto;
  }
  .workspace-pane {
    min-width: 0;
  }
  .workspace-pane-canvas {
    min-height: 280px;
  }
  .workspace-pane-items {
    min-height: 320px;
  }
  .workspace-pane-form {
    min-height: 360px;
  }
}
`;

function sendDistAsset(response: ServerResponse, path: string, contentType: string): void {
  if (!existsSync(path)) {
    sendText(response, 500, "client bundle missing; run `npm run build`\n", "text/plain; charset=utf-8");
    return;
  }
  sendBinary(response, 200, readFileSync(path), contentType);
}

function resolveClientBundlePath(fileName: string): string {
  const compiledLayout = join(SERVER_DIR, "..", "..", "workspace-ui", fileName);
  if (existsSync(compiledLayout)) {
    return compiledLayout;
  }
  return join(SERVER_DIR, "..", "..", "dist", "workspace-ui", fileName);
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("cache-control", "no-store");
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function sendText(response: ServerResponse, statusCode: number, body: string, contentType: string): void {
  response.statusCode = statusCode;
  response.setHeader("cache-control", "no-store");
  response.setHeader("content-type", contentType);
  response.end(body);
}

function sendBinary(response: ServerResponse, statusCode: number, body: Buffer, contentType: string): void {
  response.statusCode = statusCode;
  response.setHeader("cache-control", "no-store");
  response.setHeader("content-type", contentType);
  response.end(body);
}

function sendNoContent(response: ServerResponse): void {
  response.statusCode = 204;
  response.setHeader("cache-control", "no-store");
  response.end();
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
