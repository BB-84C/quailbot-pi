import { canvasToScreen, dragToRoi, effectiveScale, nextZoom, type CaptureFrame } from "../../shared/geometry.js";
import type { CanvasAction } from "../actions.js";
import type { AppState, TreeItemKey } from "../state.js";

type CanvasViewport = AppState["canvas"]["viewport"];
type CanvasPan = AppState["canvas"]["pan"];

function singleSelection(state: AppState, kind: TreeItemKey["kind"]): TreeItemKey | null {
  if (state.tree.selected.length !== 1) {
    return null;
  }
  const selected = state.tree.selected[0];
  return selected && selected.kind === kind ? selected : null;
}

function selectedRoiName(state: AppState): string | null {
  const selected = singleSelection(state, "roi");
  if (!selected) {
    return null;
  }
  return state.workspace.rois.some((roi) => roi.name === selected.name) ? selected.name : null;
}

function selectedAnchorName(state: AppState): string | null {
  const selected = singleSelection(state, "anchor");
  if (!selected) {
    return null;
  }
  return state.workspace.anchors.some((anchor) => anchor.name === selected.name) ? selected.name : null;
}

function scaleFor(state: AppState, zoom = state.canvas.zoom): number | null {
  if (!state.canvas.frame) {
    return null;
  }
  return effectiveScale(state.canvas.frame, { ...state.canvas.viewport, zoom });
}

function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function clampPan(frame: CaptureFrame | null, viewport: CanvasViewport, scale: number, pan: CanvasPan): CanvasPan {
  if (!frame) {
    return { x: 0, y: 0 };
  }
  const renderedWidth = Math.trunc(frame.imageWidth * scale);
  const renderedHeight = Math.trunc(frame.imageHeight * scale);
  const maxX = renderedWidth > viewport.width ? renderedWidth - viewport.width : 0;
  const maxY = renderedHeight > viewport.height ? renderedHeight - viewport.height : 0;
  return {
    x: maxX === 0 ? 0 : clampValue(Math.trunc(pan.x), 0, maxX),
    y: maxY === 0 ? 0 : clampValue(Math.trunc(pan.y), 0, maxY),
  };
}

function withCanvas(state: AppState, canvas: Partial<AppState["canvas"]>): AppState {
  return { ...state, canvas: { ...state.canvas, ...canvas } };
}

function resetFormBuffers(state: AppState): AppState {
  return { ...state, form: { ...state.form, buffers: {}, history: {} } };
}

