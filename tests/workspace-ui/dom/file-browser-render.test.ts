import { describe, expect, it } from "vitest";

import { renderFileBrowserModal } from "../../../src/workspace-ui/client/render/file-browser.js";
import { initialState } from "../../../src/workspace-ui/client/state.js";

describe("file browser modal render", () => {
  it("renders entries and hides typed filename in load mode", () => {
    const root = document.createElement("section");
    const state = initialState();
    state.fileBrowser = {
      open: true,
      mode: "load",
      currentPath: "D:\\quailbot\\workspaces",
      entries: [
        { name: "A", kind: "dir", path: "D:\\quailbot\\workspaces\\A" },
        { name: "workspace.json", kind: "file", path: "D:\\quailbot\\workspaces\\workspace.json" },
      ],
      selectedFile: null,
      typedFilename: "",
      inFlight: false,
      lastError: null,
    };

    renderFileBrowserModal(root, state);

    expect(root.querySelector(".file-browser-modal")?.textContent).toContain("workspace.json");
    expect(root.querySelector<HTMLInputElement>('input[data-file-browser-filename="true"]')).toBeNull();
    expect(root.querySelector<HTMLButtonElement>('button[data-action="file-browser-open"]')?.disabled).toBe(true);

    state.fileBrowser.selectedFile = "D:\\quailbot\\workspaces\\workspace.json";
    renderFileBrowserModal(root, state);

    expect(root.querySelector<HTMLButtonElement>('button[data-action="file-browser-open"]')?.disabled).toBe(false);
  });

  it("renders typed filename input in export mode", () => {
    const root = document.createElement("section");
    const state = initialState();
    state.fileBrowser.open = true;
    state.fileBrowser.mode = "export";

    renderFileBrowserModal(root, state);

    expect(root.querySelector<HTMLInputElement>('input[data-file-browser-filename="true"]')).not.toBeNull();
  });

  it("disables the export primary action when there is no current directory", () => {
    const root = document.createElement("section");
    const state = initialState();
    state.fileBrowser.open = true;
    state.fileBrowser.mode = "export";
    state.fileBrowser.currentPath = "";
    state.fileBrowser.typedFilename = "workspace.json";

    renderFileBrowserModal(root, state);

    expect(root.querySelector<HTMLButtonElement>('button[data-action="file-browser-save"]')?.disabled).toBe(true);
  });
});
