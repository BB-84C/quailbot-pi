import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { collectTagCounts, filterTerms, itemMatchesFilter, splitTags, subtreeVisibility, type FilterItemKind, type FilterState } from "../../../src/workspace-ui/shared/filter.js";
import type { AnchorDraft, CliParamDraft, GroupDraft, RoiDraft } from "../../../src/workspace-ui/shared/model.js";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures", "python-golden", "groups-filter");

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(fixtureDir, name), "utf8")) as T;
}

describe("workspace shared filter logic", () => {
  it("matches Python-golden splitTags", () => {
    const data = fixture<{ cases: Array<{ input: string; expected: string[] }> }>("filter_split_tags.json");

    for (const item of data.cases) {
      expect(splitTags(item.input)).toEqual(item.expected);
    }
  });

  it("matches Python-golden filterTerms", () => {
    const data = fixture<{ cases: Array<{ input: string; expected: string[] }> }>("filter_terms.json");

    for (const item of data.cases) {
      expect(filterTerms(item.input)).toEqual(item.expected);
    }
  });

  it("matches Python-golden item filter cases", () => {
    const data = fixture<{
      cases: Array<{
        kind: FilterItemKind;
        item: RoiDraft | AnchorDraft | GroupDraft | CliParamDraft;
        selected_tags: string[];
        terms: string[];
        logic: "AND" | "OR";
        expected_match: boolean;
      }>;
    }>("filter_item_match.json");

    for (const item of data.cases) {
      expect(itemMatchesFilter(item.kind, item.item, { selectedTags: item.selected_tags, terms: item.terms, logic: item.logic }), JSON.stringify(item)).toBe(item.expected_match);
    }
  });

  it("keeps empty filter state as match-all", () => {
    const roi: RoiDraft = { name: "anything", x: 0, y: 0, w: 1, h: 1, description: "", tags: "", active: true, group: "" };

    expect(itemMatchesFilter("roi", roi, { selectedTags: [], terms: [], logic: "AND" })).toBe(true);
  });

  it("combines selected tags with keyword matching and supports OR keyword logic", () => {
    const anchor: AnchorDraft = { name: "tip", x: 0, y: 0, description: "marker", tags: "nav", linked_rois: ["roi-scan"], active: true, group: "" };

    expect(itemMatchesFilter("anchor", anchor, { selectedTags: ["nav"], terms: ["missing", "roi-scan"], logic: "OR" })).toBe(true);
    expect(itemMatchesFilter("anchor", anchor, { selectedTags: ["other"], terms: ["roi-scan"], logic: "OR" })).toBe(false);
  });

  it("matches CLI linked_observables as keyword fields", () => {
    const cli: CliParamDraft = {
      cli_name: "fixturectl",
      name: "bias",
      label: "Bias",
      description: "voltage",
      tags: "control",
      enabled: true,
      group: "",
      allow_get: false,
      allow_set: false,
      allow_ramp: false,
      readable: true,
      writable: true,
      has_ramp: false,
      safety: null,
      get_cmd: null,
      set_cmd: null,
      safety_mode: "guarded",
      action_cmd: null,
      linked_observables: ["height-readback"],
      raw_item: {},
    };

    expect(itemMatchesFilter("cli", cli, { selectedTags: [], terms: ["height-readback"], logic: "AND" })).toBe(true);
  });

  it("counts tags once per item and sorts by count desc then lowercase name", () => {
    const rois: RoiDraft[] = [{ name: "roi", x: 0, y: 0, w: 1, h: 1, description: "", tags: "Beta, alpha, alpha", active: true, group: "" }];
    const anchors: AnchorDraft[] = [{ name: "anchor", x: 0, y: 0, description: "", tags: "alpha, beta", linked_rois: [], active: true, group: "" }];
    const groups: GroupDraft[] = [{ name: "group", description: "", tags: "Gamma", active: true, group: "", collapsed: false }];

    expect(collectTagCounts({ rois, anchors, groups, cliParams: [] })).toEqual([
      { tag: "alpha", count: 2 },
      { tag: "Beta", count: 1 },
      { tag: "beta", count: 1 },
      { tag: "Gamma", count: 1 },
    ]);
  });

  it("matches Python-golden subtree visibility", () => {
    const data = fixture<{
      input: { groups: GroupDraft[]; rois: RoiDraft[]; anchors: AnchorDraft[]; cli_params: CliParamDraft[]; state: { selected_tags: string[]; terms: string[]; logic: "AND" | "OR" } };
      expected: string[];
    }>("filter_subtree_visibility.json");
    const state: FilterState = { selectedTags: data.input.state.selected_tags, terms: data.input.state.terms, logic: data.input.state.logic };

    const actual = subtreeVisibility({ groups: data.input.groups, rois: data.input.rois, anchors: data.input.anchors, cliParams: data.input.cli_params, state });

    expect([...actual]).toEqual(data.expected);
  });
});
