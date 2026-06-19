import {
  canvasPanWheel,
  canvasPointerDown,
  canvasPointerMove,
  canvasPointerUp,
  canvasViewportChanged,
  canvasZoomAtPointer,
  type Action,
} from "../actions.js";
import type { AppState } from "../state.js";

type Dispatch = (action: Action) => void;

function viewportFor(rootEl: HTMLElement, target: EventTarget | null): HTMLElement | null {
  if (target instanceof Element) {
    const found = target.closest<HTMLElement>(".canvas-viewport");
    if (found && rootEl.contains(found)) {
      return found;
    }
  }
  return rootEl.querySelector<HTMLElement>(".canvas-viewport");
}

function usefulRect(el: HTMLElement, rootEl: HTMLElement): DOMRect {
  const rect = el.getBoundingClientRect();
  if (rect.width !== 0 || rect.height !== 0 || rect.left !== 0 || rect.top !== 0) {
    return rect;
  }
  return rootEl.getBoundingClientRect();
}

function eventCanvasPoint(rootEl: HTMLElement, target: EventTarget | null, clientX: number, clientY: number, state: AppState): { x: number; y: number } | null {
  const viewport = viewportFor(rootEl, target);
  if (!viewport) {
    return null;
  }
  const rect = usefulRect(viewport, rootEl);
  return {
    x: clientX - rect.left + state.canvas.pan.x,
    y: clientY - rect.top + state.canvas.pan.y,
  };
}

export function attachCanvasEvents(rootEl: HTMLElement, dispatch: Dispatch, getState: () => AppState): () => void {
  let resizeTimer: ReturnType<typeof setTimeout> | null = null;

  const dispatchViewportSize = (width: number, height: number): void => {
    if (resizeTimer !== null) {
      clearTimeout(resizeTimer);
    }
    resizeTimer = setTimeout(() => {
      dispatch(canvasViewportChanged(width, height));
      resizeTimer = null;
    }, 75);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (!viewportFor(rootEl, event.target)) {
      return;
    }
    const point = eventCanvasPoint(rootEl, event.target, event.clientX, event.clientY, getState());
    if (point) {
      dispatch(canvasPointerDown(point.x, point.y));
    }
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!viewportFor(rootEl, event.target)) {
      return;
    }
    const point = eventCanvasPoint(rootEl, event.target, event.clientX, event.clientY, getState());
    if (point) {
      dispatch(canvasPointerMove(point.x, point.y));
    }
  };

  const onPointerUp = (event: PointerEvent): void => {
    const point = eventCanvasPoint(rootEl, event.target, event.clientX, event.clientY, getState());
    if (point) {
      dispatch(canvasPointerUp(point.x, point.y));
    }
  };

  const onWheel = (event: WheelEvent): void => {
    if (!viewportFor(rootEl, event.target)) {
      return;
    }
    event.preventDefault();
    const state = getState();
    const point = eventCanvasPoint(rootEl, event.target, event.clientX, event.clientY, state);
    if (!point) {
      return;
    }
    if (event.ctrlKey) {
      dispatch(canvasZoomAtPointer(event.deltaY < 0 ? 1 : -1, point.x, point.y));
      return;
    }
    if (event.shiftKey || event.altKey) {
      dispatch(canvasPanWheel(event.deltaY, 0));
      return;
    }
    dispatch(canvasPanWheel(0, event.deltaY));
  };

  rootEl.addEventListener("pointerdown", onPointerDown as EventListener);
  rootEl.addEventListener("pointermove", onPointerMove as EventListener);
  rootEl.addEventListener("pointerup", onPointerUp as EventListener);
  window.addEventListener("pointerup", onPointerUp as EventListener);
  rootEl.addEventListener("wheel", onWheel, { passive: false });

  const ResizeObserverCtor = globalThis.ResizeObserver;
  const observer = ResizeObserverCtor
    ? new ResizeObserverCtor((entries) => {
        const entry = entries[0];
        if (!entry) {
          return;
        }
        dispatchViewportSize(entry.contentRect.width, entry.contentRect.height);
      })
    : null;
  observer?.observe(rootEl);

  return () => {
    rootEl.removeEventListener("pointerdown", onPointerDown as EventListener);
    rootEl.removeEventListener("pointermove", onPointerMove as EventListener);
    rootEl.removeEventListener("pointerup", onPointerUp as EventListener);
    window.removeEventListener("pointerup", onPointerUp as EventListener);
    rootEl.removeEventListener("wheel", onWheel);
    observer?.disconnect();
    if (resizeTimer !== null) {
      clearTimeout(resizeTimer);
    }
  };
}
