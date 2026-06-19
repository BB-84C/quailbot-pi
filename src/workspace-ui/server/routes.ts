import type { IncomingMessage, ServerResponse } from "node:http";

import { probeCliCapabilities } from "./cli-import.js";

export type DeclaredCliNamesProvider = () => ReadonlySet<string> | Promise<ReadonlySet<string>>;

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
