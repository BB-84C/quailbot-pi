import { describe, expect, it } from "vitest";

import { renderItemsTree } from "../../../src/workspace-ui/client/render/items-tree.js";
import { initialState, type AppState } from "../../../src/workspace-ui/client/state.js";

function fixtureState(): AppState {
  return {
    ...initialState(),
    workspace: {
      cliName: "nqctl",
      cliEnabled: true,
      groups: [
        { name: "parent", description: "top", tags: "alpha", active: true, group: "", collapsed: false },
        { name: "child", description: "nested", tags: "beta", active: false, group: "parent", collapsed: false },
      ],
      rois: [
        { name: "roi-root", x: 1, y: 2, w: 3, h: 4, description: "root", tags: "alpha", active: true, group: "" },
        { name: "roi-child", x: 5, y: 6, w: 7, h: 8, description: "child", tags: "beta", active: false, group: "child" },
      ],
      anchors: [
        { name: "anchor-root", x: 9, y: 10, description: "root", tags: "alpha", linked_rois: ["roi-child"], active: true, group: "" },
        { name: "anchor-child", x: 11, y: 12, description: "child", tags: "beta", linked_rois: [], active: false, group: "child" },
      ],
      cliParams: [
        { cli_name: "nqctl", name: "cli-root", label: "Root Voltage", description: "root", tags: "alpha", enabled: true, group: "", allow_get: true, allow_set: true, allow_ramp: false, readable: true, writable: true, has_ramp: false, safety: null, get_cmd: {}, set_cmd: {}, safety_mode: "guarded", action_cmd: null, linked_observables: [], raw_item: {} },
        { cli_name: "nqctl", name: "cli-child", label: "", description: "child", tags: "beta", enabled: false, group: "child", allow_get: true, allow_set: false, allow_ramp: false, readable: true, writable: false, has_ramp: false, safety: null, get_cmd: {}, set_cmd: null, safety_mode: "guarded", action_cmd: null, linked_observables: [], raw_item: {} },
      ],
    },
    tree: {
      selected: [{ kind: "roi", name: "roi-root" }],
      activeAnchor: { kind: "anchor", name: "anchor-child" },
      collapsedGroups: new Set<string>(),
    },
  };
}

function rowKeys(root: HTMLElement): string[] {
  return [...root.querySelectorAll<HTMLElement>(".tree-row")].map((row) => `${row.dataset.kind}:${row.dataset.name}`);
}

describe("items tree render", () => {
  it("renders Python tree order, row data, labels, selected/active, and forced ROI display", () => {
    const root = document.createElement("div");
    const state = fixtureState();

    renderItemsTree(root, state);
    const firstMarkup = root.innerHTML;
    renderItemsTree(root, state);

    expect(root.innerHTML).toBe(firstMarkup);
    expect(rowKeys(root)).toEqual([
      "group:parent",
      "group:child",
      "roi:roi-child",
      "anchor:anchor-child",
      "cli:cli-child",
      "roi:roi-root",
      "anchor:anchor-root",
      "cli:cli-root",
    ]);

    const forced = root.querySelector<HTMLElement>('[data-kind="roi"][data-name="roi-child"]');
    expect(forced?.classList.contains("tree-row--forced-active")).toBe(true);
    expect(forced?.querySelector<HTMLButtonElement>(".tree-toggle")?.disabled).toBe(true);
    expect(forced?.querySelector<HTMLButtonElement>(".tree-toggle")?.textContent).toBe("[x]");

    const selected = root.querySelector<HTMLElement>('[data-kind="roi"][data-name="roi-root"]');
    expect(selected?.classList.contains("tree-row--selected")).toBe(true);

    const active = root.querySelector<HTMLElement>('[data-kind="anchor"][data-name="anchor-child"]');
    expect(active?.classList.contains("tree-row--active")).toBe(true);
    expect(active?.querySelector(".tree-body")?.textContent).toBe("    [ANCHOR] anchor-child");

    const cliRoot = root.querySelector<HTMLElement>('[data-kind="cli"][data-name="cli-root"]');
    expect(cliRoot?.querySelector(".tree-body")?.textContent).toBe("[nqctl] Root Voltage (cli-root)");
  });

  it("honors collapsed groups and shared subtree filter visibility", () => {
    const root = document.createElement("div");
    const state = fixtureState();
    state.tree.collapsedGroups = new Set(["parent"]);

    renderItemsTree(root, state);
    expect(rowKeys(root)).toEqual(["group:parent", "roi:roi-root", "anchor:anchor-root", "cli:cli-root"]);

    state.tree.collapsedGroups = new Set();
    state.filter = { selectedTags: [], terms: ["anchor-child"], logic: "AND" };
    renderItemsTree(root, state);
    expect(rowKeys(root)).toEqual(["group:parent", "group:child", "anchor:anchor-child"]);
  });
});
