import { mkdtempSync, mkdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolvePathUnderRoots, type AllowedRoots } from "../../../src/workspace-ui/server/path-policy.js";

function fixtureRoots(): { root: string; workspaceDir: string; stateDir: string; roots: AllowedRoots } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "quailbot-path-policy-")));
  const workspaceDir = join(root, "workspaces");
  const stateDir = join(root, ".quailbot-pi");
  mkdirSync(workspaceDir);
  mkdirSync(stateDir);
  return { root, workspaceDir: realpathSync(workspaceDir), stateDir: realpathSync(stateDir), roots: { workspaceDir: realpathSync(workspaceDir), stateDir: realpathSync(stateDir) } };
}

describe("Windows-hardened path policy", () => {
  it("rejects UNC paths, 8.3 segments, ADS segments, and drive switching before file IO", () => {
    const { roots, workspaceDir } = fixtureRoots();

    expect(resolvePathUnderRoots("\\\\server\\share\\workspace.json", roots)).toEqual(expect.objectContaining({ ok: false, error: expect.stringMatching(/UNC/i) }));
    expect(resolvePathUnderRoots(join(workspaceDir, "WORKSP~1", "workspace.json"), roots)).toEqual(expect.objectContaining({ ok: false, error: expect.stringMatching(/8\.3|short/i) }));
    expect(resolvePathUnderRoots(join(workspaceDir, "workspace.json:Zone.Identifier"), roots)).toEqual(expect.objectContaining({ ok: false, error: expect.stringMatching(/alternate data stream|colon/i) }));
    expect(resolvePathUnderRoots("Z:\\other\\workspace.json", roots)).toEqual(expect.objectContaining({ ok: false, error: expect.stringMatching(/drive|absolute/i) }));
  });

  it("accepts valid paths under the active workspace directory and under stateDir", () => {
    const { roots, workspaceDir, stateDir } = fixtureRoots();
    const workspaceFile = join(workspaceDir, "workspace.json");
    const stateFile = join(stateDir, "capture.json");
    writeFileSync(workspaceFile, "{}\n");
    writeFileSync(stateFile, "{}\n");

    expect(resolvePathUnderRoots(workspaceFile, roots)).toEqual({ ok: true, resolved: realpathSync(workspaceFile) });
    expect(resolvePathUnderRoots(stateFile, roots)).toEqual({ ok: true, resolved: realpathSync(stateFile) });
  });

  it("accepts exact root matches", () => {
    const { roots, workspaceDir, stateDir } = fixtureRoots();

    expect(resolvePathUnderRoots(workspaceDir, roots)).toEqual({ ok: true, resolved: realpathSync(workspaceDir) });
    expect(resolvePathUnderRoots(stateDir, roots)).toEqual({ ok: true, resolved: realpathSync(stateDir) });
  });

  it("rejects out-of-root paths after realpath resolution", () => {
    const { root, roots } = fixtureRoots();
    const outside = join(root, "outside.json");
    writeFileSync(outside, "{}\n");

    expect(resolvePathUnderRoots(outside, roots)).toEqual(expect.objectContaining({ ok: false, error: expect.stringMatching(/outside|allowed root/i) }));
  });

  it("rejects symlink/junction segments even when the final realpath stays under an allowed root", () => {
    const { roots, workspaceDir } = fixtureRoots();
    const realDir = join(workspaceDir, "real");
    const linkDir = join(workspaceDir, "link");
    mkdirSync(realDir);
    writeFileSync(join(realDir, "workspace.json"), "{}\n");
    try {
      symlinkSync(realDir, linkDir, "dir");
    } catch (error) {
      if (process.platform === "win32") {
        console.warn(`skipping symlink rejection assertion: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      throw error;
    }

    expect(resolvePathUnderRoots(join(linkDir, "workspace.json"), roots)).toEqual(expect.objectContaining({ ok: false, error: expect.stringMatching(/symlink|junction/i) }));
  });
});
