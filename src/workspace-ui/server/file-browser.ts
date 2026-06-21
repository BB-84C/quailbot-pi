import { closeSync, existsSync, fsyncSync, openSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { randomBytes, createHash } from "node:crypto";

import { loadWorkspaceData, loadWorkspaceRaw } from "../shared/parse.js";
import { buildWorkspaceJson, stringifyWorkspaceJson } from "../shared/serialize.js";
import { validateAndNormalizeForSave } from "../shared/validate.js";
import type { AllowedRoots } from "./path-policy.js";
import { resolvePathUnderRoots, resolveWritablePathUnderRoots } from "./path-policy.js";

export interface BrowseEntry { name: string; kind: "dir" | "file"; path: string }
export type BrowseResult = { ok: true; entries: BrowseEntry[]; resolved: string } | { ok: false; error: string };

function hash16(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function browseDirectory(targetPath: string, roots: AllowedRoots): BrowseResult {
  const resolved = resolvePathUnderRoots(targetPath, roots);
  if (!resolved.ok) return resolved;
  try {
    if (!statSync(resolved.resolved).isDirectory()) {
      return { ok: false, error: "path is not a directory" };
    }
    const entries: BrowseEntry[] = [];
    for (const dirent of readdirSync(resolved.resolved, { withFileTypes: true })) {
      if (dirent.name === ".quailbot-pi" || dirent.name === "node_modules") continue;
      const entryPath = join(resolved.resolved, dirent.name);
      if (dirent.isDirectory()) {
        entries.push({ name: dirent.name, kind: "dir", path: entryPath });
      } else if (dirent.isFile() && extname(dirent.name).toLowerCase() === ".json") {
        entries.push({ name: dirent.name, kind: "file", path: entryPath });
      }
    }
    entries.sort((a, b) => (a.kind === b.kind ? a.name.toLowerCase().localeCompare(b.name.toLowerCase()) : a.kind === "dir" ? -1 : 1));
    return { ok: true, entries, resolved: resolved.resolved };
  } catch (error) {
    return { ok: false, error: errorText(error) };
  }
}

export interface LoadWorkspaceResult {
  ok: true;
  path: string;
  canonicalJson: Record<string, unknown>;
  summary: { path: string; hash: string };
}
export type LoadWorkspaceFailure = { ok: false; error: string };

export function loadWorkspaceFile(targetPath: string, roots: AllowedRoots): LoadWorkspaceResult | LoadWorkspaceFailure {
  const resolved = resolvePathUnderRoots(targetPath, roots);
  if (!resolved.ok) return resolved;
  try {
    if (!statSync(resolved.resolved).isFile()) return { ok: false, error: "path is not a file" };
    if (extname(resolved.resolved).toLowerCase() !== ".json") return { ok: false, error: "workspace file must be .json" };
    const text = readFileSync(resolved.resolved, "utf8");
    const canonicalJson = loadWorkspaceRaw(text);
    return { ok: true, path: resolved.resolved, canonicalJson, summary: { path: resolved.resolved, hash: hash16(text) } };
  } catch (error) {
    return { ok: false, error: errorText(error) };
  }
}

export interface SaveWorkspaceArgs { targetPath: string; workspaceJson: Record<string, unknown>; roots: AllowedRoots }
export interface SaveWorkspaceResult { ok: true; path: string; hash: string }
export type SaveWorkspaceFailure = { ok: false; error: string; errors?: unknown[] };

export function saveWorkspaceFile(args: SaveWorkspaceArgs): SaveWorkspaceResult | SaveWorkspaceFailure {
  if (!isRecord(args.workspaceJson)) return { ok: false, error: "workspaceJson must be a JSON object" };
  const resolved = resolveWritablePathUnderRoots(args.targetPath, args.roots);
  if (!resolved.ok) return resolved;
  let tmpPath = "";
  try {
    const raw = loadWorkspaceRaw(stringifyWorkspaceJson(args.workspaceJson));
    const drafts = loadWorkspaceData(raw);
    const validation = validateAndNormalizeForSave(drafts);
    if (!validation.ok) {
      return { ok: false, error: validation.errors[0]?.message ?? "workspace validation failed", errors: validation.errors };
    }
    const normalizedJson = buildWorkspaceJson({ raw, ...drafts });
    const bytes = stringifyWorkspaceJson(normalizedJson);
    const expectedHash = hash16(bytes);
    tmpPath = `${resolved.resolved}.tmp.${randomBytes(8).toString("hex")}`;
    const fd = openSync(tmpPath, "wx");
    try {
      writeSync(fd, bytes, 0, "utf8");
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmpPath, resolved.resolved);
    const reread = readFileSync(resolved.resolved);
    const actualHash = hash16(reread);
    if (actualHash !== expectedHash) {
      throw new Error("atomic write verification hash mismatch");
    }
    try {
      const dirFd = openSync(dirname(resolved.resolved), "r");
      try {
        fsyncSync(dirFd);
      } finally {
        closeSync(dirFd);
      }
    } catch {
      // Directory fsync is not available on every platform/filesystem; the file itself is already fsynced.
    }
    return { ok: true, path: resolved.resolved, hash: actualHash };
  } catch (error) {
    if (tmpPath && existsSync(tmpPath)) {
      try {
        unlinkSync(tmpPath);
      } catch {
        // ignore best-effort cleanup failures
      }
    }
    return { ok: false, error: errorText(error) };
  }
}
