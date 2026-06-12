import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { loadWorkspace } from "./load-workspace.js";
import type { Workspace } from "./types.js";
import { resolveWorkspaceSelection, saveLastWorkspace } from "./workspace-state.js";
import type { WorkspaceSelection } from "./workspace-state.js";

export type WorkspaceServiceOptions = {
  cwd?: string;
};

export type WorkspaceSummaryReadback = {
  path: string;
  source: WorkspaceSelection["source"] | "candidate" | "written";
  hash: string;
  active_rois: string[];
  active_anchors: string[];
  cli: {
    enabled: boolean;
    default_cli_name: string;
    parameter_count: number;
    action_count: number;
  };
};

export type WorkspaceValidationResult =
  | {
      ok: true;
      selection: WorkspaceSelection;
      workspace: Workspace;
      hash: string;
      summary: WorkspaceSummaryReadback;
    }
  | {
      ok: false;
      path: string;
      error: string;
    };

export type LoadedWorkspace = {
  selection: WorkspaceSelection;
  workspace: Workspace;
  hash: string;
  summary: WorkspaceSummaryReadback;
};

export type WorkspaceWriteResult =
  | {
      ok: true;
      candidatePath: string;
      targetPath: string;
      previousHash?: string;
      hash: string;
      workspace: Workspace;
      summary: WorkspaceSummaryReadback;
    }
  | {
      ok: false;
      candidatePath: string;
      targetPath: string;
      error: string;
    };

export function loadActiveWorkspace(options: WorkspaceServiceOptions = {}): LoadedWorkspace {
  const cwd = options.cwd ?? process.cwd();
  const selection = resolveWorkspaceSelection({ cwd });
  const workspace = loadWorkspace(selection.path);
  const hash = workspaceFileHash(selection.path);
  return {
    selection,
    workspace,
    hash,
    summary: summarizeWorkspace(workspace, hash, selection.source),
  };
}

export function validateWorkspaceCandidate(
  path: string,
  options: WorkspaceServiceOptions = {},
): WorkspaceValidationResult {
  const cwd = options.cwd ?? process.cwd();
  const selection = resolveWorkspaceSelection({ explicitPath: path, cwd });

  try {
    const workspace = loadWorkspace(selection.path);
    const hash = workspaceFileHash(selection.path);
    return {
      ok: true,
      selection,
      workspace,
      hash,
      summary: summarizeWorkspace(workspace, hash, selection.source),
    };
  } catch (error) {
    return {
      ok: false,
      path: selection.path,
      error: errorMessage(error),
    };
  }
}

export function selectWorkspace(path: string, options: WorkspaceServiceOptions = {}): WorkspaceValidationResult {
  const cwd = options.cwd ?? process.cwd();
  const validation = validateWorkspaceCandidate(path, { cwd });
  if (!validation.ok) {
    return validation;
  }

  saveLastWorkspace(validation.selection.path, cwd);
  return validation;
}

export function writeWorkspaceCandidate(options: {
  candidatePath: string;
  targetPath: string;
  cwd?: string;
}): WorkspaceWriteResult {
  const cwd = options.cwd ?? process.cwd();
  const candidatePath = resolve(cwd, options.candidatePath);
  const targetPath = resolve(cwd, options.targetPath);
  const candidate = validateWorkspaceCandidate(candidatePath, { cwd });

  if (!candidate.ok) {
    return {
      ok: false,
      candidatePath,
      targetPath,
      error: candidate.error,
    };
  }

  const previousHash = existsSync(targetPath) ? workspaceFileHash(targetPath) : undefined;
  const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;

  try {
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(tempPath, readFileSync(candidatePath, "utf8"), "utf8");
    loadWorkspace(tempPath);
    renameSync(tempPath, targetPath);
    const workspace = loadWorkspace(targetPath);
    const hash = workspaceFileHash(targetPath);

    return {
      ok: true,
      candidatePath,
      targetPath,
      previousHash,
      hash,
      workspace,
      summary: summarizeWorkspace(workspace, hash, "written"),
    };
  } catch (error) {
    rmSync(tempPath, { force: true });
    return {
      ok: false,
      candidatePath,
      targetPath,
      error: errorMessage(error),
    };
  }
}

export function workspaceFileHash(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function summarizeWorkspace(
  workspace: Workspace,
  hash = workspaceFileHash(workspace.sourcePath),
  source: WorkspaceSummaryReadback["source"] = "candidate",
): WorkspaceSummaryReadback {
  return {
    path: workspace.sourcePath,
    source,
    hash,
    active_rois: workspace.rois.filter((roi) => roi.active).map((roi) => roi.name ?? roi.ref),
    active_anchors: workspace.anchors
      .filter((anchor) => anchor.active)
      .map((anchor) => anchor.name ?? anchor.ref),
    cli: {
      enabled: workspace.cli.enabled,
      default_cli_name: workspace.cli.defaultCliName,
      parameter_count: workspace.cli.parameters.size,
      action_count: workspace.cli.actions.size,
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
