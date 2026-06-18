import { describe, expect, it } from "vitest";

import { isSafeKnowledgeName } from "../../src/knowledge/safe-name.js";

describe("isSafeKnowledgeName", () => {
  it("rejects traversal-style names", () => {
    expect(isSafeKnowledgeName("../../x")).toBe(false);
    expect(isSafeKnowledgeName("a/b")).toBe(false);
    expect(isSafeKnowledgeName("a\\b")).toBe(false);
    expect(isSafeKnowledgeName("/abs")).toBe(false);
    expect(isSafeKnowledgeName("C:\\x")).toBe(false);
    expect(isSafeKnowledgeName("a..b")).toBe(false);
    expect(isSafeKnowledgeName("..")).toBe(false);
    expect(isSafeKnowledgeName("")).toBe(false);
    expect(isSafeKnowledgeName("a".repeat(65))).toBe(false);
  });

  it("accepts compact domain and skill names", () => {
    expect(isSafeKnowledgeName("tip-conditioning.v1_2")).toBe(true);
    expect(isSafeKnowledgeName("tip-conditioning")).toBe(true);
    expect(isSafeKnowledgeName("a.b_c-1")).toBe(true);
  });
});
