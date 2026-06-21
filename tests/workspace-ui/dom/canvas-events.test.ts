import { describe, expect, it } from "vitest";

import { canvasBeginDrawRoi, canvasBeginPickAnchor } from "../../../src/workspace-ui/client/actions.js";
import { attachCanvasEvents } from "../../../src/workspace-ui/client/events/canvas.js";
import { renderCanvas } from "../../../src/workspace-ui/client/render/canvas.js";
import { createStore } from "../../../src/workspace-ui/client/store.js";
import { initialState, type AppState } from "../../../src/workspace-ui/client/state.js";
import { dragToRoi, effectiveScale, canvasToScreen, type CaptureFrame } from "../../../src/workspace-ui/shared/geometry.js";

const frame: CaptureFrame = { imageWidth: 1000, imageHeight: 500, originX: -100, originY: 20, captureId: "events" };

function fixtureState(): AppState {
  return {
    ...initialState(),
    workspace: {
      ...initialState().workspace,
      rois: [{ name: "roi-a", x: 0, y: 0, w: 1, h: 1, description: "", tags: "", active: true, group: "" }],
      anchors: [{ name: "anchor-a", x: 0, y: 0, description: "", tags: "", linked_rois: [], active: true, group: "" }],
    },
    tree: { ...initialState().tree, selected: [{ kind: "roi", name: "roi-a" }], activeAnchor: { kind: "roi", name: "roi-a" } },
    canvas: { ...initialState().canvas, frame, viewport: { width: 500, height: 400 }, pan: { x: 40, y: 10 } },
  };
}

function mount(state = fixtureState()) {
  const root = document.createElement("div");
  Object.defineProperty(root, "getBoundingClientRect", { value: () => ({ left: 10, top: 20, width: 500, height: 400, right: 510, bottom: 420, x: 10, y: 20, toJSON: () => ({}) }) });
  const store = createStore(state);
  store.subscribe(() => renderCanvas(root, store.getState()));
  renderCanvas(root, store.getState());
  const off = attachCanvasEvents(root, store.dispatch, store.getState);
  return { root, store, off };
}

function pointer(root: HTMLElement, type: string, clientX: number, clientY: number) {
  root.querySelector(".canvas-viewport")?.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX, clientY }));
}

function wheel(root: HTMLElement, options: WheelEventInit) {
  const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: 210, clientY: 220, ...options });
  root.querySelector(".canvas-viewport")?.dispatchEvent(event);
  return event;
}