export function canvasReducer(state: AppState, action: CanvasAction): AppState {
  switch (action.type) {
    case "CANVAS_FRAME_LOADED":
      return withCanvas(state, { frame: action.payload.frame, zoom: 1.0, pan: { x: 0, y: 0 }, mode: "idle", drawingItemName: null, draftDrag: null });
    case "CANVAS_VIEWPORT_CHANGED": {
      const viewport = { width: Math.max(0, action.payload.width), height: Math.max(0, action.payload.height) };
      const scale = state.canvas.frame ? effectiveScale(state.canvas.frame, { ...viewport, zoom: state.canvas.zoom }) : 1;
      return withCanvas(state, { viewport, pan: clampPan(state.canvas.frame, viewport, scale, state.canvas.pan) });
    }
    case "CANVAS_BEGIN_DRAW_ROI": {
      if (!state.canvas.frame) {
        return state;
      }
      const name = selectedRoiName(state);
      return name ? withCanvas(state, { mode: "draw_roi", drawingItemName: name, draftDrag: null }) : state;
    }
    case "CANVAS_BEGIN_PICK_ANCHOR": {
      if (!state.canvas.frame) {
        return state;
      }
      const name = selectedAnchorName(state);
      return name ? withCanvas(state, { mode: "pick_anchor", drawingItemName: name, draftDrag: null }) : state;
    }
    case "CANVAS_POINTER_DOWN": {
      if (!state.canvas.frame) {
        return state;
      }
      if (state.canvas.mode === "draw_roi") {
        const name = state.canvas.drawingItemName && state.workspace.rois.some((roi) => roi.name === state.canvas.drawingItemName) ? state.canvas.drawingItemName : selectedRoiName(state);
        if (!name) {
          return state;
        }
        const point = { x: action.payload.canvasX, y: action.payload.canvasY };
        return withCanvas(state, { drawingItemName: name, draftDrag: { startCanvas: point, currentCanvas: point } });
      }
      if (state.canvas.mode === "pick_anchor") {
        const name = state.canvas.drawingItemName && state.workspace.anchors.some((anchor) => anchor.name === state.canvas.drawingItemName) ? state.canvas.drawingItemName : selectedAnchorName(state);
        const scale = scaleFor(state);
        if (!name || scale === null) {
          return state;
        }
        const point = canvasToScreen(state.canvas.frame, scale, { x: action.payload.canvasX, y: action.payload.canvasY });
        const anchors = state.workspace.anchors.map((anchor) => (anchor.name === name ? { ...anchor, x: point.x, y: point.y } : anchor));
        return resetFormBuffers({
          ...state,
          workspace: { ...state.workspace, anchors },
          canvas: { ...state.canvas, mode: "idle", drawingItemName: null, draftDrag: null },
        });
      }
      return state;
    }
    case "CANVAS_POINTER_MOVE":
      if (state.canvas.mode !== "draw_roi" || state.canvas.draftDrag === null) {
        return state;
      }
      return withCanvas(state, { draftDrag: { ...state.canvas.draftDrag, currentCanvas: { x: action.payload.canvasX, y: action.payload.canvasY } } });
    case "CANVAS_POINTER_UP": {
      if (!state.canvas.frame || state.canvas.mode !== "draw_roi" || state.canvas.draftDrag === null) {
        return state;
      }
      const name = state.canvas.drawingItemName && state.workspace.rois.some((roi) => roi.name === state.canvas.drawingItemName) ? state.canvas.drawingItemName : selectedRoiName(state);
      const scale = scaleFor(state);
      if (!name || scale === null) {
        return state;
      }
      const roiPatch = dragToRoi(state.canvas.frame, scale, state.canvas.draftDrag.startCanvas, { x: action.payload.canvasX, y: action.payload.canvasY });
      const rois = state.workspace.rois.map((roi) => (roi.name === name ? { ...roi, ...roiPatch } : roi));
      return resetFormBuffers({
        ...state,
        workspace: { ...state.workspace, rois },
        canvas: { ...state.canvas, mode: "idle", drawingItemName: null, draftDrag: null },
      });
    }
    case "CANVAS_ZOOM_AT_POINTER": {
      if (!state.canvas.frame || state.canvas.mode === "draw_roi" || state.canvas.mode === "pick_anchor") {
        return state;
      }
      const oldScale = scaleFor(state);
      if (oldScale === null || oldScale <= 0) {
        return state;
      }
      const newZoom = nextZoom(state.canvas.zoom, action.payload.direction);
      const newScale = effectiveScale(state.canvas.frame, { ...state.canvas.viewport, zoom: newZoom });
      const scaleRatio = newScale / oldScale;
      const oldPan = state.canvas.pan;
      const pointer = { x: action.payload.pointerCanvasX, y: action.payload.pointerCanvasY };
      const newPan = clampPan(state.canvas.frame, state.canvas.viewport, newScale, {
        x: pointer.x * scaleRatio - (pointer.x - oldPan.x),
        y: pointer.y * scaleRatio - (pointer.y - oldPan.y),
      });
      return withCanvas(state, { zoom: newZoom, pan: newPan });
    }
    case "CANVAS_PAN_WHEEL": {
      if (!state.canvas.frame) {
        return state;
      }
      const scale = scaleFor(state);
      if (scale === null) {
        return state;
      }
      return withCanvas(state, {
        pan: clampPan(state.canvas.frame, state.canvas.viewport, scale, {
          x: state.canvas.pan.x + action.payload.deltaX,
          y: state.canvas.pan.y + action.payload.deltaY,
        }),
      });
    }
    default:
      return state;
  }
}
