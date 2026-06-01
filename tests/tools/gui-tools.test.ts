import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadWorkspace } from "../../src/workspace/load-workspace.js";
import type { Workspace } from "../../src/workspace/types.js";
import { executeClickAnchor } from "../../src/tools/click_anchor.js";
import { executeObserve } from "../../src/tools/observe.js";
import { registerQuailbotTools } from "../../src/tools/register-tools.js";
import { executeSetField } from "../../src/tools/set_field.js";

describe("GUI backup tool boundaries", () => {
  it("executeObserve validates requested active ROI names and refs before reporting backend unavailable", async () => {
    const workspace = workspaceWithRois();

    await expect(executeObserve({ workspace }, { rois: ["missing_roi"] })).rejects.toThrow(
      /unknown or inactive ROI: missing_roi/,
    );
    await expect(executeObserve({ workspace }, { rois: ["inactive_roi"] })).rejects.toThrow(
      /unknown or inactive ROI: inactive_roi/,
    );

    const result = await executeObserve({ workspace }, { rois: ["named_roi", "roi:ref-only"] });

    expect(result).toMatchObject({
      ok: false,
      action: "observe",
      action_input: { rois: ["named_roi", "roi:ref-only"] },
      primary_result: {
        requested_rois: ["named_roi", "roi:ref-only"],
        error_type: "roi_backend_unavailable",
        message: "ROI screenshot/OCR backend is not configured in this plugin implementation round.",
      },
    });
  });

  it("executeObserve defaults to active workspace ROI names", async () => {
    const workspace = fixtureWorkspace();
    workspace.rois.push(
      { ref: "roi:first", name: "first", active: true, linkedObservables: [], schema: {} },
      { ref: "roi:second", name: "second", active: false, linkedObservables: [], schema: {} },
      { ref: "roi:third", active: true, linkedObservables: [], schema: {} },
    );

    const result = await executeObserve({ workspace }, {});

    expect(result.primary_result).toMatchObject({ requested_rois: ["first", "roi:third"] });
  });

  it("executeClickAnchor throws for unknown or inactive anchors and reports unavailable for active anchors", async () => {
    const workspace = workspaceWithAnchors();

    await expect(executeClickAnchor({ workspace }, { anchor: "missing" })).rejects.toThrow(
      /unknown or inactive anchor: missing/,
    );
    await expect(executeClickAnchor({ workspace }, { anchor: "inactive_anchor" })).rejects.toThrow(
      /unknown or inactive anchor: inactive_anchor/,
    );

    const result = await executeClickAnchor({ workspace }, { anchor: "active_anchor", rois: ["status_roi"] });

    expect(result).toMatchObject({
      ok: false,
      action: "click_anchor",
      action_input: { anchor: "active_anchor", rois: ["status_roi"] },
      primary_result: {
        anchor: "active_anchor",
        error_type: "gui_backend_unavailable",
        message: "GUI click backend is not configured in this plugin implementation round.",
      },
    });
  });

  it("executeClickAnchor accepts active anchor refs including ref-only anchors", async () => {
    const workspace = workspaceWithAnchors();

    const result = await executeClickAnchor({ workspace }, { anchor: "anchor:ref-only" });

    expect(result).toMatchObject({
      ok: false,
      action: "click_anchor",
      action_input: { anchor: "anchor:ref-only" },
      primary_result: {
        anchor: "anchor:ref-only",
        error_type: "gui_backend_unavailable",
      },
    });
  });

  it("executeSetField throws for unknown or inactive anchors and reports unavailable for active anchors", async () => {
    const workspace = workspaceWithAnchors();

    await expect(executeSetField({ workspace }, { anchor: "missing", typed_text: "42" })).rejects.toThrow(
      /unknown or inactive anchor: missing/,
    );
    await expect(executeSetField({ workspace }, { anchor: "inactive_anchor", typed_text: "42" })).rejects.toThrow(
      /unknown or inactive anchor: inactive_anchor/,
    );

    const result = await executeSetField(
      { workspace },
      { anchor: "active_anchor", typed_text: "42", submit: "enter", rois: ["status_roi"] },
    );

    expect(result).toMatchObject({
      ok: false,
      action: "set_field",
      action_input: { anchor: "active_anchor", typed_text: "42", submit: "enter", rois: ["status_roi"] },
      primary_result: {
        anchor: "active_anchor",
        error_type: "gui_backend_unavailable",
        message: "GUI text-entry backend is not configured in this plugin implementation round.",
      },
    });
  });

  it("executeSetField accepts active anchor refs including ref-only anchors", async () => {
    const workspace = workspaceWithAnchors();

    const result = await executeSetField({ workspace }, { anchor: "anchor:ref-only", typed_text: "42" });

    expect(result).toMatchObject({
      ok: false,
      action: "set_field",
      action_input: { anchor: "anchor:ref-only", typed_text: "42" },
      primary_result: {
        anchor: "anchor:ref-only",
        error_type: "gui_backend_unavailable",
      },
    });
  });

  it("registers GUI backup tools with runtime workspace result envelopes", async () => {
    const tools: Array<{ name: string; parameters: { properties?: Record<string, unknown> }; execute: (id: string, params: unknown) => Promise<unknown> }> = [];
    const workspace = workspaceWithAnchors();
    const pi = {
      registerTool: (tool: { name: string; parameters: { properties?: Record<string, unknown> }; execute: (id: string, params: unknown) => Promise<unknown> }) =>
        tools.push(tool),
    };

    registerQuailbotTools(pi as never, { workspace } as never);

    for (const name of ["observe", "click_anchor", "set_field"]) {
      expect(tools.find((tool) => tool.name === name)).toBeDefined();
    }
    expect(tools.find((tool) => tool.name === "click_anchor")?.parameters.properties?.anchor).toMatchObject({ minLength: 1 });
    expect(tools.find((tool) => tool.name === "set_field")?.parameters.properties?.typed_text).toMatchObject({ minLength: 1 });

    const clickResult = await tools.find((tool) => tool.name === "click_anchor")?.execute("tool-call", { anchor: "active_anchor" });

    expect(clickResult).toMatchObject({
      details: { ok: false, action: "click_anchor", primary_result: { error_type: "gui_backend_unavailable" } },
      content: [{ type: "text" }],
    });
  });
});

function fixtureWorkspace(): Workspace {
  return loadWorkspace(join(process.cwd(), "tests/workspaces/nanonis-minimal.workspace.json"));
}

function workspaceWithRois(): Workspace {
  const workspace = fixtureWorkspace();
  workspace.rois.push(
    { ref: "roi:named", name: "named_roi", active: true, linkedObservables: [], schema: {} },
    { ref: "roi:inactive", name: "inactive_roi", active: false, linkedObservables: [], schema: {} },
    { ref: "roi:ref-only", active: true, linkedObservables: [], schema: {} },
  );
  return workspace;
}

function workspaceWithAnchors(): Workspace {
  const workspace = fixtureWorkspace();
  workspace.anchors.push(
    {
      ref: "anchor:active",
      name: "active_anchor",
      active: true,
      linkedObservables: [],
      linkedRois: [],
      schema: {},
    },
    {
      ref: "anchor:inactive",
      name: "inactive_anchor",
      active: false,
      linkedObservables: [],
      linkedRois: [],
      schema: {},
    },
    {
      ref: "anchor:ref-only",
      active: true,
      linkedObservables: [],
      linkedRois: [],
      schema: {},
    },
  );
  return workspace;
}
