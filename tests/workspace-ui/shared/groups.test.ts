import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  deleteItems,
  groupDescendants,
  groupDisplayOptions,
  renameGroupCascade,
  setGroupActiveCascade,
  wouldCreateGroupCycle,
} from "../../../src/workspace-ui/shared/groups.js";
import type { AnchorDraft, CliParamDraft, GroupDraft, RoiDraft } from "../../../src/workspace-ui/shared/model.js";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures", "python-golden", "groups-filter");

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(fixtureDir, name), "utf8")) as T;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

type State = {
  groups: GroupDraft[];
  rois: RoiDraft[];
  anchors: AnchorDraft[];
  cli_params: CliParamDraft[];
};

describe("workspace shared group hierarchy logic", () => {
  it("matches Python-golden group descendants", () => {
    const data = fixture<{ input: { groups: GroupDraft[]; roots: string[] }; expected: Record<string, string[]> }>("groups_descendants.json");

    for (const root of data.input.roots) {
      expect([...groupDescendants(data.input.groups, root)].sort()).toEqual(data.expected[root]);
    }
  });

  it("matches Python-golden hierarchical display options and excludes an excluded subtree", () => {
    const data = fixture<{ input: { groups: GroupDraft[]; exclude: string[] }; expected: Array<{ display: string; name: string }> }>("groups_display_options.json");

    const actual = groupDisplayOptions(data.input.groups, new Set(data.input.exclude));

    expect(actual).toEqual(data.expected);
    expect(actual.map((item) => item.name)).not.toContain("c");
  });

  it("matches Python-golden active cascade, including CLI enabled-vs-active asymmetry", () => {
    const data = fixture<{ input: State & { target: string; active: boolean }; expected: State }>("groups_cascade_active.json");
    const groups = clone(data.input.groups);
    const rois = clone(data.input.rois);
    const anchors = clone(data.input.anchors);
    const cliParams = clone(data.input.cli_params);

    setGroupActiveCascade({ groups, rois, anchors, cliParams, groupName: data.input.target, active: data.input.active });

    expect({ groups, rois, anchors, cli_params: cliParams }).toEqual(data.expected);
    expect(cliParams[0]).toHaveProperty("enabled", false);
    expect(cliParams[0]).not.toHaveProperty("active");
  });

  it("matches Python-golden rename cascade", () => {
    const data = fixture<{ input: State & { old_name: string; new_name: string }; expected: State }>("groups_rename_cascade.json");
    const groups = clone(data.input.groups);
    const rois = clone(data.input.rois);
    const anchors = clone(data.input.anchors);
    const cliParams = clone(data.input.cli_params);

    renameGroupCascade({ groups, rois, anchors, cliParams, oldName: data.input.old_name, newName: data.input.new_name });

    expect({ groups, rois, anchors, cli_params: cliParams }).toEqual(data.expected);
  });

  it("matches Python-golden multi-select delete and re-home cases", () => {
    const data = fixture<{ cases: Array<{ name: string; input: State & { selected: Array<{ kind: "roi" | "anchor" | "group" | "cli"; idx: number }> }; expected: State }> }>("delete_items.json");

    for (const item of data.cases) {
      const groups = clone(item.input.groups);
      const rois = clone(item.input.rois);
      const anchors = clone(item.input.anchors);
      const cliParams = clone(item.input.cli_params);

      deleteItems({ groups, rois, anchors, cliParams, selected: item.input.selected });

      expect({ groups, rois, anchors, cli_params: cliParams }, item.name).toEqual(item.expected);
    }
  });

  it("rehomes a grandchild to the nearest surviving ancestor when parent and child are deleted together", () => {
    const data = fixture<{ cases: Array<{ name: string; input: State & { selected: Array<{ kind: "roi" | "anchor" | "group" | "cli"; idx: number }> }; expected: State }> }>("delete_items.json");
    const item = data.cases.find((entry) => entry.name.includes("grandchild"));
    expect(item).toBeDefined();
    const groups = clone(item!.input.groups);
    const rois = clone(item!.input.rois);

    deleteItems({ groups, rois, anchors: clone(item!.input.anchors), cliParams: clone(item!.input.cli_params), selected: item!.input.selected });

    expect(groups.find((group) => group.name === "grandchild")?.group).toBe("root");
    expect(rois[0]?.group).toBe("grandchild");
  });

  it("detects parent assignments that would create group cycles", () => {
    const groups: GroupDraft[] = [
      { name: "a", description: "", tags: "", active: true, group: "", collapsed: false },
      { name: "b", description: "", tags: "", active: true, group: "a", collapsed: false },
      { name: "c", description: "", tags: "", active: true, group: "b", collapsed: false },
    ];

    expect(wouldCreateGroupCycle(groups, "a", "a")).toBe(true);
    expect(wouldCreateGroupCycle(groups, "a", "c")).toBe(true);
    expect(wouldCreateGroupCycle(groups, "b", "c")).toBe(true);
    expect(wouldCreateGroupCycle(groups, "c", "a")).toBe(false);
    expect(wouldCreateGroupCycle(groups, "a", "")).toBe(false);
    expect(wouldCreateGroupCycle(groups, "missing", "c")).toBe(false);
  });
});
