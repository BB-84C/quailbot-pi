import type { AnchorDraft, CliParamDraft, GroupDraft, RoiDraft } from "../shared/model.js";
import type { FilterState } from "../shared/filter.js";
import type { CaptureFrame } from "../shared/geometry.js";
import type { Action, CanvasAction, FormAction } from "./actions.js";
import { canvasReducer } from "./reducers/canvas.js";
import { filterReducer } from "./reducers/filter.js";
import { formReducer } from "./reducers/form.js";
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

export interface FieldHistoryEntry {
  text: string;
  cursor: number;
}

export interface FieldHistory {
  entries: FieldHistoryEntry[];
  index: number;
}

export type FormFieldKey = "name" | "x" | "y" | "w" | "h" | "tags" | "description";

export type CliSafetyField = "cooldown_s" | "max_slew_per_s" | "max_step" | "max_value" | "min_value" | "ramp_interval_s";

export interface CliMetaBuffers {
  writable?: boolean;
  safetyMode?: "alwaysAllowed" | "guarded" | "blocked";
  getCmdDescription?: string;
  setCmdDescription?: string;
  safety?: Partial<Record<CliSafetyField, string>>;
  safetyRampEnabled?: boolean;
}

export interface LinkedObsState {
  searchText: string;
  pickerValue: string;
}

export interface FormState {
  history: Partial<Record<FormFieldKey, FieldHistory>>;
  buffers: Partial<Record<FormFieldKey, string>>;
  cliMeta: CliMetaBuffers;
  linkedObs: LinkedObsState;
  lastCycleRejection?: { selectedGroup: string; attemptedParent: string };
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
  form: FormState;
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
      keywordRaw: "",
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
    form: {
      history: {},
      buffers: {},
      cliMeta: {},
      linkedObs: { searchText: "", pickerValue: "" },
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
  if (action.type.startsWith("FORM_") || action.type.startsWith("LINKED_")) {
    return formReducer(state, action as FormAction);
  }
  if (action.type.startsWith("FILTER_")) {
    return filterReducer(state, action);
  }
  return state;
}
