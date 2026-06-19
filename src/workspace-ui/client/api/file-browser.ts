import type { BrowseEntry } from "../actions.js";
import { jsonHeaders } from "./token.js";

export interface BrowseResponse { ok: boolean; entries?: BrowseEntry[]; resolved?: string; error?: string }
export interface LoadResponse { ok: boolean; path?: string; canonicalJson?: Record<string, unknown>; summary?: { path: string; hash: string }; error?: string }
export interface SaveResponse { ok: boolean; path?: string; hash?: string; error?: string; errors?: unknown[] }

export async function postBrowse(path: string): Promise<BrowseResponse> {
  const response = await fetch("/api/browse", { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ path }) });
  return (await response.json()) as BrowseResponse;
}

export async function postLoad(path: string): Promise<LoadResponse> {
  const response = await fetch("/api/load", { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ path }) });
  return (await response.json()) as LoadResponse;
}

export async function postSave(path: string, workspaceJson: Record<string, unknown>, updateCurrent: boolean): Promise<SaveResponse> {
  const response = await fetch("/api/save", { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ path, workspaceJson, updateCurrent }) });
  return (await response.json()) as SaveResponse;
}
