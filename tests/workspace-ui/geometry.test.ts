import { describe, expect, it } from "vitest";

import {
  canvasToScreen,
  dragToRoi,
  effectiveScale,
  fitScale,
  nextZoom,
  roiToCanvasRect,
  screenToCanvas,
  type CaptureFrame,
} from "../../src/workspace-ui/shared/geometry.js";

const frame: CaptureFrame = {
  imageWidth: 800,
  imageHeight: 500,
  originX: 0,
  originY: 0,
  captureId: "fixture",
};

describe("workspace UI shared geometry", () => {
  it("fits by the minimum viewport ratio and never upscales fit scale", () => {
    expect(fitScale(frame, { width: 400, height: 400, zoom: 1 })).toBe(0.5);
    expect(fitScale(frame, { width: 1600, height: 200, zoom: 1 })).toBe(0.4);
    expect(fitScale(frame, { width: 1600, height: 1000, zoom: 1 })).toBe(1);
  });

  it("applies zoom while clamping effective scale to a 0.05 minimum", () => {
    expect(effectiveScale(frame, { width: 400, height: 250, zoom: 2 })).toBe(1);
    expect(effectiveScale(frame, { width: 10, height: 10, zoom: 0.25 })).toBe(0.05);
  });

  it("round-trips screen and canvas points with expected truncation loss", () => {
    const scale = 0.5;
    const screenPoint = { x: 101, y: 51 };
    const canvasPoint = screenToCanvas(frame, scale, screenPoint);

    expect(canvasPoint).toEqual({ x: 50, y: 25 });
    const lossyScreen = canvasToScreen(frame, scale, canvasPoint);
    expect(Math.abs(lossyScreen.x - screenPoint.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(lossyScreen.y - screenPoint.y)).toBeLessThanOrEqual(1);
    expect(screenToCanvas(frame, scale, lossyScreen)).toEqual(canvasPoint);
  });

  it("round-trips a negative-origin left-monitor ROI through canvas coordinates", () => {
    const negativeOriginFrame: CaptureFrame = {
      imageWidth: 3840,
      imageHeight: 1080,
      originX: -1920,
      originY: 0,
      captureId: "x",
    };
    const scale = 1.0;

    const screenPoint = canvasToScreen(negativeOriginFrame, scale, { x: 0, y: 0 });
    expect(screenPoint).toEqual({ x: -1920, y: 0 });
    expect(screenToCanvas(negativeOriginFrame, scale, screenPoint)).toEqual({ x: 0, y: 0 });

    const roi = dragToRoi(negativeOriginFrame, scale, { x: 0, y: 0 }, { x: 100, y: 50 });
    expect(roi).toEqual({ x: -1920, y: 0, w: 100, h: 50 });
    expect(roiToCanvasRect(negativeOriginFrame, scale, roi)).toEqual({ left: 0, top: 0, width: 100, height: 50 });
  });

  it("truncates toward zero instead of flooring negative scaled coordinates", () => {
    expect(screenToCanvas(frame, 0.5, { x: -3, y: 0 })).toEqual({ x: -1, y: 0 });
  });

  it("steps zoom by Python's 1.1 factor and clamps both ends", () => {
    expect(nextZoom(1.0, 1)).toBe(1.1);
    expect(nextZoom(1.0, -1)).toBeCloseTo(1 / 1.1);
    expect(nextZoom(6.0, 1)).toBe(6.0);
    expect(nextZoom(0.25, -1)).toBe(0.25);
  });

  it("normalizes reversed drags and enforces a one-pixel minimum ROI", () => {
    expect(dragToRoi(frame, 1, { x: 100, y: 50 }, { x: 0, y: 0 })).toEqual({ x: 0, y: 0, w: 100, h: 50 });
    expect(dragToRoi(frame, 1, { x: 42, y: 24 }, { x: 42, y: 24 })).toEqual({ x: 42, y: 24, w: 1, h: 1 });
  });

  it("scales ROI overlays with the current effective scale", () => {
    expect(roiToCanvasRect(frame, 2, { x: 10, y: 20, w: 30, h: 40 })).toEqual({
      left: 20,
      top: 40,
      width: 60,
      height: 80,
    });
  });
});
