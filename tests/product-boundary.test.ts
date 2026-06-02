import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readJson(rel: string): any {
  return JSON.parse(readFileSync(join(root, rel), "utf8"));
}

function readText(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("product boundary", () => {
  it("does not track the OpenCode Pi runner as product code", () => {
    expect(existsSync(join(root, "scripts", "run-pi.mjs"))).toBe(false);
  });

  it("does not track the Nanonis workspace importer as product code", () => {
    expect(existsSync(join(root, "scripts", "import-nanonis-workspace.mjs"))).toBe(false);
  });

  it("declares the built extension entry under top-level pi.extensions", () => {
    const pkg = readJson("package.json");
    expect(pkg.pi).toBeDefined();
    expect(pkg.pi.extensions).toEqual(["./dist/src/extension.js"]);
  });

  it("wires scripts.pi to the dev release + npm exec pi invocation", () => {
    const pkg = readJson("package.json");
    expect(pkg.scripts.pi).toBe(
      "npm run dev:release && npm exec -- pi --session-dir .pi-state/sessions",
    );
  });

  it("scripts.pi does not invoke a tracked runner script", () => {
    const pkg = readJson("package.json");
    expect(pkg.scripts.pi).not.toContain("-e");
    expect(pkg.scripts.pi).not.toContain("run-pi.mjs");
  });

  it("scripts['pi:mutating'] gates the mutating flag", () => {
    const pkg = readJson("package.json");
    expect(pkg.scripts["pi:mutating"]).toBeDefined();
    expect(pkg.scripts["pi:mutating"]).toContain("QUAILBOT_ALLOW_MUTATING_TOOLS");
  });

  it("tracks .pi/settings.json with the parent workspace package", () => {
    const settings = readJson(".pi/settings.json");
    expect(settings.packages).toEqual([".."]);
  });

  it("ignores local .pi runtime caches and the .quailbot-pi state dir", () => {
    const ignore = readText(".gitignore");
    expect(ignore).toContain(".pi/git/");
    expect(ignore).toContain(".pi/npm/");
    expect(ignore).toContain(".pi/sessions/");
    expect(ignore).toContain(".pi/cache/");
    expect(ignore).toContain(".quailbot-pi/");
  });
});
