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
    expect(workspaceUiClientJs).toContain("renderActionButton('refresh-capture', 'Refresh screenshot')");
    expect(workspaceUiClientJs).toContain("case 'refresh-capture':");
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
    expect(workspaceUiClientJs).toContain("event?.detail >= 2");
    expect(workspaceUiClientJs).not.toContain("addEventListener('dblclick'");
    expect(workspaceUiClientJs).toContain("aria-expanded");
    expect(workspaceUiCss).toMatch(/\.tree-node\.is-collapsed\s*>\s*\.tree-children\s*\{[^}]*display:\s*none;?/s);
  });

  it("uses Tk-compatible group field for nested groups in the browser client", () => {
    expect(workspaceUiClientJs).toContain("group.group = parent");
    expect(workspaceUiClientJs).not.toContain("group.parent = parent");
  });

  it("renders Tk-style active check controls and cascades group active state", () => {
    expect(workspaceUiClientJs).toContain('data-action="toggle-active"');
    expect(workspaceUiClientJs).toContain("setGroupActiveState");
    expect(workspaceUiClientJs).toContain("forcedRoiNames");
    expect(workspaceUiClientJs).toContain("linkedRoiNames");
    expect(workspaceUiClientJs).toContain("item.enabled = active");
  });

  it("ships Tk-style metadata, grouping, linked ROI, and delete inspector controls", () => {
    expect(workspaceUiClientJs).toContain('data-action="edit-text"');
    expect(workspaceUiClientJs).toContain('data-action="edit-tags"');
    expect(workspaceUiClientJs).toContain('data-action="set-item-group"');
    expect(workspaceUiClientJs).toContain('data-action="edit-linked-rois"');
    expect(workspaceUiClientJs).toContain('data-action="delete-selected"');
    expect(workspaceUiClientJs).toContain("linked_observables");
    expect(workspaceUiClientJs).toContain("renderGroupOptions");
    expect(workspaceUiClientJs).toContain("deleteSelectedItem");
  });

  it("refreshes CLI item count fields before browser save", () => {
    expect(workspaceUiClientJs).toContain("syncCliCounts");
    expect(workspaceUiClientJs).toContain("parameters.count = parameterItems().length");
    expect(workspaceUiClientJs).toContain("action_commands.count = actionItems().length");
  });

  it("edits the workspace CLI name and enabled flag, not only the import target", () => {
    expect(workspaceUiClientJs).toContain('data-action="set-workspace-cli-name"');
    expect(workspaceUiClientJs).toContain('data-action="toggle-workspace-cli-enabled"');
    expect(workspaceUiClientJs).toContain("function setWorkspaceCliName");
    expect(workspaceUiClientJs).toContain("state.workspaceJson.cli_params.cli_name = cliName");
    expect(workspaceUiClientJs).toContain("state.workspaceJson.cli_params.enabled = enabled");
  });

  it("maps canvas clicks through the rendered capture viewport instead of the full letterboxed SVG box", () => {
    expect(workspaceUiClientJs).toContain("function canvasViewport");
    expect(workspaceUiClientJs).toContain("Math.min(rect.width / frame.width, rect.height / frame.height)");
    expect(workspaceUiClientJs).toContain("renderedLeft");
    expect(workspaceUiClientJs).toContain("event.clientX - viewport.left");
    expect(workspaceUiClientJs).toContain("event.clientY - viewport.top");
  });

  it("preserves virtual-screen origin while rendering and saving ROI and anchor coordinates", () => {
    expect(workspaceUiClientJs).toContain("originX: numberValue(frame.originX, 0)");
    expect(workspaceUiClientJs).toContain("originY: numberValue(frame.originY, 0)");
    expect(workspaceUiClientJs).toContain("function screenToCanvasPoint");
    expect(workspaceUiClientJs).toContain("function canvasToScreenPoint");
    expect(workspaceUiClientJs).toContain("x: point.x + frame.originX");
    expect(workspaceUiClientJs).toContain("y: point.y + frame.originY");
    expect(workspaceUiClientJs).toContain("numberValue(roi.x, frame.originX) - frame.originX");
    expect(workspaceUiClientJs).toContain("numberValue(anchor.x, frame.originX) - frame.originX");
  });

  it("draws ROI by pointer drag preview and updates the selected ROI instead of click-adding a fixed ROI", () => {
    expect(workspaceUiClientJs).toContain("pointerdown");
    expect(workspaceUiClientJs).toContain("pointermove");
    expect(workspaceUiClientJs).toContain("pointerup");
    expect(workspaceUiClientJs).toContain("canvasEventNode");
    expect(workspaceUiClientJs).toContain("closest('svg.workspace-canvas')");
    expect(workspaceUiClientJs).toContain("state.dragPreview");
    expect(workspaceUiClientJs).toContain("updateSelectedRoiFromDrag");
    expect(workspaceUiClientJs).not.toContain("addRoi(Math.max(0, point.x - 90), Math.max(0, point.y - 60))");
  });

  it("adds Tk-style zero-geometry ROI and anchor drafts without auto-linking the selected ROI", () => {
    expect(workspaceUiClientJs).toContain("nextUniqueName('new_roi')");
    expect(workspaceUiClientJs).toContain("const roi = { name, active: true, x: 0, y: 0, w: 0, h: 0 }");
    expect(workspaceUiClientJs).toContain("nextUniqueName('new_anchor')");
    expect(workspaceUiClientJs).toContain("const anchor = { name, active: true, x: 0, y: 0 }");
    expect(workspaceUiClientJs).not.toContain("anchor.linked_ROIs = [state.selected.name]");
    expect(workspaceUiClientJs).not.toContain("anchor.linked_observables = [state.selected.name]");
  });

  it("suppresses only the synthetic canvas click after a drag gesture", () => {
    expect(workspaceUiClientJs).toContain("state.suppressNextCanvasClick && target.closest('svg.workspace-canvas')");
    expect(workspaceUiClientJs).not.toContain("if (state.suppressNextCanvasClick) {\n    state.suppressNextCanvasClick = false;\n    event?.preventDefault?.();");
  });

  it("picks anchors by updating the selected anchor instead of adding a new anchor", () => {
    expect(workspaceUiClientJs).toContain("updateSelectedAnchorPoint");
    expect(workspaceUiClientJs).not.toContain("addAnchor(point.x, point.y)");
  });

  it("requires the correct selected item before entering draw ROI or pick anchor mode", () => {
    expect(workspaceUiClientJs).toContain("function setMode");
    expect(workspaceUiClientJs).toContain("if (mode === 'draw-roi' && !selectedRoi())");
    expect(workspaceUiClientJs).toContain("Select an ROI item first (or Add ROI).");
    expect(workspaceUiClientJs).toContain("if (mode === 'pick-anchor' && !selectedAnchor())");
    expect(workspaceUiClientJs).toContain("Select an Anchor item first (or Add Anchor).");
    expect(workspaceUiClientJs).toContain("state.mode = mode");
    expect(workspaceUiClientJs).not.toContain("state.mode = MODES.includes(actionNode.dataset.mode) ? actionNode.dataset.mode : MODES[0]");
  });

  it("turns dead-server fetch failures into actionable reconnect guidance", () => {
    expect(workspaceUiClientJs).toContain("try {");
    expect(workspaceUiClientJs).toContain("Server disconnected");
    expect(workspaceUiClientJs).toContain("/quailbot-workspace open");
    expect(workspaceUiClientJs).toContain("state.disconnected");
  });

  it("refreshes the screenshot through the authenticated local capture route", () => {
    expect(workspaceUiClientJs).toContain("async function refreshCapture");
    expect(workspaceUiClientJs).toContain("/api/capture?token=");
    expect(workspaceUiClientJs).toContain("x-quailbot-workspace-ui-token");
    expect(workspaceUiClientJs).toContain("state.captureFrame = body.captureFrame");
  });

  it("keeps passive canvas layers from intercepting draw and pick clicks", () => {
    expect(workspaceUiCss).toMatch(/\.workspace-capture\s*\{[^}]*pointer-events:\s*none;?/s);
    expect(workspaceUiCss).toMatch(/\.canvas-grid\s*\{[^}]*pointer-events:\s*none;?/s);
    expect(workspaceUiCss).toMatch(/\.canvas-frame\s*\{[^}]*pointer-events:\s*none;?/s);
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
