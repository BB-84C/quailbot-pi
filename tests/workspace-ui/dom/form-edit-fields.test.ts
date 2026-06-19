import { describe, expect, it } from "vitest";

import { blur, input, mountForm, selectedState, typeInto } from "./form-test-helpers.js";

describe("right-panel form field editing", () => {
  it("keeps buffers live while typing and commits valid ROI text on blur", () => {
    const { root, store } = mountForm(selectedState("roi", "roi-1"));
    const name = input(root, "name");

    typeInto(name, "roi-renamed");
    expect(store.getState().form.buffers.name).toBe("roi-renamed");
    expect(input(root, "name").value).toBe("roi-renamed");

    blur(input(root, "name"));
    expect(store.getState().workspace.rois[0]?.name).toBe("roi-renamed");
  });

  it("keeps prior draft values for blank name, invalid integers, and non-positive ROI dimensions", () => {
    const { root, store } = mountForm(selectedState("roi", "roi-1"));

    typeInto(input(root, "name"), "   ");
    blur(input(root, "name"));
    expect(store.getState().workspace.rois[0]?.name).toBe("roi-1");

    typeInto(input(root, "x"), "not-int");
    blur(input(root, "x"));
    expect(store.getState().workspace.rois[0]?.x).toBe(1);

    typeInto(input(root, "w"), "0");
    blur(input(root, "w"));
    expect(store.getState().workspace.rois[0]?.w).toBe(30);

    typeInto(input(root, "h"), "-9");
    blur(input(root, "h"));
    expect(store.getState().workspace.rois[0]?.h).toBe(40);
  });
});
