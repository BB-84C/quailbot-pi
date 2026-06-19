import { describe, expect, it } from "vitest";

import { attachCanvasEvents } from "../../../src/workspace-ui/client/events/canvas.js";
import { createStore } from "../../../src/workspace-ui/client/store.js";
import { initialState, type AppState } from "../../../src/workspace-ui/client/state.js";
import type { CaptureFrame } from "../../../src/workspace-ui/shared/geometry.js";

const frame: CaptureFrame = { imageWidth: 1000, imageHeight: 500, originX: 0, originY: 0, captureId: "pan" };

function fixtureState(canvas: Partial<AppState["canvas"]> = {}): AppState {
  return {
    ...initialState(),
    canvas: { ...initialState().canvas, frame, viewport: { width: 500, height: 250 }, zoom: 2, ...canvas },
  };
}

function mount(state: AppState) {
  const root = document.createElement("div");
  root.innerHTML = '<div class="canvas-viewport"></div>';
  const viewport = root.querySelector<HTMLElement>(".canvas-viewport")!;
  Object.defineProperty(viewport, "getBoundingClientRect", { value: () => ({ left: 0, top: 0, width: 500, height: 250, right: 500, bottom: 250, x: 0, y: 0, toJSON: () => ({}) }) });
  const store = createStore(state);
  attachCanvasEvents(root, store.dispatch, store.getState);
  return { root, store };
}

function wheel(root: HTMLElement, init: WheelEventInit) {
  root.querySelector(".canvas-viewport")?.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: 10, clientY: 10, ...init }));
}

describe("canvas pan wheel", () => {
  it("maps plain wheel to vertical pan", () => {
    const { root, store } = mount(fixtureState());

    wheel(root, { deltaY: 60 });

    expect(store.getState().canvas.pan).toEqual({ x: 0, y: 60 });
  });

  it("maps Shift+wheel and Alt+wheel to horizontal pan", () => {
    const shifted = mount(fixtureState());
    wheel(shifted.root, { shiftKey: true, deltaY: 70 });
    expect(shifted.store.getState().canvas.pan).toEqual({ x: 70, y: 0 });

    const alt = mount(fixtureState());
    wheel(alt.root, { altKey: true, deltaY: 80 });
    expect(alt.store.getState().canvas.pan).toEqual({ x: 80, y: 0 });
  });

  it("clamps pan to rendered image bounds and resets axes smaller than the viewport", () => {
    const large = mount(fixtureState({ pan: { x: 490, y: 240 } }));
    wheel(large.root, { deltaY: 1000 });
    expect(large.store.getState().canvas.pan).toEqual({ x: 490, y: 250 });

    const small = mount(fixtureState({ zoom: 0.25, pan: { x: 100, y: 100 } }));
    wheel(small.root, { deltaY: 100 });
    expect(small.store.getState().canvas.pan).toEqual({ x: 0, y: 0 });
  });
});
