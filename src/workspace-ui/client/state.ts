import type { AnchorDraft, CliParamDraft, GroupDraft, RoiDraft } from "../shared/model.js";
import type { FilterState } from "../shared/filter.js";
import type { Action } from "./actions.js";
import { treeReducer } from "./reducers/tree.js";

export type TreeItemKind = "roi" | "anchor" | "group" | "cli";

export interface TreeItemKey {
  kind: TreeItemKind;
  name: string;
}

export interface AppState {
  workspace: {
    rois: RoiDraft[];
    anchors: AnchorDraft[];
    groups: GroupDraft[];
    cliParams: CliParamDraft[];
    cliName: string;
    cliEnabled: boolean;
  };
  tree: {
    selected: TreeItemKey[];
    activeAnchor: TreeItemKey | null;
    collapsedGroups: Set<string>;
  };
  filter: FilterState;
}

export function initialState(): AppState {
  return {
    workspace: {
      rois: [],
      anchors: [],
      groups: [],
      cliParams: [],
      cliName: "cli",
      cliEnabled: false,
    },
    tree: {
      selected: [],
      activeAnchor: null,
      collapsedGroups: new Set<string>(),
    },
    filter: {
      selectedTags: [],
      terms: [],
      logic: "AND",
    },
  };
}

export function reduceAppState(state: AppState, action: Action): AppState {
  if (action.type.startsWith("TREE_")) {
    return treeReducer(state, action);
  }
  return state;
}
