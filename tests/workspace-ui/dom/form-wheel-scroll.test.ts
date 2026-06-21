import { describe, expect, it } from "vitest";

import { mountForm, selectedState } from "./form-test-helpers.js";

describe("right-panel form wheel scrolling", () => {
  it("keeps wheel scrolling scoped to the form pane", () => {
    const { root } = mountForm(selectedState("cli", "bias"));
    root.scrollTop = 10;

    const pixelWheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 80 });
    const pixelResult = root.dispatchEvent(pixelWheel);
    expect(pixelResult).toBe(false);
    expect(pixelWheel.defaultPrevented).toBe(true);
    expect(root.scrollTop).toBe(90);

    const lineWheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaMode: WheelEvent.DOM_DELTA_LINE, deltaY: 2 });
    const lineResult = root.dispatchEvent(lineWheel);
    expect(lineResult).toBe(false);
    expect(lineWheel.defaultPrevented).toBe(true);
    expect(root.scrollTop).toBe(170);
  });
});
