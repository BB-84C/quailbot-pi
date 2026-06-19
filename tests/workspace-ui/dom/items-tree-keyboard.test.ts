import { describe, expect, it } from "vitest";

import { attachItemsTreeEvents } from "../../../src/workspace-ui/client/events/items-tree.js";
import { renderItemsTree } from "../../../src/workspace-ui/client/render/items-tree.js";
import { createStore } from "../../../src/workspace-ui/client/store.js";
import { initialState, type AppState } from "../../../src/workspace-ui/client/state.js";

function fixtureState(): AppState {
  return {
    ...initialState(),
    workspace: {
      ...initialState().workspace,
      cliName: "cli",
      cliEnabled: true,
      groups: [{ name: "grp", description: "", tags: "", active: true, group: "", collapsed: false }],
      rois: [
        { name: "roi-a", x: 0, y: 0, w: 1, h: 1, description: "", tags: "", active: true, group: "grp" },
        { name: "roi-b", x: 0, y: 0, w: 1, h: 1, description: "", tags: "", active: true, group: "" },
      ],
      anchors: [{ name: "anchor-a", x: 0, y: 0, description: "", tags: "", linked_rois: [], active: true, group: "" }],
      cliParams: [],
    },
  };
}

function mount(state = fixtureState()) {
  const root = document.createElement("div");
  const store = createStore(state);
  store.subscribe(() => renderItemsTree(root, store.getState()));
  renderItemsTree(root, store.getState());
  attachItemsTreeEvents(root, store.dispatch);
  return { root, store };
}

function key(root: HTMLElement, keyName: "ArrowUp" | "ArrowDown", init: KeyboardEventInit = {}) {
  root.dispatchEvent(new KeyboardEvent("keydown", { key: keyName, bubbles: true, ...init }));
}

const selectedKeys = (state: AppState): string[] => state.tree.selected.map((item) => `${item.kind}:${item.name}`);

describe("items tree keyboard navigation", () => {
  it("ArrowDown from no selection selects first row", () => {
    const { root, store } = mount();

    key(root, "ArrowDown");
    expect(selectedKeys(store.getState())).toEqual(["group:grp"]);
    expect(store.getState().tree.activeAnchor).toEqual({ kind: "group", name: "grp" });
  });

  it("ArrowDown/ArrowUp move active row and Shift extends a rendered contiguous range", () => {
    const { root, store } = mount();

    key(root, "ArrowDown");
    key(root, "ArrowDown");
    expect(selectedKeys(store.getState())).toEqual(["roi:roi-a"]);

    key(root, "ArrowDown", { shiftKey: true });
    expect(selectedKeys(store.getState())).toEqual(["roi:roi-a", "roi:roi-b"]);

    key(root, "ArrowUp");
    expect(selectedKeys(store.getState())).toEqual(["roi:roi-a"]);
  });

  it("ArrowDown at the last rendered row stays at the last row", () => {
    const { root, store } = mount();

    key(root, "ArrowDown");
    key(root, "ArrowDown");
    key(root, "ArrowDown");
    key(root, "ArrowDown");
    key(root, "ArrowDown");

    expect(selectedKeys(store.getState())).toEqual(["anchor:anchor-a"]);
  });
});
