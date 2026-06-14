export type CaptureFrame = {
  imageWidth: number;
  imageHeight: number;
  originX: number;
  originY: number;
  coordinateScaleX: number;
  coordinateScaleY: number;
  coordinateSpace: "screen" | "image" | "fixture";
};

export type DisplayViewport = { width: number; height: number; panX: number; panY: number; zoom: number };
export type Point = { x: number; y: number };
export type Roi = { x: number; y: number; w: number; h: number };
export type DisplayRect = { left: number; top: number; width: number; height: number };

export function imagePointToDisplayPoint(frame: CaptureFrame, viewport: DisplayViewport, point: Point): Point {
  const scale = displayScale(frame, viewport);
  const imagePoint = toImagePixels(frame, point);

  return {
    x: round3(viewport.panX + imagePoint.x * scale),
    y: round3(viewport.panY + imagePoint.y * scale),
  };
}

export function displayPointToImagePoint(frame: CaptureFrame, viewport: DisplayViewport, point: Point): Point {
  const scale = displayScale(frame, viewport);

  return fromImagePixels(frame, {
    x: (point.x - viewport.panX) / scale,
    y: (point.y - viewport.panY) / scale,
  });
}

export function imageRoiToDisplayRect(frame: CaptureFrame, viewport: DisplayViewport, roi: Roi): DisplayRect {
  const topLeft = imagePointToDisplayPoint(frame, viewport, roi);
  const scale = displayScale(frame, viewport);

  return {
    left: topLeft.x,
    top: topLeft.y,
    width: round3((roi.w / frame.coordinateScaleX) * scale),
    height: round3((roi.h / frame.coordinateScaleY) * scale),
  };
}

export function displayRectToImageRoi(frame: CaptureFrame, viewport: DisplayViewport, rect: DisplayRect): Roi {
  const topLeft = displayPointToImagePoint(frame, viewport, { x: rect.left, y: rect.top });
  const scale = displayScale(frame, viewport);

  return {
    x: topLeft.x,
    y: topLeft.y,
    w: round3((rect.width / scale) * frame.coordinateScaleX),
    h: round3((rect.height / scale) * frame.coordinateScaleY),
  };
}

function displayScale(frame: CaptureFrame, viewport: DisplayViewport): number {
  return Math.min(viewport.width / frame.imageWidth, viewport.height / frame.imageHeight) * viewport.zoom;
}

function toImagePixels(frame: CaptureFrame, point: Point): Point {
  return {
    x: (point.x - frame.originX) / frame.coordinateScaleX,
    y: (point.y - frame.originY) / frame.coordinateScaleY,
  };
}

function fromImagePixels(frame: CaptureFrame, point: Point): Point {
  return {
    x: round3(frame.originX + point.x * frame.coordinateScaleX),
    y: round3(frame.originY + point.y * frame.coordinateScaleY),
  };
}

function round3(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}
