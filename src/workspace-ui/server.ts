import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import type { QuailbotRuntime } from "../extension.js";
import { findWorkspaceCaptureFrame, readWorkspaceCaptureBytes } from "./capture-frame.js";
import { workspaceUiClientJs } from "./client.js";
import { renderWorkspacePage } from "./page.js";
import { handleWorkspaceApi, type WorkspaceUiBackend } from "./routes.js";
import { workspaceUiCss } from "./styles.js";

export type WorkspaceUiServer = { url: string; token: string; close: () => Promise<void> };

export async function startWorkspaceUiServer(options: {
  cwd: string;
  runtime: QuailbotRuntime;
  refreshCaptureFrame?: WorkspaceUiBackend["refreshCaptureFrame"];
}): Promise<WorkspaceUiServer> {
  const token = randomBytes(24).toString("hex");
  const backend: WorkspaceUiBackend = { cwd: options.cwd, runtime: options.runtime, token, refreshCaptureFrame: options.refreshCaptureFrame };
  const nodeServer = createServer((request, response) => {
    void handleHttpRequest(request, response, backend);
  });

  const address = await listenOnFetchSafeLocalhost(nodeServer);

  const uiServer: WorkspaceUiServer = {
    url: `http://127.0.0.1:${address.port}`,
    token,
    close: () => closeServer(nodeServer),
  };
  options.runtime.workspaceUiServer = uiServer;
  return uiServer;
}

export async function ensureWorkspaceUiServer(runtime: QuailbotRuntime, cwd: string): Promise<WorkspaceUiServer> {
  if (runtime.workspaceUiServer !== undefined) {
    return runtime.workspaceUiServer;
  }
  return startWorkspaceUiServer({ cwd, runtime });
}

export async function stopWorkspaceUiServer(runtime: QuailbotRuntime): Promise<void> {
  const server = runtime.workspaceUiServer;
  runtime.workspaceUiServer = undefined;
  if (server !== undefined) {
    await server.close();
  }
}

async function handleHttpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  backend: WorkspaceUiBackend,
): Promise<void> {
  const url = requestUrl(request);
  let fetchResponse: Response;

  try {
    if (request.method === "GET" && url.pathname === "/") {
      fetchResponse = htmlResponse(renderWorkspacePage(backend.token));
    } else if (request.method === "GET" && url.pathname === "/assets/client.js") {
      fetchResponse = textResponse(workspaceUiClientJs, "text/javascript; charset=utf-8", assetStatus(url, backend.token));
    } else if (request.method === "GET" && url.pathname === "/assets/styles.css") {
      fetchResponse = textResponse(workspaceUiCss, "text/css; charset=utf-8", assetStatus(url, backend.token));
    } else if (request.method === "GET" && url.pathname === "/assets/workspace-capture") {
      fetchResponse = captureImageResponse(url, backend);
    } else if (url.pathname.startsWith("/api/")) {
      fetchResponse = await handleWorkspaceApi(await toFetchRequest(request, url), backend);
    } else {
      fetchResponse = textResponse("not found\n", "text/plain; charset=utf-8", 404);
    }
  } catch (error) {
    fetchResponse = textResponse(`${error instanceof Error ? error.message : String(error)}\n`, "text/plain; charset=utf-8", 500);
  }

  await writeResponse(response, fetchResponse);
}

function requestUrl(request: IncomingMessage): URL {
  return new URL(request.url ?? "/", "http://127.0.0.1");
}

async function toFetchRequest(request: IncomingMessage, url: URL): Promise<Request> {
  return new Request(url.href, {
    method: request.method,
    headers: requestHeaders(request),
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await readRequestBody(request),
  });
}

function requestHeaders(request: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }
  return headers;
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function writeResponse(response: ServerResponse, fetchResponse: Response): Promise<void> {
  response.statusCode = fetchResponse.status;
  fetchResponse.headers.forEach((value, key) => response.setHeader(key, value));
  response.end(Buffer.from(await fetchResponse.arrayBuffer()));
}

function htmlResponse(html: string): Response {
  return textResponse(html, "text/html; charset=utf-8", 200);
}

function textResponse(body: string, contentType: string, status: number): Response {
  return new Response(body, { status, headers: { "content-type": contentType } });
}

function binaryResponse(body: Uint8Array, contentType: string, status: number): Response {
  const payload = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
  return new Response(payload, { status, headers: { "content-type": contentType } });
}

function captureImageResponse(url: URL, backend: WorkspaceUiBackend): Response {
  const status = assetStatus(url, backend.token);
  if (status !== 200) {
    return textResponse("forbidden\n", "text/plain; charset=utf-8", status);
  }

  const frame = findWorkspaceCaptureFrame(backend.cwd);
  if (frame === undefined) {
    return textResponse("workspace capture image not found\n", "text/plain; charset=utf-8", 404);
  }

  return binaryResponse(readWorkspaceCaptureBytes(frame), frame.contentType, 200);
}

function assetStatus(url: URL, token: string): number {
  return url.searchParams.get("token") === token ? 200 : 403;
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
  1,
  7,
  9,
  11,
  13,
  15,
  17,
  19,
  20,
  21,
  22,
  23,
  25,
  37,
  42,
  43,
  53,
  69,
  77,
  79,
  87,
  95,
  101,
  102,
  103,
  104,
  109,
  110,
  111,
  113,
  115,
  117,
  119,
  123,
  135,
  137,
  139,
  143,
  161,
  179,
  389,
  427,
  465,
  512,
  513,
  514,
  515,
  526,
  530,
  531,
  532,
  540,
  548,
  554,
  556,
  563,
  587,
  601,
  636,
  989,
  990,
  993,
  995,
  1719,
  1720,
  1723,
  2049,
  3659,
  4045,
  4190,
  5060,
  5061,
  6000,
  6566,
  6665,
  6666,
  6667,
  6668,
  6669,
  6697,
  10080,
]);

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function isAddressInfo(address: string | AddressInfo | null): address is AddressInfo {
  return typeof address === "object" && address !== null && typeof address.port === "number";
}
