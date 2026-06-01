import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { loadWorkspace } from "../../src/workspace/load-workspace.js";

describe("loadWorkspace", () => {
  it("loads a real workspace JSON path through the product resolver", () => {
    const workspacePath = join(process.cwd(), "tests/workspaces/nanonis-minimal.workspace.json");

    const workspace = loadWorkspace(workspacePath);

    expect(workspace.sourcePath).toBe(workspacePath);
    expect(workspace.cli.enabled).toBe(true);
    expect(workspace.cli.defaultCliName).toBe("nqctl");
    expect(workspace.cli.parameters.get("nqctl:zctrl_setpnt")?.linkedObservables).toEqual(["current"]);
    expect(workspace.cli.actions.get("nqctl:Scan_Action")?.linkedObservables).toEqual([
      "scan_status",
      "scan_buffer",
      "scan_speed",
    ]);
  });

  it("throws when the workspace path does not exist", () => {
    expect(() => loadWorkspace(join(process.cwd(), "tests/workspaces/missing.workspace.json"))).toThrow(
      /workspace file does not exist/,
    );
  });
});
