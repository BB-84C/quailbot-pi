import type { AnchorDraft, CliParamDraft, GroupDraft, RoiDraft } from "../shared/model.js";
import type { FilterState } from "../shared/filter.js";
import type { CaptureFrame } from "../shared/geometry.js";
import type { Action, CanvasAction } from "./actions.js";
import { canvasReducer } from "./reducers/canvas.js";
import { treeReducer } from "./reducers/tree.js";

export type TreeItemKind = "roi" | "anchor" | "group" | "cli";

export interface TreeItemKey {
  kind: TreeItemKind;
  name: string;
}

export interface CanvasState {
  frame: CaptureFrame | null;
  viewport: { width: number; height: number };
  zoom: number;
  pan: { x: number; y: number };
  mode: "idle" | "draw_roi" | "pick_anchor";
  drawingItemName: string | null;
  draftDrag: { startCanvas: { x: number; y: number }; currentCanvas: { x: number; y: number } } | null;
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
  canvas: CanvasState;
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
    canvas: {
      frame: null,
      viewport: { width: 0, height: 0 },
      zoom: 1.0,
      pan: { x: 0, y: 0 },
      mode: "idle",
      drawingItemName: null,
      draftDrag: null,
    },
  };
}

export function reduceAppState(state: AppState, action: Action): AppState {
  if (action.type.startsWith("TREE_")) {
    return treeReducer(state, action);
  }
  if (action.type.startsWith("CANVAS_")) {
    return canvasReducer(state, action as CanvasAction);
  }
  return state;
}
