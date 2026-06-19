import { describe, expect, it } from "vitest";

import { canvasBeginDrawRoi } from "../../../src/workspace-ui/client/actions.js";
import { attachCanvasEvents } from "../../../src/workspace-ui/client/events/canvas.js";
import { createStore } from "../../../src/workspace-ui/client/store.js";
import { initialState, type AppState } from "../../../src/workspace-ui/client/state.js";
import { effectiveScale, nextZoom, type CaptureFrame } from "../../../src/workspace-ui/shared/geometry.js";

const frame: CaptureFrame = { imageWidth: 1000, imageHeight: 1000, originX: 0, originY: 0, captureId: "zoom" };

function fixtureState(canvas: Partial<AppState["canvas"]> = {}): AppState {
  return {
    ...initialState(),
    workspace: { ...initialState().workspace, rois: [{ name: "roi-a", x: 0, y: 0, w: 10, h: 10, description: "", tags: "", active: true, group: "" }] },
    tree: { ...initialState().tree, selected: [{ kind: "roi", name: "roi-a" }], activeAnchor: { kind: "roi", name: "roi-a" } },
    canvas: { ...initialState().canvas, frame, viewport: { width: 500, height: 500 }, ...canvas },
  };
}

function mount(state: AppState) {
  const root = document.createElement("div");
  root.innerHTML = '<div class="canvas-viewport"></div>';
  const viewport = root.querySelector<HTMLElement>(".canvas-viewport")!;
  Object.defineProperty(viewport, "getBoundingClientRect", { value: () => ({ left: 0, top: 0, width: 500, height: 500, right: 500, bottom: 500, x: 0, y: 0, toJSON: () => ({}) }) });
  const store = createStore(state);
  const off = attachCanvasEvents(root, store.dispatch, store.getState);
  return { root, store, off };
}

function wheel(root: HTMLElement, init: WheelEventInit) {
  const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: 200, clientY: 150, ...init });
  root.querySelector(".canvas-viewport")?.dispatchEvent(event);
  return event;
}

describe("canvas zoom", () => {
  it("Ctrl+wheel zooms and keeps the screen point under the pointer stable", () => {
    const { root, store } = mount(fixtureState({ pan: { x: 0, y: 25 } }));
    const before = store.getState();
    const oldScale = effectiveScale(frame, { ...before.canvas.viewport, zoom: before.canvas.zoom });
    const clientPoint = { x: 200, y: 150 };
    const oldScreenPoint = { x: (clientPoint.x + before.canvas.pan.x) / oldScale, y: (clientPoint.y + before.canvas.pan.y) / oldScale };

    const event = wheel(root, { ctrlKey: true, deltaY: -100 });

    expect(event.defaultPrevented).toBe(true);
    const after = store.getState();
    const newScale = effectiveScale(frame, { ...after.canvas.viewport, zoom: after.canvas.zoom });
    const newScreenPoint = { x: (clientPoint.x + after.canvas.pan.x) / newScale, y: (clientPoint.y + after.canvas.pan.y) / newScale };
    expect(after.canvas.zoom).toBe(nextZoom(1, 1));
    expect(newScreenPoint.x).toBeCloseTo(oldScreenPoint.x, 6);
    expect(Math.abs(newScreenPoint.y - oldScreenPoint.y)).toBeLessThanOrEqual(1);
  });

  it("suppresses zoom in draw mode", () => {
    const { root, store } = mount(fixtureState());
    store.dispatch(canvasBeginDrawRoi());

    wheel(root, { ctrlKey: true, deltaY: -100 });

    expect(store.getState().canvas.zoom).toBe(1);
    expect(store.getState().canvas.mode).toBe("draw_roi");
  });

  it("clamps zoom at the configured boundaries", () => {
    const atMax = mount(fixtureState({ zoom: 6 }));
    wheel(atMax.root, { ctrlKey: true, deltaY: -100 });
    expect(atMax.store.getState().canvas.zoom).toBe(6);

    const atMin = mount(fixtureState({ zoom: 0.25 }));
    wheel(atMin.root, { ctrlKey: true, deltaY: 100 });
    expect(atMin.store.getState().canvas.zoom).toBe(0.25);
  });
});
