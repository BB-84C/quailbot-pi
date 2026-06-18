import { describe, expect, it } from "vitest";

import { isSafeKnowledgeName } from "../../src/knowledge/safe-name.js";

describe("isSafeKnowledgeName", () => {
  it("rejects traversal-style names", () => {
    expect(isSafeKnowledgeName("../../x")).toBe(false);
  });

  it("accepts compact domain and skill names", () => {
    expect(isSafeKnowledgeName("tip-conditioning.v1_2")).toBe(true);
  });
});
