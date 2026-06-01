import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("product boundary", () => {
  it("does not track the OpenCode Pi runner as product code", () => {
    expect(existsSync(join(root, "scripts", "run-pi.mjs"))).toBe(false);
  });

  it("keeps package scripts focused on product tests and build", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(pkg.scripts.pi).toBeUndefined();
    expect(pkg.scripts.test).toBe("vitest --run");
    expect(pkg.scripts.typecheck).toBe("tsc --noEmit");
  });
});
