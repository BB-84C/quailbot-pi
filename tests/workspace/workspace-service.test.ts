import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  loadActiveWorkspace,
  selectWorkspace,
  validateWorkspaceCandidate,
  workspaceFileHash,
  writeWorkspaceCandidate,
} from "../../src/workspace/workspace-service.js";
import { loadLastWorkspace, settingsPath } from "../../src/workspace/workspace-state.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("workspace service", () => {
  it("validates a candidate without mutating selected workspace settings", () => {
    const cwd = makeTempDir();
    const workspacePath = writeWorkspace(cwd, "candidate.workspace.json", minimalWorkspace("nqctl"));

    const result = validateWorkspaceCandidate(workspacePath, { cwd });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected valid workspace candidate");
    }
    expect(result.selection.path).toBe(workspacePath);
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.summary.path).toBe(workspacePath);
    expect(result.summary.cli.enabled).toBe(true);
    expect(result.summary.cli.default_cli_name).toBe("nqctl");
    expect(result.summary.cli.parameter_count).toBe(1);
    expect(existsSync(settingsPath(cwd))).toBe(false);
  });

  it("returns a non-throwing validation failure for missing or malformed candidates", () => {
    const cwd = makeTempDir();
    const missing = validateWorkspaceCandidate("missing.workspace.json", { cwd });
    expect(missing).toEqual(
      expect.objectContaining({
        ok: false,
        path: join(cwd, "missing.workspace.json"),
      }),
    );
    if (missing.ok) {
      throw new Error("missing workspace unexpectedly validated");
    }
    expect(missing.error).toContain("workspace file does not exist");

    const malformedPath = writeRaw(cwd, "malformed.workspace.json", "{ not json");
    const malformed = validateWorkspaceCandidate(malformedPath, { cwd });
    expect(malformed.ok).toBe(false);
    if (malformed.ok) {
      throw new Error("malformed workspace unexpectedly validated");
    }
    expect(malformed.error.length).toBeGreaterThan(0);
  });

  it("selects a valid candidate by persisting settings and exposes active readback", () => {
    const cwd = makeTempDir();
    const workspacePath = writeWorkspace(cwd, "selected.workspace.json", minimalWorkspace("nqctl"));

    const selected = selectWorkspace(workspacePath, { cwd });

    expect(selected.ok).toBe(true);
    if (!selected.ok) {
      throw new Error("expected workspace selection to pass");
    }
    expect(loadLastWorkspace(cwd)).toBe(workspacePath);
    expect(selected.summary.source).toBe("explicit");

    const active = loadActiveWorkspace({ cwd });
    expect(active.selection.source).toBe("settings");
    expect(active.selection.path).toBe(workspacePath);
    expect(active.hash).toBe(selected.hash);
    expect(active.summary.cli.parameter_count).toBe(1);
  });

  it("does not replace the previously selected workspace when selection validation fails", () => {
    const cwd = makeTempDir();
    const originalPath = writeWorkspace(cwd, "original.workspace.json", minimalWorkspace("nqctl"));
    const badPath = writeRaw(cwd, "bad.workspace.json", JSON.stringify({ cli_params: [] }));

    const original = selectWorkspace(originalPath, { cwd });
    expect(original.ok).toBe(true);

    const rejected = selectWorkspace(badPath, { cwd });

    expect(rejected.ok).toBe(false);
    expect(loadLastWorkspace(cwd)).toBe(originalPath);
  });

  it("computes stable hashes over exact workspace file bytes", () => {
    const cwd = makeTempDir();
    const workspacePath = writeRaw(cwd, "hash.workspace.json", "{\"rois\":[],\"anchors\":[]}\n");

    expect(workspaceFileHash(workspacePath)).toBe(workspaceFileHash(workspacePath));
    writeRaw(cwd, "hash.workspace.json", "{\"rois\":[],\"anchors\":[{\"name\":\"a\"}]}\n");
    expect(workspaceFileHash(workspacePath)).not.toBe("e3b0c44298fc1c149afbf4c8996fb924");
  });

  it("atomically writes a validated candidate to a target without activating it by default", () => {
    const cwd = makeTempDir();
    const candidatePath = writeWorkspace(cwd, "candidate.workspace.json", minimalWorkspace("qctl"));
    const targetPath = join(cwd, ".quailbot-pi", "workspace.json");

    const result = writeWorkspaceCandidate({ candidatePath, targetPath, cwd });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected workspace write to pass");
    }
    expect(existsSync(targetPath)).toBe(true);
    expect(result.summary.path).toBe(targetPath);
    expect(result.summary.cli.default_cli_name).toBe("qctl");
    expect(loadLastWorkspace(cwd)).toBeUndefined();
  });

  it("does not overwrite the target when the candidate is invalid", () => {
    const cwd = makeTempDir();
    const targetPath = writeWorkspace(cwd, "target.workspace.json", minimalWorkspace("nqctl"));
    const before = readFileSync(targetPath, "utf8");
    const candidatePath = writeRaw(cwd, "bad-candidate.workspace.json", JSON.stringify({ cli_params: [] }));

    const result = writeWorkspaceCandidate({ candidatePath, targetPath, cwd });

    expect(result.ok).toBe(false);
    expect(readFileSync(targetPath, "utf8")).toBe(before);
  });

  it("returns a write failure instead of throwing when an existing target cannot be hashed", () => {
    const cwd = makeTempDir();
    const candidatePath = writeWorkspace(cwd, "candidate.workspace.json", minimalWorkspace("qctl"));
    const targetPath = join(cwd, "target-directory.workspace.json");
    mkdirSync(targetPath);

    const result = writeWorkspaceCandidate({ candidatePath, targetPath, cwd });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("target directory unexpectedly accepted as write target");
    }
    expect(result.targetPath).toBe(targetPath);
    expect(result.error.length).toBeGreaterThan(0);
  });
});

function minimalWorkspace(cliName: string): Record<string, unknown> {
  return {
    rois: [{ name: "current", active: true }],
    anchors: [{ name: "bias-field", active: true, linked_ROIs: ["current"] }],
    cli_params: {
      cli_name: cliName,
      enabled: true,
      parameters: {
        items: [{ name: "bias_v", readable: true, writable: true, set_cmd: { command: "set" } }],
      },
      action_commands: { items: [] },
    },
  };
}

function writeWorkspace(cwd: string, fileName: string, workspace: unknown): string {
  return writeRaw(cwd, fileName, `${JSON.stringify(workspace, null, 2)}\n`);
}

function writeRaw(cwd: string, fileName: string, content: string): string {
  const path = join(cwd, fileName);
  writeFileSync(path, content, "utf8");
  return path;
}

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "quailbot-workspace-service-"));
  tempDirs.push(dir);
  return dir;
}
