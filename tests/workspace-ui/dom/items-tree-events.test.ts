import { describe, expect, it } from "vitest";

import { treeClickItem } from "../../../src/workspace-ui/client/actions.js";
import { attachItemsTreeEvents } from "../../../src/workspace-ui/client/events/items-tree.js";
import { renderItemsTree } from "../../../src/workspace-ui/client/render/items-tree.js";
import { createStore } from "../../../src/workspace-ui/client/store.js";
import { initialState, reduceAppState, type AppState } from "../../../src/workspace-ui/client/state.js";

function fixtureState(): AppState {
  return {
    ...initialState(),
    workspace: {
      ...initialState().workspace,
      cliName: "nqctl",
      cliEnabled: true,
      groups: [{ name: "grp", description: "", tags: "", active: true, group: "", collapsed: false }],
      rois: [
        { name: "roi-a", x: 0, y: 0, w: 10, h: 10, description: "", tags: "", active: true, group: "grp" },
        { name: "roi-b", x: 0, y: 0, w: 10, h: 10, description: "", tags: "", active: true, group: "" },
      ],
      anchors: [
        { name: "anchor-a", x: 0, y: 0, description: "", tags: "", linked_rois: ["roi-b"], active: true, group: "grp" },
        { name: "anchor-b", x: 0, y: 0, description: "", tags: "", linked_rois: ["roi-b"], active: true, group: "" },
      ],
      cliParams: [],
    },
  };
}

function mount(state = fixtureState()) {
  const root = document.createElement("div");
  const store = createStore(state);
  store.subscribe(() => renderItemsTree(root, store.getState()));
  renderItemsTree(root, store.getState());
  const off = attachItemsTreeEvents(root, store.dispatch);
  return { root, store, off };
}

function click(root: HTMLElement, kind: string, name: string, region: "body" | "toggle", init: MouseEventInit = {}) {
  const target = root.querySelector<HTMLElement>(`[data-kind="${kind}"][data-name="${name}"] .tree-${region}`);
  expect(target).not.toBeNull();
  target?.dispatchEvent(new MouseEvent("click", { bubbles: true, ...init }));
}

function dblclick(root: HTMLElement, kind: string, name: string) {
  const target = root.querySelector<HTMLElement>(`[data-kind="${kind}"][data-name="${name}"] .tree-body`);
  expect(target).not.toBeNull();
  target?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
}

const selectedKeys = (state: AppState): string[] => state.tree.selected.map((item) => `${item.kind}:${item.name}`);

describe("items tree events", () => {
  it("maps plain, Ctrl, and Shift body clicks to EXTENDED selection state", () => {
    const { root, store, off } = mount();

    click(root, "group", "grp", "body");
    expect(selectedKeys(store.getState())).toEqual(["group:grp"]);
    expect(store.getState().tree.activeAnchor).toEqual({ kind: "group", name: "grp" });

    click(root, "roi", "roi-a", "body", { ctrlKey: true });
    expect(selectedKeys(store.getState())).toEqual(["group:grp", "roi:roi-a"]);
    expect(store.getState().tree.activeAnchor).toEqual({ kind: "roi", name: "roi-a" });

    click(root, "anchor", "anchor-a", "body", { shiftKey: true });
    expect(selectedKeys(store.getState())).toEqual(["roi:roi-a", "anchor:anchor-a"]);

    off();
  });

  it("implements toggle-region rules for forced ROIs, multi-selection, and group cascade", () => {
    const { root, store } = mount();

    click(root, "roi", "roi-a", "body");
    click(root, "anchor", "anchor-a", "body", { ctrlKey: true });
    click(root, "roi", "roi-a", "toggle");
    expect(store.getState().workspace.rois.find((roi) => roi.name === "roi-a")?.active).toBe(false);
    expect(store.getState().workspace.anchors.find((anchor) => anchor.name === "anchor-a")?.active).toBe(false);
    expect(selectedKeys(store.getState())).toEqual(["roi:roi-a", "anchor:anchor-a"]);

    click(root, "roi", "roi-a", "toggle");
    click(root, "group", "grp", "toggle");
    expect(store.getState().workspace.groups[0]?.active).toBe(false);
    expect(store.getState().workspace.rois.find((roi) => roi.name === "roi-a")?.active).toBe(false);
    expect(store.getState().workspace.anchors.find((anchor) => anchor.name === "anchor-a")?.active).toBe(false);

    store.dispatch(treeClickItem({ kind: "roi", name: "roi-a", modifiers: { ctrl: false, shift: false }, region: "body" }));
    store.dispatch(treeClickItem({ kind: "anchor", name: "anchor-b", modifiers: { ctrl: true, shift: false }, region: "body" }));
    click(root, "roi", "roi-b", "toggle");
    expect(selectedKeys(store.getState())).toEqual(["roi:roi-b"]);
    expect(store.getState().workspace.rois.find((roi) => roi.name === "roi-b")?.active).toBe(true);
  });

  it("double-click collapses only groups", () => {
    const { root, store } = mount();

    dblclick(root, "roi", "roi-a");
    expect(store.getState().tree.collapsedGroups.has("grp")).toBe(false);

    dblclick(root, "group", "grp");
    expect(store.getState().tree.collapsedGroups.has("grp")).toBe(true);
    expect(selectedKeys(store.getState())).toEqual(["group:grp"]);
  });

  it("keeps reducer behavior pure for direct action dispatch", () => {
    const state = fixtureState();
    const next = reduceAppState(state, treeClickItem({ kind: "roi", name: "roi-a", modifiers: { ctrl: false, shift: false }, region: "body" }));

    expect(next).not.toBe(state);
    expect(next.workspace).toBe(state.workspace);
    expect(selectedKeys(next)).toEqual(["roi:roi-a"]);
  });
});
