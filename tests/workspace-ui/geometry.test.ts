import { describe, expect, it } from "vitest";

import {
  displayPointToImagePoint,
  displayRectToImageRoi,
  imagePointToDisplayPoint,
  imageRoiToDisplayRect,
  type CaptureFrame,
  type DisplayViewport,
} from "../../src/workspace-ui/geometry.js";

const frame: CaptureFrame = {
  imageWidth: 800,
  imageHeight: 500,
  originX: 0,
  originY: 0,
  coordinateScaleX: 1,
  coordinateScaleY: 1,
  coordinateSpace: "fixture",
};

const roi = { x: 120, y: 80, w: 240, h: 160 };
const anchor = { x: 520, y: 300 };

describe("workspace UI geometry transforms", () => {
  it("round-trips the calibration ROI through a small display viewport", () => {
    const small: DisplayViewport = { width: 320, height: 200, panX: 0, panY: 0, zoom: 1 };

    expect(imageRoiToDisplayRect(frame, small, roi)).toEqual({ left: 48, top: 32, width: 96, height: 64 });
    expect(displayRectToImageRoi(frame, small, imageRoiToDisplayRect(frame, small, roi))).toEqual(roi);
  });

  it("round-trips the calibration ROI through a large panned display viewport", () => {
    const large: DisplayViewport = { width: 1600, height: 1000, panX: 64, panY: -24, zoom: 0.75 };

    expect(imageRoiToDisplayRect(frame, large, roi)).toEqual({ left: 244, top: 96, width: 360, height: 240 });
    expect(displayRectToImageRoi(frame, large, imageRoiToDisplayRect(frame, large, roi))).toEqual(roi);
  });

  it("converts the calibration anchor point under pan and zoom", () => {
    const viewport: DisplayViewport = { width: 400, height: 250, panX: -30, panY: 18, zoom: 1.5 };
    const display = imagePointToDisplayPoint(frame, viewport, anchor);

    expect(display).toEqual({ x: 360, y: 243 });
    expect(displayPointToImagePoint(frame, viewport, display)).toEqual({ x: 520, y: 300 });
  });

  it("applies frame origin and coordinate scale before display conversion", () => {
    const screenFrame: CaptureFrame = {
      imageWidth: 800,
      imageHeight: 500,
      originX: 100,
      originY: 50,
      coordinateScaleX: 2,
      coordinateScaleY: 4,
      coordinateSpace: "screen",
    };
    const viewport: DisplayViewport = { width: 800, height: 500, panX: 10, panY: 20, zoom: 1 };
    const screenPoint = { x: 1140, y: 1250 };

    expect(imagePointToDisplayPoint(screenFrame, viewport, screenPoint)).toEqual({ x: 530, y: 320 });
    expect(displayPointToImagePoint(screenFrame, viewport, { x: 530, y: 320 })).toEqual(screenPoint);
  });
});
