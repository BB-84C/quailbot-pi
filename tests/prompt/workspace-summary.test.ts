import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildWorkspaceContextText, buildWorkspaceSummary } from "../../src/prompt/workspace-summary.js";
import { loadWorkspace } from "../../src/workspace/load-workspace.js";

describe("workspace prompt summary", () => {
  it("summarizes enabled CLI affordances for the active workspace", () => {
    const workspace = loadWorkspace(join(process.cwd(), "tests/workspaces/nanonis-minimal.workspace.json"));

    const summary = buildWorkspaceSummary(workspace);

    expect(summary.cli.enabledParameters).toContainEqual(
      expect.objectContaining({
        name: "current",
        cli_name: "nqctl",
        ref: "nqctl:current",
      }),
    );
    expect(summary.cli.enabledActions).toContainEqual(
      expect.objectContaining({
        name: "Scan_Action",
        cli_name: "nqctl",
        linked_observables: ["scan_status", "scan_buffer", "scan_speed"],
      }),
    );
    expect(summary.cli.actionsAvailable.cli_get).toBe(true);
    expect(summary.cli.actionsAvailable.cli_set).toBe(true);

    const contextText = buildWorkspaceContextText(workspace);

    expect(contextText).toContain("WORKSPACE (Quailbot active workspace)");
    expect(contextText).toContain("nqctl:zctrl_setpnt");
    expect(contextText).toContain("linked_observables");
  });
});
