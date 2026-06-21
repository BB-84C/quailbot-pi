import { describe, expect, it } from "vitest";

import { mountForm, selectedState } from "./form-test-helpers.js";

function wheel(root: HTMLElement, init: WheelEventInit): WheelEvent {
  const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init });
  root.dispatchEvent(event);
  return event;
}

describe("right-panel form wheel", () => {
  it("scrolls the form root vertically and consumes the wheel event like Tk", () => {
    const { root } = mountForm(selectedState("cli", "bias"));
    root.scrollTop = 10;

    const event = wheel(root, { deltaY: 60 });

    expect(event.defaultPrevented).toBe(true);
    expect(root.scrollTop).toBe(70);
  });

  it("normalizes line-mode wheel deltas", () => {
    const { root } = mountForm(selectedState("cli", "bias"));

    wheel(root, { deltaY: 3, deltaMode: WheelEvent.DOM_DELTA_LINE });

    expect(root.scrollTop).toBe(120);
  });

  it("consumes zero-delta wheel events without moving the form", () => {
    const { root } = mountForm(selectedState("cli", "bias"));
    root.scrollTop = 25;

    const event = wheel(root, { deltaY: 0 });

    expect(event.defaultPrevented).toBe(true);
    expect(root.scrollTop).toBe(25);
  });
});
