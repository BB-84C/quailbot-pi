import { existsSync, lstatSync, realpathSync } from "node:fs";
import path from "node:path";

export interface AllowedRoots {
  workspaceDir: string;
  stateDir: string;
}

export type PathPolicyResult = { ok: true; resolved: string } | { ok: false; error: string };

function isWindowsDriveSegment(segment: string): boolean {
  return /^[A-Za-z]:$/.test(segment);
}

function splitSegments(inputPath: string): string[] {
  return inputPath.split(/[\\/]+/).filter((segment) => segment.length > 0);
}

function validateRawPath(inputPath: unknown, roots: AllowedRoots): PathPolicyResult | null {
  if (typeof inputPath !== "string" || inputPath.trim().length === 0) {
    return { ok: false, error: "path must be a non-empty string" };
  }
  if (inputPath.includes("\0")) {
    return { ok: false, error: "path contains a NUL byte" };
  }
  if (/^[\\/]{2}/.test(inputPath)) {
    return { ok: false, error: "UNC paths are not allowed" };
  }
  if (path.win32.isAbsolute(inputPath) && /^[A-Za-z]:/.test(inputPath)) {
    const inputDrive = inputPath.slice(0, 2).toLowerCase();
    const rootDrives = [roots.workspaceDir, roots.stateDir].map((root) => (/^[A-Za-z]:/.test(root) ? root.slice(0, 2).toLowerCase() : "")).filter(Boolean);
    if (rootDrives.length === 0 || !rootDrives.includes(inputDrive)) {
      return { ok: false, error: "drive switching is not allowed" };
    }
  }
  const comparableInput = normalizeForCompare(inputPath);
  const rootPrefix = [roots.workspaceDir, roots.stateDir, commonAncestor(roots.workspaceDir, roots.stateDir)].map(normalizeForCompare).find((root) => comparableInput === root || comparableInput.startsWith(`${root}${path.sep}`));
  const segmentSource = rootPrefix ? path.relative(rootPrefix, path.resolve(inputPath)) : inputPath;
  const segments = splitSegments(segmentSource);
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index] ?? "";
    if (/~\d/.test(segment)) {
      return { ok: false, error: "8.3 short-name path segments are not allowed" };
    }
    if (segment.includes(":") && !(index === 0 && isWindowsDriveSegment(segment))) {
      return { ok: false, error: "alternate data stream / colon path segments are not allowed" };
    }
  }
  return null;
}

function normalizeForCompare(value: string): string {
  const normalized = path.resolve(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function underRoot(resolved: string, root: string): boolean {
  const child = normalizeForCompare(resolved);
  const parent = normalizeForCompare(root);
  return child === parent || child.startsWith(`${parent}${path.sep}`);
}

function commonAncestor(left: string, right: string): string {
  const leftParts = path.resolve(left).split(path.sep);
  const rightParts = path.resolve(right).split(path.sep);
  const out: string[] = [];
  const length = Math.min(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? "";
    const rightPart = rightParts[index] ?? "";
    const comparableLeft = process.platform === "win32" ? leftPart.toLowerCase() : leftPart;
    const comparableRight = process.platform === "win32" ? rightPart.toLowerCase() : rightPart;
    if (comparableLeft !== comparableRight) break;
    out.push(leftPart);
  }
  return out.join(path.sep) || path.parse(path.resolve(left)).root;
}

function existingSegments(absPath: string): string[] {
  const resolved = path.resolve(absPath);
  const root = path.parse(resolved).root;
  const relative = path.relative(root, resolved);
  const parts = relative.split(path.sep).filter(Boolean);
  const out: string[] = [];
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    if (!existsSync(current)) break;
    out.push(current);
  }
  return out;
}

function hasSymlinkOrJunctionSegment(candidatePath: string): boolean {
  for (const segment of existingSegments(candidatePath)) {
    if (lstatSync(segment).isSymbolicLink()) {
      return true;
    }
  }
  return false;
}

function acceptingRoot(resolved: string, roots: AllowedRoots): string | null {
  for (const root of [roots.workspaceDir, roots.stateDir]) {
    if (underRoot(resolved, root)) return root;
  }
  return null;
}

/** Resolves `inputPath` against `roots` and verifies it's under one of them after symlink/junction resolution. */
export function resolvePathUnderRoots(inputPath: string, roots: AllowedRoots): PathPolicyResult {
  const rawError = validateRawPath(inputPath, roots);
  if (rawError) return rawError;
  try {
    if (hasSymlinkOrJunctionSegment(inputPath)) {
      return { ok: false, error: "symlink/junction path segments are not allowed" };
    }
    const resolved = realpathSync(inputPath);
    const root = acceptingRoot(resolved, roots);
    if (!root) {
      return { ok: false, error: "path is outside the allowed roots" };
    }
    if (hasSymlinkOrJunctionSegment(resolved)) {
      return { ok: false, error: "symlink/junction path segments are not allowed" };
    }
    return { ok: true, resolved };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function resolveWritablePathUnderRoots(inputPath: string, roots: AllowedRoots): PathPolicyResult {
  const rawError = validateRawPath(inputPath, roots);
  if (rawError) return rawError;
  if (existsSync(inputPath)) {
    return resolvePathUnderRoots(inputPath, roots);
  }
  const parent = path.dirname(inputPath);
  const basename = path.basename(inputPath);
  const parentResult = resolvePathUnderRoots(parent, roots);
  if (!parentResult.ok) return parentResult;
  if (/~\d/.test(basename) || basename.includes(":")) {
    return { ok: false, error: "unsafe output filename" };
  }
  return { ok: true, resolved: path.join(parentResult.resolved, basename) };
}
