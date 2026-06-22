import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { loadWorkspace } from "../../src/workspace/load-workspace.js";
import type { Workspace } from "../../src/workspace/types.js";
import { executeClickAnchor } from "../../src/tools/click_anchor.js";
import { executeObserve } from "../../src/tools/observe.js";
import { disabledMutationPolicy, enabledMutationPolicy, mutationPolicyDisabledResult, MUTATION_POLICY_ENV_VAR } from "../../src/tools/mutation-policy.js";
import { registerQuailbotTools } from "../../src/tools/register-tools.js";
import { createToolContext } from "../../src/tools/tool-context.js";
import { executeSetField } from "../../src/tools/set_field.js";

describe("GUI backup tool boundaries", () => {
  it("executeObserve validates requested active ROI names and refs before capturing screenshots", async () => {
    const workspace = workspaceWithRois();

    await expect(executeObserve({ workspace }, { rois: ["missing_roi"] })).rejects.toThrow(
      /unknown or inactive ROI: missing_roi/,
    );
    await expect(executeObserve({ workspace }, { rois: ["inactive_roi"] })).rejects.toThrow(
      /unknown or inactive ROI: inactive_roi/,
    );

    const result = await executeObserve(
      { workspace, roiCaptureBackend: fakeRoiCaptureBackend(), modelSupportsImages: true },
      { rois: ["named_roi", "roi:ref-only"] },
    );

    expect(result).toMatchObject({
      ok: true,
      action: "observe",
      action_input: { rois: ["named_roi", "roi:ref-only"] },
      primary_result: {
        ok: true,
        requested_rois: ["named_roi", "roi:ref-only"],
        channels: {
          roi: {
            rois: ["roi:named", "roi:ref-only"],
            unavailable: [],
            results: {
              "roi:named": { ok: true, image_path: expect.stringContaining("roi-named_roi.png"), attached_image: true },
              "roi:ref-only": { ok: true, image_path: expect.stringContaining("roi-roi_ref-only.png"), attached_image: true },
            },
          },
        },
      },
    });
    expect(result.model_content).toEqual([
      { type: "image", data: TEST_PNG_BASE64, mimeType: "image/png" },
      { type: "image", data: TEST_PNG_BASE64, mimeType: "image/png" },
    ]);
  });

  it("executeObserve warns and omits image blocks when the model cannot read images", async () => {
    const workspace = workspaceWithRois();
    const warnings: string[] = [];

    const result = await executeObserve(
      {
        workspace,
        roiCaptureBackend: fakeRoiCaptureBackend(),
        modelSupportsImages: false,
        notifyWarning: (message) => warnings.push(message),
      },
      { rois: ["named_roi"] },
    );

    expect(result.ok).toBe(true);
    expect(result.model_content).toBeUndefined();
    expect(warnings).toEqual([
      "ROI screenshots were captured, but the current model does not accept image input; continuing with ROI metadata only.",
    ]);
    expect(result.primary_result).toMatchObject({
      channels: { roi: { warnings, results: { "roi:named": { ok: true, attached_image: false } } } },
    });
  });

  it("executeObserve attaches image blocks when model image support is unknown", async () => {
    const workspace = workspaceWithRois();

    const result = await executeObserve(
      { workspace, roiCaptureBackend: fakeRoiCaptureBackend() },
      { rois: ["named_roi"] },
    );

    expect(result.ok).toBe(true);
    expect(result.model_content).toEqual([
      { type: "image", data: TEST_PNG_BASE64, mimeType: "image/png" },
    ]);
    expect(result.primary_result).toMatchObject({
      channels: { roi: { warnings: [], results: { "roi:named": { ok: true, attached_image: true, model_can_read_image: true } } } },
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

  it("blocks click_anchor and set_field before validation or backend execution when mutation policy is disabled", async () => {
    const workspace = workspaceWithAnchors();
    const ctx = createToolContext({ workspace, mutationPolicy: disabledMutationPolicy() });

    await expect(executeClickAnchor(ctx, { anchor: "missing" })).resolves.toEqual(
      mutationPolicyDisabledResult("click_anchor", { anchor: "missing" }),
    );
    await expect(executeSetField(ctx, { anchor: "missing", typed_text: "" })).resolves.toEqual(
      mutationPolicyDisabledResult("set_field", { anchor: "missing", typed_text: "" }),
    );
  });

  it("executeClickAnchor throws for unknown or inactive anchors and reports unavailable for active anchors", async () => {
    const workspace = workspaceWithAnchors();

    await expect(executeClickAnchor(toolCtx(workspace), { anchor: "missing" })).rejects.toThrow(
      /unknown or inactive anchor: missing/,
    );
    await expect(executeClickAnchor(toolCtx(workspace), { anchor: "inactive_anchor" })).rejects.toThrow(
      /unknown or inactive anchor: inactive_anchor/,
    );

    const result = await executeClickAnchor(toolCtx(workspace), { anchor: "active_anchor", rois: ["status_roi"] });

    expect(result).toMatchObject({
      ok: false,
      action: "click_anchor",
      action_input: { anchor: "active_anchor", rois: ["status_roi"] },
      primary_result: {
        ok: false,
        anchor: "active_anchor",
        error_type: "gui_backend_unavailable",
        message: "GUI click backend is not configured for this execution context.",
      },
    });
  });

  it("executeClickAnchor invokes the GUI backend for active anchors", async () => {
    const workspace = workspaceWithAnchors();
    const guiActionBackend = {
      clickAnchor: vi.fn().mockResolvedValue({ ok: true, backend: "fake_gui", point: { x: 11, y: 22 } }),
      setField: vi.fn(),
    };

    const result = await executeClickAnchor(toolCtx(workspace, { guiActionBackend }), { anchor: "active_anchor" });

    expect(guiActionBackend.clickAnchor).toHaveBeenCalledWith({
      anchor: expect.objectContaining({ name: "active_anchor", schema: { x: 11, y: 22 } }),
    });
    expect(result).toMatchObject({
      ok: true,
      primary_result: {
        ok: true,
        anchor: "active_anchor",
        backend: "fake_gui",
        point: { x: 11, y: 22 },
      },
    });
  });

  it("executeClickAnchor rejects unknown or inactive ROI readbacks", async () => {
    const workspace = workspaceWithAnchors();

    await expect(
      executeClickAnchor(toolCtx(workspace), { anchor: "active_anchor", rois: ["missing_roi"] }),
    ).rejects.toThrow(
      /unknown or inactive ROI: missing_roi/,
    );
    await expect(
      executeClickAnchor(toolCtx(workspace), { anchor: "active_anchor", rois: ["inactive_roi"] }),
    ).rejects.toThrow(
      /unknown or inactive ROI: inactive_roi/,
    );
  });

  it("executeClickAnchor accepts active anchor refs including ref-only anchors", async () => {
    const workspace = workspaceWithAnchors();

    const result = await executeClickAnchor(toolCtx(workspace), { anchor: "anchor:ref-only" });

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

    await expect(executeSetField(toolCtx(workspace), { anchor: "missing", typed_text: "42" })).rejects.toThrow(
      /unknown or inactive anchor: missing/,
    );
    await expect(executeSetField(toolCtx(workspace), { anchor: "inactive_anchor", typed_text: "42" })).rejects.toThrow(
      /unknown or inactive anchor: inactive_anchor/,
    );

    const result = await executeSetField(toolCtx(workspace), {
      anchor: "active_anchor",
      typed_text: "42",
      submit: "enter",
      rois: ["status_roi"],
    });

    expect(result).toMatchObject({
      ok: false,
      action: "set_field",
      action_input: { anchor: "active_anchor", typed_text: "42", submit: "enter", rois: ["status_roi"] },
      primary_result: {
        ok: false,
        anchor: "active_anchor",
        error_type: "gui_backend_unavailable",
        message: "GUI text-entry backend is not configured for this execution context.",
      },
    });
  });

  it("executeSetField invokes the GUI backend with legacy clear-then-type semantics", async () => {
    const workspace = workspaceWithAnchors();
    const guiActionBackend = {
      clickAnchor: vi.fn(),
      setField: vi.fn().mockResolvedValue({ ok: true, backend: "fake_gui", point: { x: 11, y: 22 } }),
    };

    const result = await executeSetField(toolCtx(workspace, { guiActionBackend }), {
      anchor: "active_anchor",
      typed_text: "400",
      submit: "tab",
    });

    expect(guiActionBackend.setField).toHaveBeenCalledWith({
      anchor: expect.objectContaining({ name: "active_anchor", schema: { x: 11, y: 22 } }),
      typedText: "400",
      submit: "tab",
    });
    expect(result).toMatchObject({
      ok: true,
      primary_result: {
        ok: true,
        anchor: "active_anchor",
        typed_text: "400",
        submit: "tab",
        backend: "fake_gui",
        point: { x: 11, y: 22 },
        clear_strategy: "legacy_pyautogui_sequence",
      },
    });
  });

  it("executeSetField rejects unknown or inactive ROI readbacks", async () => {
    const workspace = workspaceWithAnchors();

    await expect(
      executeSetField(
        toolCtx(workspace),
        { anchor: "active_anchor", typed_text: "42", rois: ["missing_roi"] },
      ),
    ).rejects.toThrow(/unknown or inactive ROI: missing_roi/);
    await expect(
      executeSetField(
        toolCtx(workspace),
        { anchor: "active_anchor", typed_text: "42", rois: ["inactive_roi"] },
      ),
    ).rejects.toThrow(/unknown or inactive ROI: inactive_roi/);
  });

  it("executeSetField rejects invalid text-entry arguments", async () => {
    const workspace = workspaceWithAnchors();

    await expect(executeSetField(toolCtx(workspace), { anchor: "active_anchor", typed_text: "" })).rejects.toThrow(
      /set_field requires non-empty typed_text/,
    );
    await expect(executeSetField(toolCtx(workspace), { anchor: "active_anchor", typed_text: 42 } as never)).rejects.toThrow(
      /set_field requires non-empty typed_text/,
    );
    await expect(
      executeSetField(toolCtx(workspace), { anchor: "active_anchor", typed_text: "42", submit: "escape" } as never),
    ).rejects.toThrow(/set_field submit must be enter or tab/);
  });

  it("executeSetField accepts active anchor refs including ref-only anchors", async () => {
    const workspace = workspaceWithAnchors();

    const result = await executeSetField(toolCtx(workspace), { anchor: "anchor:ref-only", typed_text: "42" });

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

    const previous = process.env[MUTATION_POLICY_ENV_VAR];
    process.env[MUTATION_POLICY_ENV_VAR] = "1";

    try {
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
    } finally {
      if (previous === undefined) {
        delete process.env[MUTATION_POLICY_ENV_VAR];
      } else {
        process.env[MUTATION_POLICY_ENV_VAR] = previous;
      }
    }
  });
});

function fixtureWorkspace(): Workspace {
  return loadWorkspace(join(process.cwd(), "tests/workspaces/nanonis-minimal.workspace.json"));
}

function workspaceWithRois(): Workspace {
  const workspace = fixtureWorkspace();
  workspace.rois.push(
    { ref: "roi:named", name: "named_roi", active: true, linkedObservables: [], schema: { x: 1, y: 2, w: 3, h: 4 } },
    { ref: "roi:inactive", name: "inactive_roi", active: false, linkedObservables: [], schema: { x: 1, y: 2, w: 3, h: 4 } },
    { ref: "roi:ref-only", active: true, linkedObservables: [], schema: { x: 5, y: 6, w: 7, h: 8 } },
  );
  return workspace;
}

function workspaceWithAnchors(): Workspace {
  const workspace = fixtureWorkspace();
  workspace.rois.push(
    { ref: "roi:status", name: "status_roi", active: true, linkedObservables: [], schema: { x: 1, y: 2, w: 3, h: 4 } },
    { ref: "roi:inactive", name: "inactive_roi", active: false, linkedObservables: [], schema: { x: 1, y: 2, w: 3, h: 4 } },
  );
  workspace.anchors.push(
    {
      ref: "anchor:active",
      name: "active_anchor",
      active: true,
      linkedObservables: [],
      linkedRois: [],
      schema: { x: 11, y: 22 },
    },
    {
      ref: "anchor:inactive",
      name: "inactive_anchor",
      active: false,
      linkedObservables: [],
      linkedRois: [],
      schema: { x: 33, y: 44 },
    },
    {
      ref: "anchor:ref-only",
      active: true,
      linkedObservables: [],
      linkedRois: [],
      schema: { x: 55, y: 66 },
    },
  );
  return workspace;
}

const TEST_PNG_BASE64 = "iVBORw0KGgo=";

function fakeRoiCaptureBackend() {
  return async ({ rois }: { rois: Workspace["rois"] }) =>
    rois.map((roi) => ({
      ref: roi.ref,
      ...(roi.name === undefined ? {} : { name: roi.name }),
      rect: roi.schema as { x: number; y: number; w: number; h: number },
      imagePath: `C:\\tmp\\roi-${(roi.name ?? roi.ref).replace(/[^A-Za-z0-9_.-]+/g, "_")}.png`,
      mimeType: "image/png" as const,
      width: Number(roi.schema.w),
      height: Number(roi.schema.h),
      captureId: "capture-test",
      data: TEST_PNG_BASE64,
    }));
}

function toolCtx(workspace: Workspace, overrides: Partial<Parameters<typeof createToolContext>[0]> = {}) {
  return createToolContext({ workspace, mutationPolicy: enabledMutationPolicy(), runCli: vi.fn(), ...overrides });
}
