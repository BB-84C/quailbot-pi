import type { CaptureFrame } from "../../shared/geometry.js";
import { jsonHeaders } from "./token.js";

export type WorkspaceFetchResponse =
  | { ok: true; canonicalJson: Record<string, unknown>; summary: { path: string; hash: string } }
  | { ok: false; error: string };

export type CaptureFetchResponse = { ok: true; frame: CaptureFrame } | { ok: false; error: string };

export async function postFetchWorkspace(): Promise<WorkspaceFetchResponse> {
  const response = await fetch("/api/workspace", { method: "POST", headers: jsonHeaders(), body: "{}" });
  return (await response.json()) as WorkspaceFetchResponse;
}

export async function postCapture(): Promise<CaptureFetchResponse> {
  const response = await fetch("/api/capture", { method: "POST", headers: jsonHeaders(), body: "{}" });
  return (await response.json()) as CaptureFetchResponse;
}
