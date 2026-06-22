import { describe, expect, it } from "vitest";

import { renderCanvas } from "../../../src/workspace-ui/client/render/canvas.js";
import { initialState, type AppState } from "../../../src/workspace-ui/client/state.js";
import { effectiveScale, roiToCanvasRect, screenToCanvas, type CaptureFrame } from "../../../src/workspace-ui/shared/geometry.js";

const frame: CaptureFrame = { imageWidth: 1000, imageHeight: 500, originX: -100, originY: 20, captureId: "cap-123" };

function stateWithCanvas(overrides: Partial<AppState["canvas"]> = {}): AppState {
  return {
    ...initialState(),
    workspace: {
      ...initialState().workspace,
      rois: [{ name: "roi-a", x: -50, y: 70, w: 200, h: 80, description: "", tags: "", active: true, group: "" }],
      anchors: [{ name: "anchor-a", x: 100, y: 120, description: "", tags: "", linked_rois: [], active: true, group: "" }],
    },
    tree: { ...initialState().tree, selected: [{ kind: "roi", name: "roi-a" }], activeAnchor: { kind: "roi", name: "roi-a" } },
    canvas: { ...initialState().canvas, frame, viewport: { width: 500, height: 400 }, ...overrides },
  };
}

function num(el: Element | null, attr: string): number {
  expect(el).not.toBeNull();
  return Number(el?.getAttribute(attr));
}

describe("canvas render", () => {
  it("renders an empty placeholder before the first capture", () => {
    const root = document.createElement("div");

    renderCanvas(root, initialState());

    expect(root.querySelector(".canvas-empty")?.textContent).toBe("No capture yet");
    expect(root.querySelector("svg")).toBeNull();
  });

  it("renders the scaled capture image without overlays", () => {
    const root = document.createElement("div");
    document.head.innerHTML = '<meta name="quailbot-workspace-ui-token" content="asset-token">';
    const state = stateWithCanvas();
    state.workspace.rois = [];
    state.workspace.anchors = [];
    const scale = effectiveScale(frame, { ...state.canvas.viewport, zoom: state.canvas.zoom });

    renderCanvas(root, state);
    const firstMarkup = root.innerHTML;
    renderCanvas(root, state);

    expect(root.innerHTML).toBe(firstMarkup);
    const image = root.querySelector("image");
    expect(image?.getAttribute("href")).toBe("/assets/workspace-capture?captureId=cap-123&token=asset-token");
    expect(num(image, "width")).toBe(frame.imageWidth * scale);
    expect(num(image, "height")).toBe(frame.imageHeight * scale);
    expect(root.querySelector("svg")?.getAttribute("viewBox")).toBe(`0 0 ${frame.imageWidth * scale} ${frame.imageHeight * scale}`);
  });

  it("renders a selected ROI using shared roiToCanvasRect geometry", () => {
    const root = document.createElement("div");
    const state = stateWithCanvas();
    state.workspace.rois.push({ name: "roi-b", x: 10, y: 20, w: 30, h: 40, description: "", tags: "", active: true, group: "" });
    const scale = effectiveScale(frame, { ...state.canvas.viewport, zoom: state.canvas.zoom });
    const expected = roiToCanvasRect(frame, scale, state.workspace.rois[0]!);

    renderCanvas(root, state);

    const rect = root.querySelector<SVGRectElement>('rect.canvas-roi[data-name="roi-a"]');
    expect(rect?.classList.contains("canvas-roi--selected")).toBe(true);
    expect(num(rect, "x")).toBe(expected.left);
    expect(num(rect, "y")).toBe(expected.top);
    expect(num(rect, "width")).toBe(expected.width);
    expect(num(rect, "height")).toBe(expected.height);
    expect(rect?.getAttribute("fill")).toBe("none");
    expect(rect?.getAttribute("stroke")).toBe("#00d1ff");
    expect(rect?.getAttribute("stroke-width")).toBe("2");
    expect(root.querySelector('rect.canvas-roi[data-name="roi-b"]')).toBeNull();
  });

  it("renders a selected anchor crosshair using shared screenToCanvas geometry", () => {
    const root = document.createElement("div");
    const state = stateWithCanvas();
    state.tree.selected = [{ kind: "anchor", name: "anchor-a" }];
    const scale = effectiveScale(frame, { ...state.canvas.viewport, zoom: state.canvas.zoom });
    const expected = screenToCanvas(frame, scale, state.workspace.anchors[0]!);

    renderCanvas(root, state);

    const anchor = root.querySelector<SVGGElement>('g.canvas-anchor[data-name="anchor-a"]');
    expect(anchor?.classList.contains("canvas-anchor--selected")).toBe(true);
    const circle = anchor?.querySelector("circle") ?? null;
    const line = anchor?.querySelector("line") ?? null;
    expect(num(circle, "cx")).toBe(expected.x);
    expect(num(circle, "cy")).toBe(expected.y);
    expect(circle?.getAttribute("fill")).toBe("none");
    expect(circle?.getAttribute("stroke")).toBe("#ffcc00");
    expect(circle?.getAttribute("stroke-width")).toBe("2");
    expect(line?.getAttribute("stroke")).toBe("#ffcc00");
    expect(line?.getAttribute("stroke-width")).toBe("2");
  });

  it("does not render ROI or anchor overlays for multi-selection or non-overlay items", () => {
    const root = document.createElement("div");
    const state = stateWithCanvas();

    state.tree.selected = [
      { kind: "roi", name: "roi-a" },
      { kind: "anchor", name: "anchor-a" },
    ];
    renderCanvas(root, state);
    expect(root.querySelector(".canvas-roi")).toBeNull();
    expect(root.querySelector(".canvas-anchor")).toBeNull();

    state.tree.selected = [{ kind: "group", name: "group-a" }];
    renderCanvas(root, state);
    expect(root.querySelector(".canvas-roi")).toBeNull();
    expect(root.querySelector(".canvas-anchor")).toBeNull();
  });

  it("renders draft drag and pan transform at zoom", () => {
    const root = document.createElement("div");
    const state = stateWithCanvas({ zoom: 2, pan: { x: 80, y: 30 }, draftDrag: { startCanvas: { x: 200, y: 150 }, currentCanvas: { x: 120, y: 190 } } });

    renderCanvas(root, state);

    const content = root.querySelector(".canvas-content");
    expect(content?.getAttribute("transform")).toBe("translate(-80 -30)");
    const draft = root.querySelector("rect.canvas-draft-roi");
    expect(num(draft, "x")).toBe(120);
    expect(num(draft, "y")).toBe(150);
    expect(num(draft, "width")).toBe(80);
    expect(num(draft, "height")).toBe(40);
    expect(draft?.getAttribute("fill")).toBe("none");
    expect(draft?.getAttribute("stroke")).toBe("#00d1ff");
  });

  it("reuses the capture image node while only the draft ROI overlay changes", () => {
    const root = document.createElement("div");
    const state = stateWithCanvas();

    renderCanvas(root, state);
    const image = root.querySelector("image.canvas-image");
    expect(image).not.toBeNull();

    renderCanvas(root, {
      ...state,
      canvas: {
        ...state.canvas,
        draftDrag: { startCanvas: { x: 10, y: 20 }, currentCanvas: { x: 40, y: 60 } },
      },
    });

    expect(root.querySelector("image.canvas-image")).toBe(image);
    expect(root.querySelector("rect.canvas-draft-roi")).not.toBeNull();
  });
});
