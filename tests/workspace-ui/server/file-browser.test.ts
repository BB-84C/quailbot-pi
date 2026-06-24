import { mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { browseDirectory, loadWorkspaceFile, saveWorkspaceFile } from "../../../src/workspace-ui/server/file-browser.js";
import type { AllowedRoots } from "../../../src/workspace-ui/server/path-policy.js";
import { buildWorkspaceJson, stringifyWorkspaceJson } from "../../../src/workspace-ui/shared/serialize.js";

function fixtureRoots(): { root: string; workspaceDir: string; stateDir: string; roots: AllowedRoots } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "quailbot-file-browser-")));
  const workspaceDir = join(root, "workspaces");
  const stateDir = join(root, ".quailbot-pi");
  mkdirSync(workspaceDir);
  mkdirSync(stateDir);
  return { root, workspaceDir: realpathSync(workspaceDir), stateDir: realpathSync(stateDir), roots: { workspaceDir: realpathSync(workspaceDir), stateDir: realpathSync(stateDir) } };
}

function validWorkspaceJson(): Record<string, unknown> {
  return buildWorkspaceJson({ raw: {}, rois: [{ name: "roi", x: 1, y: 2, w: 3, h: 4, description: "", tags: "", active: true, group: "" }], anchors: [], groups: [], cliName: "cli", cliEnabled: false, cliParams: [] });
}

describe("server file browser", () => {
  it("browses directories and json files only, with dirs first; node_modules filtered, .quailbot-pi visible", () => {
    const { roots, workspaceDir } = fixtureRoots();
    mkdirSync(join(workspaceDir, "b-dir"));
    mkdirSync(join(workspaceDir, "A-dir"));
    mkdirSync(join(workspaceDir, ".hidden-dir"));
    mkdirSync(join(workspaceDir, ".quailbot-pi"));
    mkdirSync(join(workspaceDir, "node_modules"));
    writeFileSync(join(workspaceDir, "z.json"), "{}\n");
    writeFileSync(join(workspaceDir, "A.json"), "{}\n");
    writeFileSync(join(workspaceDir, "notes.txt"), "ignore");

    const result = browseDirectory(workspaceDir, roots);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries.map((entry) => [entry.kind, entry.name])).toEqual([
      ["dir", ".hidden-dir"],
      ["dir", ".quailbot-pi"],
      ["dir", "A-dir"],
      ["dir", "b-dir"],
      ["file", "A.json"],
      ["file", "z.json"],
    ]);
  });

  it("loads a workspace JSON object and returns a short sha256 hash", () => {
    const { roots, workspaceDir } = fixtureRoots();
    const target = join(workspaceDir, "workspace.json");
    writeFileSync(target, '{"rois":[],"anchors":[],"groups":[],"tools":{}}\n');

    const result = loadWorkspaceFile(target, roots);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.path).toBe(realpathSync(target));
    expect(result.canonicalJson).toMatchObject({ rois: [], anchors: [], groups: [], tools: {} });
    expect(result.summary.hash).toMatch(/^[a-f0-9]{16}$/);
  });

  it("rejects non-object workspace JSON", () => {
    const { roots, workspaceDir } = fixtureRoots();
    const target = join(workspaceDir, "bad.json");
    writeFileSync(target, "[]\n");

    expect(loadWorkspaceFile(target, roots)).toEqual(expect.objectContaining({ ok: false, error: expect.stringMatching(/JSON object/) }));
  });

  it("saves with atomic bytes matching shared serialization", () => {
    const { roots, workspaceDir } = fixtureRoots();
    const target = join(workspaceDir, "saved.json");
    const workspaceJson = validWorkspaceJson();
    const expectedBytes = stringifyWorkspaceJson(workspaceJson);

    const result = saveWorkspaceFile({ targetPath: target, workspaceJson, roots });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(readFileSync(target, "utf8")).toBe(expectedBytes);
    expect(result.hash).toMatch(/^[a-f0-9]{16}$/);
  });

  it("rejects saves outside allowed roots", () => {
    const { root, roots } = fixtureRoots();
    const result = saveWorkspaceFile({ targetPath: join(root, "outside.json"), workspaceJson: validWorkspaceJson(), roots });

    expect(result).toEqual(expect.objectContaining({ ok: false, error: expect.stringMatching(/outside|allowed root/i) }));
  });

  it("rejects loading through a symlink that escapes allowed roots", () => {
    const { root, roots, workspaceDir } = fixtureRoots();
    const outsideDir = join(root, "outside");
    const linkDir = join(workspaceDir, "escape");
    mkdirSync(outsideDir);
    writeFileSync(join(outsideDir, "workspace.json"), "{}\n");
    try {
      symlinkSync(outsideDir, linkDir, "dir");
    } catch (error) {
      if (process.platform === "win32") {
        console.warn(`skipping symlink escape assertion: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      throw error;
    }

    expect(loadWorkspaceFile(join(linkDir, "workspace.json"), roots)).toEqual(expect.objectContaining({ ok: false, error: expect.stringMatching(/outside|symlink|junction|allowed root/i) }));
  });
});
