import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const assetDir = join(process.cwd(), "dist", "workspace-ui");

describe("workspace UI built asset contract", () => {
  beforeAll(() => {
    runWorkspaceUiClientBuild();
  });

  it("produces non-trivial bundle and sourcemap bytes for the server to read from disk", () => {
    const bundle = statSync(join(assetDir, "client.js"));
    const sourcemap = statSync(join(assetDir, "client.js.map"));

    expect(bundle.size).toBeGreaterThan(1024);
    expect(sourcemap.size).toBeGreaterThan(1024);
  });
});

function runWorkspaceUiClientBuild(): void {
  if (process.platform === "win32") {
    execFileSync("cmd.exe", ["/d", "/s", "/c", "npm run build:workspace-ui-client"], { cwd: process.cwd(), stdio: "pipe" });
    return;
  }

  execFileSync("npm", ["run", "build:workspace-ui-client"], { cwd: process.cwd(), stdio: "pipe" });
}
