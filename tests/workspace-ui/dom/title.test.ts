import { describe, expect, it } from "vitest";

import { initialState } from "../../../src/workspace-ui/client/state.js";
import { workspaceDocumentTitle } from "../../../src/workspace-ui/client/title.js";

describe("workspace document title", () => {
  it("matches the Tk title shape with workspace basename and idle status", () => {
    const state = initialState();
    state.workspace.currentPath = "D:\\quailbot\\workspaces\\Nanonis-SPM-Controller - Woody.json";

    expect(workspaceDocumentTitle(state)).toBe("Workspace Calibrator - Nanonis-SPM-Controller - Woody.json - idle");
  });

  it("falls back to workspace.json and mirrors draw/pick status text", () => {
    const state = initialState();

    expect(workspaceDocumentTitle(state)).toBe("Workspace Calibrator - workspace.json - idle");

    state.canvas.mode = "draw_roi";
    expect(workspaceDocumentTitle(state)).toBe("Workspace Calibrator - workspace.json - Draw ROI: click+drag on screenshot");

    state.canvas.mode = "pick_anchor";
    expect(workspaceDocumentTitle(state)).toBe("Workspace Calibrator - workspace.json - Pick anchor: click on screenshot");
  });
});