describe("canvas events", () => {
  it("draws an ROI from pointer down through release using panned canvas coordinates", () => {
    const { root, store, off } = mount();
    const scale = effectiveScale(frame, { ...store.getState().canvas.viewport, zoom: 1 });
    store.dispatch(canvasBeginDrawRoi());

    pointer(root, "pointerdown", 110, 120);
    pointer(root, "pointermove", 210, 220);
    pointer(root, "pointerup", 250, 260);

    expect(store.getState().canvas.mode).toBe("idle");
    expect(store.getState().canvas.draftDrag).toBeNull();
    expect(store.getState().workspace.rois[0]).toMatchObject(dragToRoi(frame, scale, { x: 140, y: 110 }, { x: 280, y: 250 }));
    off();
  });

  it("draws an ROI from ordinary mouse events for Tk-style browser input", () => {
    const state = fixtureState();
    state.form.buffers = { x: "0", y: "0", w: "0", h: "0" };
    const { root, store, off } = mount(state);
    const scale = effectiveScale(frame, { ...store.getState().canvas.viewport, zoom: 1 });
    store.dispatch(canvasBeginDrawRoi());

    pointer(root, "mousedown", 110, 120);
    pointer(root, "mousemove", 210, 220);
    pointer(root, "mouseup", 250, 260);

    expect(store.getState().canvas.mode).toBe("idle");
    expect(store.getState().canvas.draftDrag).toBeNull();
    expect(store.getState().workspace.rois[0]).toMatchObject(dragToRoi(frame, scale, { x: 140, y: 110 }, { x: 280, y: 250 }));
    expect(store.getState().form.buffers).toEqual({});
    expect(store.getState().form.history).toEqual({});
    off();
  });

  it("pick-anchor mouse click writes selected anchor screen coordinates and exits pick mode", () => {
    const state = fixtureState();
    state.tree.selected = [{ kind: "anchor", name: "anchor-a" }];
    state.form.buffers = { x: "0", y: "0" };
    const { root, store } = mount(state);
    const scale = effectiveScale(frame, { ...store.getState().canvas.viewport, zoom: 1 });
    store.dispatch(canvasBeginPickAnchor());

    pointer(root, "mousedown", 160, 170);

    expect(store.getState().canvas.mode).toBe("idle");
    expect(store.getState().workspace.anchors[0]).toMatchObject(canvasToScreen(frame, scale, { x: 190, y: 160 }));
    expect(store.getState().form.buffers).toEqual({});
    expect(store.getState().form.history).toEqual({});
  });

  it("pick-anchor click writes selected anchor screen coordinates and exits pick mode", () => {
    const state = fixtureState();
    state.tree.selected = [{ kind: "anchor", name: "anchor-a" }];
    const { root, store } = mount(state);
    const scale = effectiveScale(frame, { ...store.getState().canvas.viewport, zoom: 1 });
    store.dispatch(canvasBeginPickAnchor());

    pointer(root, "pointerdown", 160, 170);

    expect(store.getState().canvas.mode).toBe("idle");
    expect(store.getState().workspace.anchors[0]).toMatchObject(canvasToScreen(frame, scale, { x: 190, y: 160 }));
  });

  it("commits a draw drag when pointerup occurs outside the viewport", () => {
    const { root, store } = mount();
    const scale = effectiveScale(frame, { ...store.getState().canvas.viewport, zoom: 1 });
    store.dispatch(canvasBeginDrawRoi());

    pointer(root, "pointerdown", 20, 30);
    window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 610, clientY: 520 }));

    expect(store.getState().workspace.rois[0]).toMatchObject(dragToRoi(frame, scale, { x: 50, y: 20 }, { x: 640, y: 510 }));
    expect(store.getState().canvas.mode).toBe("idle");
  });

  it("maps preview wheel gestures to Tk-style vertical and horizontal panning", () => {
    const state = fixtureState();
    state.canvas.zoom = 2;
    const { root, store, off } = mount(state);

    const vertical = wheel(root, { deltaY: 50 });
    expect(vertical.defaultPrevented).toBe(true);
    expect(store.getState().canvas.pan).toEqual({ x: 40, y: 60 });

    const horizontalShift = wheel(root, { deltaY: 30, shiftKey: true });
    expect(horizontalShift.defaultPrevented).toBe(true);
    expect(store.getState().canvas.pan).toEqual({ x: 70, y: 60 });

    const horizontalAlt = wheel(root, { deltaY: -20, altKey: true });
    expect(horizontalAlt.defaultPrevented).toBe(true);
    expect(store.getState().canvas.pan).toEqual({ x: 50, y: 60 });
    off();
  });

  it("zooms around the pointer on Ctrl-wheel and ignores zoom while drawing", () => {
    const state = fixtureState();
    state.canvas.zoom = 2;
    const { root, store, off } = mount(state);
    const before = store.getState().canvas;

    const zoomIn = wheel(root, { deltaY: -120, ctrlKey: true });
    expect(zoomIn.defaultPrevented).toBe(true);
    expect(store.getState().canvas.zoom).toBeCloseTo(2.2);
    expect(store.getState().canvas.pan).not.toEqual(before.pan);

    store.dispatch(canvasBeginDrawRoi());
    const duringDraw = store.getState().canvas;
    const blocked = wheel(root, { deltaY: -120, ctrlKey: true });
    expect(blocked.defaultPrevented).toBe(true);
    expect(store.getState().canvas.zoom).toBe(duringDraw.zoom);
    expect(store.getState().canvas.pan).toEqual(duringDraw.pan);
    off();
  });
});
