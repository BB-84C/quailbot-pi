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

  it("declares Pi core deps as peerDependencies so consumers get pi's bundled copies", () => {
    const pkg = readJson("package.json");
    expect(pkg.peerDependencies).toEqual({
      "@earendil-works/pi-coding-agent": "*",
      "@earendil-works/pi-tui": "*",
      "typebox": "*",
    });
    // Pi peers must not also appear under dependencies (would double-bundle)
    expect(pkg.dependencies).toBeUndefined();
  });

  it("declares the pi-package keyword for gallery discoverability", () => {
    const pkg = readJson("package.json");
    expect(Array.isArray(pkg.keywords)).toBe(true);
    expect(pkg.keywords).toContain("pi-package");
  });

  it("does not mark the package private (so npm publish is permitted)", () => {
    const pkg = readJson("package.json");
    expect(pkg.private).toBeUndefined();
  });

  it("includes only production dist + README + LICENSE in the publishable tarball (no compiled tests)", () => {
    const pkg = readJson("package.json");
    expect(pkg.files).toEqual(["dist/src", "dist/workspace-ui", "README.md", "LICENSE"]);
  });

  it("wires scripts.pi to the dev release + repo-local state override + npm exec pi invocation", () => {
    const pkg = readJson("package.json");
    expect(pkg.scripts["dev:release"]).toBe("npm run build");
    expect(pkg.scripts["dev:check"]).toBe(
      "npm run dev:release && vitest --run tests/e2e/dev-release-adoption.test.ts",
    );
    // 0.1.0: dev runs override QUAILBOT_PI_STATE_DIR to keep Quailbot state
    // repo-local during development. End-user installs leave the env var
    // unset and state defaults to ~/.quailbot-pi/.
    expect(pkg.scripts.pi).toContain("npm run dev:release");
    expect(pkg.scripts.pi).toContain("QUAILBOT_PI_STATE_DIR");
    expect(pkg.scripts.pi).toContain("npm exec -- pi --session-dir .pi-state/sessions");
  });

  it("scripts.pi does not invoke a tracked runner script", () => {
    const pkg = readJson("package.json");
    expect(pkg.scripts.pi).not.toContain("run-pi.mjs");
  });

  it("scripts['pi:mutating'] gates the mutating flag", () => {
    const pkg = readJson("package.json");
    expect(pkg.scripts["pi:mutating"]).toBeDefined();
    expect(pkg.scripts["pi:mutating"]).toContain("QUAILBOT_ALLOW_MUTATING_TOOLS");
    expect(pkg.scripts["pi:mutating"]).toContain(
      "npm exec -- pi --session-dir .pi-state/sessions",
    );
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
