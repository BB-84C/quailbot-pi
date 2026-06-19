export type CaptureFrame = {
  imageWidth: number;
  imageHeight: number;
  originX: number;
  originY: number;
  captureId: string;
};

export type Viewport = { width: number; height: number; zoom: number };
export type Point = { x: number; y: number };
export type Roi = { x: number; y: number; w: number; h: number };

export function fitScale(frame: CaptureFrame, viewport: Viewport): number {
  return Math.min(viewport.width / frame.imageWidth, viewport.height / frame.imageHeight, 1.0);
}

export function effectiveScale(frame: CaptureFrame, viewport: Viewport): number {
  return Math.max(0.05, fitScale(frame, viewport) * viewport.zoom);
}

export function screenToCanvas(frame: CaptureFrame, scale: number, p: Point): Point {
  if (scale <= 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: Math.trunc((p.x - frame.originX) * scale),
    y: Math.trunc((p.y - frame.originY) * scale),
  };
}

export function canvasToScreen(frame: CaptureFrame, scale: number, p: Point): Point {
  if (scale <= 0) {
    return { x: frame.originX, y: frame.originY };
  }

  return {
    x: Math.trunc(frame.originX + p.x / scale),
    y: Math.trunc(frame.originY + p.y / scale),
  };
}

export function roiToCanvasRect(
  frame: CaptureFrame,
  scale: number,
  roi: Roi,
): { left: number; top: number; width: number; height: number } {
  const topLeft = screenToCanvas(frame, scale, { x: roi.x, y: roi.y });

  return {
    left: topLeft.x,
    top: topLeft.y,
    width: Math.trunc(roi.w * scale),
    height: Math.trunc(roi.h * scale),
  };
}

export function dragToRoi(frame: CaptureFrame, scale: number, a: Point, b: Point): Roi {
  const first = canvasToScreen(frame, scale, a);
  const second = canvasToScreen(frame, scale, b);
  const x1 = Math.min(first.x, second.x);
  const y1 = Math.min(first.y, second.y);
  const x2 = Math.max(first.x, second.x);
  const y2 = Math.max(first.y, second.y);

  return {
    x: x1,
    y: y1,
    w: Math.max(1, x2 - x1),
    h: Math.max(1, y2 - y1),
  };
}

export function nextZoom(currentZoom: number, direction: 1 | -1): number {
  const zoomFactor = direction > 0 ? 1.1 : 1 / 1.1;
  return Math.max(0.25, Math.min(6.0, currentZoom * zoomFactor));
}
