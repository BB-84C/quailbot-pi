import { describe, expect, it } from "vitest";

import { attachFilterEvents } from "../../../src/workspace-ui/client/events/filter.js";
import { renderFilter } from "../../../src/workspace-ui/client/render/filter.js";
import { renderItemsTree } from "../../../src/workspace-ui/client/render/items-tree.js";
import { createStore } from "../../../src/workspace-ui/client/store.js";
import { subtreeVisibility } from "../../../src/workspace-ui/shared/filter.js";
import { initialState, type AppState } from "../../../src/workspace-ui/client/state.js";

function fixtureState(): AppState {
  return {
    ...initialState(),
    workspace: {
      ...initialState().workspace,
      cliName: "nqctl",
      cliEnabled: true,
      groups: [{ name: "group-a", description: "parent", tags: "physics", active: true, group: "", collapsed: false }],
      rois: [
        { name: "keep-roi", x: 0, y: 0, w: 1, h: 1, description: "bias window", tags: "physics", active: true, group: "group-a" },
        { name: "drop-roi", x: 0, y: 0, w: 1, h: 1, description: "unrelated", tags: "chemistry", active: true, group: "" },
      ],
      anchors: [{ name: "keep-anchor", x: 0, y: 0, description: "reads linked observable", tags: "physics", linked_rois: ["keep-roi"], active: true, group: "group-a" }],
      cliParams: [
        { cli_name: "nqctl", name: "bias", label: "Bias", description: "bias voltage", tags: "physics", enabled: true, group: "", allow_get: true, allow_set: true, allow_ramp: false, readable: true, writable: true, has_ramp: false, safety: null, get_cmd: {}, set_cmd: {}, safety_mode: "guarded", action_cmd: null, linked_observables: ["keep-roi"], raw_item: {} },
      ],
    },
  };
}

function rowKeys(root: HTMLElement): string[] {
  return [...root.querySelectorAll<HTMLElement>(".tree-row")].map((row) => `${row.dataset.kind}:${row.dataset.name}`);
}

function expectedVisibleKeys(state: AppState): string[] {
  return [...subtreeVisibility({
    groups: state.workspace.groups,
    rois: state.workspace.rois,
    anchors: state.workspace.anchors,
    cliParams: state.workspace.cliParams,
    state: state.filter,
  })];
}

function mount() {
  const filterRoot = document.createElement("div");
  const treeRoot = document.createElement("div");
  const store = createStore(fixtureState());
  const render = () => {
    renderFilter(filterRoot, store.getState());
    renderItemsTree(treeRoot, store.getState());
  };
  store.subscribe(render);
  render();
  attachFilterEvents(filterRoot, store.dispatch);
  return { filterRoot, treeRoot, store };
}

describe("filter and items tree integration", () => {
  it("rerenders tree rows from shared subtreeVisibility after tag and keyword changes", () => {
    const { filterRoot, treeRoot, store } = mount();

    const physics = filterRoot.querySelector<HTMLInputElement>('input[data-action="toggle-tag"][data-tag="physics"]');
    physics!.checked = true;
    physics?.dispatchEvent(new Event("change", { bubbles: true }));
    expect(rowKeys(treeRoot)).toEqual(expectedVisibleKeys(store.getState()));
    expect(rowKeys(treeRoot)).not.toContain("roi:drop-roi");

    const input = filterRoot.querySelector<HTMLInputElement>(".filter-keyword");
    input!.value = "bias";
    input?.dispatchEvent(new Event("input", { bubbles: true }));

    expect(rowKeys(treeRoot)).toEqual(expectedVisibleKeys(store.getState()));
    expect(rowKeys(treeRoot)).toContain("roi:keep-roi");
    expect(rowKeys(treeRoot)).toContain("cli:bias");
    expect(rowKeys(treeRoot)).not.toContain("anchor:keep-anchor");
    expect(rowKeys(treeRoot)).not.toContain("roi:drop-roi");
  });
});
