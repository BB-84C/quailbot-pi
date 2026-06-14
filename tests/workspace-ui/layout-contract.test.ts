import { describe, expect, it } from "vitest";

import { workspaceUiClientJs } from "../../src/workspace-ui/client.js";
import { workspaceUiCss } from "../../src/workspace-ui/styles.js";

describe("workspace calibrator layout contract", () => {
  it("keeps the browser shell viewport-bound with internally scrolling panels", () => {
    expect(workspaceUiCss).toContain("height: 100dvh");
    expect(workspaceUiCss).toContain("overflow: hidden");
    expect(workspaceUiCss).toMatch(/\.panel\s*\{[^}]*overflow:\s*auto;?/s);
    expect(workspaceUiCss).toMatch(/\.panel\s*\{[^}]*min-width:\s*0;?/s);
    expect(workspaceUiCss).toMatch(/\.panel\s*\{[^}]*min-height:\s*0;?/s);
  });

  it("ships the tree, canvas, inspector, and CLI import browser controls", () => {
    expect(workspaceUiClientJs).toContain('mode: "select"');
    expect(workspaceUiClientJs).toContain('"draw-roi"');
    expect(workspaceUiClientJs).toContain('"pick-anchor"');
    expect(workspaceUiClientJs).toContain('workspaceJson');
    expect(workspaceUiClientJs).toContain('data-action="select-item"');
    expect(workspaceUiClientJs).toContain('data-action="add-group"');
    expect(workspaceUiClientJs).toContain('data-action="add-roi"');
    expect(workspaceUiClientJs).toContain('data-action="add-anchor"');
    expect(workspaceUiClientJs).toContain('data-action="validate-workspace"');
    expect(workspaceUiClientJs).toContain('data-action="save-workspace"');
    expect(workspaceUiClientJs).toContain('data-action="request-activation"');
    expect(workspaceUiClientJs).toContain('data-action="import-cli"');
    expect(workspaceUiClientJs).toContain('data-action="apply-import-resolutions"');
    expect(workspaceUiClientJs).toContain("<svg");
  });

  it("renders a real capture image substrate instead of hardcoded fixture targets", () => {
    expect(workspaceUiClientJs).toContain("captureFrame");
    expect(workspaceUiClientJs).toContain('<image class="workspace-capture"');
    expect(workspaceUiClientJs).toContain("escapeAttr(state.captureFrame.href)");
    expect(workspaceUiClientJs).not.toContain('data-fixture-target="roi"');
    expect(workspaceUiClientJs).not.toContain('data-fixture-target="anchor"');
    expect(workspaceUiClientJs).not.toContain('x="120" y="80" width="240" height="160"');
  });

  it("ships accessible group collapse and expand controls", () => {
    expect(workspaceUiClientJs).toContain("collapsedGroups");
    expect(workspaceUiClientJs).toContain('data-action="toggle-group-collapse"');
    expect(workspaceUiClientJs).toContain("aria-expanded");
    expect(workspaceUiCss).toMatch(/\.tree-node\.is-collapsed\s*>\s*\.tree-children\s*\{[^}]*display:\s*none;?/s);
  });

  it("maps canvas clicks through the rendered capture viewport instead of the full letterboxed SVG box", () => {
    expect(workspaceUiClientJs).toContain("function canvasViewport");
    expect(workspaceUiClientJs).toContain("Math.min(rect.width / frame.width, rect.height / frame.height)");
    expect(workspaceUiClientJs).toContain("renderedLeft");
    expect(workspaceUiClientJs).toContain("event.clientX - viewport.left");
    expect(workspaceUiClientJs).toContain("event.clientY - viewport.top");
  });

  it("only requests activation from a clean saved workspace hash", () => {
    expect(workspaceUiClientJs).toContain("const activationHash = !state.dirty ? state.lastSavedHash : ''");
    expect(workspaceUiClientJs).toContain("const expectedHash = state.lastSavedHash");
    expect(workspaceUiClientJs).toContain("if (state.dirty || !expectedHash)");
    expect(workspaceUiClientJs).not.toContain("validationHash || state.lastSavedHash");
  });

  it("clears stale validation and pending activation state whenever edits make the workspace dirty", () => {
    expect(workspaceUiClientJs).toContain("state.validationHash = ''");
    expect(workspaceUiClientJs).toContain("state.pendingActivation = null");
    expect(workspaceUiClientJs).toContain("state.lastSavedHash = ''");
  });
});
