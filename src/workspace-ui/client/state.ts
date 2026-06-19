import type { AnchorDraft, CliParamDraft, GroupDraft, RoiDraft } from "../shared/model.js";
import type { CliImportConflict } from "../shared/cli-import.js";
import { applyCliConflictResolution } from "../shared/cli-import.js";
import type { FilterState } from "../shared/filter.js";
import type { CaptureFrame } from "../shared/geometry.js";
import { loadWorkspaceData } from "../shared/parse.js";
import type { Action, BrowseEntry, CanvasAction, FormAction } from "./actions.js";
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

export interface CliImportState {
  cliName: string;
  inFlight: boolean;
  lastError: string | null;
  conflicts: CliImportConflict[];
  merged: CliParamDraft[] | null;
  identicalSkipCount: number;
  loadedDrafts: CliParamDraft[] | null;
  usedSubcommand: "capabilities" | "capacities" | "";
  modalOpen: boolean;
}

export interface FileBrowserState {
  open: boolean;
  mode: "load" | "export";
  currentPath: string;
  entries: BrowseEntry[];
  selectedFile: string | null;
  typedFilename: string;
  inFlight: boolean;
  lastError: string | null;
}

export interface AppState {
  workspace: {
    rois: RoiDraft[];
    anchors: AnchorDraft[];
    groups: GroupDraft[];
    cliParams: CliParamDraft[];
    cliName: string;
    cliEnabled: boolean;
    raw: Record<string, unknown>;
    currentPath: string;
  };
  tree: {
    selected: TreeItemKey[];
    activeAnchor: TreeItemKey | null;
    collapsedGroups: Set<string>;
  };
  filter: FilterState;
  canvas: CanvasState;
  form: FormState;
  cliImport: CliImportState;
  fileBrowser: FileBrowserState;
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
      raw: {},
      currentPath: "",
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
    cliImport: {
      cliName: "cli",
      inFlight: false,
      lastError: null,
      conflicts: [],
      merged: null,
      identicalSkipCount: 0,
      loadedDrafts: null,
      usedSubcommand: "",
      modalOpen: false,
    },
    fileBrowser: {
      open: false,
      mode: "load",
      currentPath: "",
      entries: [],
      selectedFile: null,
      typedFilename: "",
      inFlight: false,
      lastError: null,
    },
  };
}

function applyCliImportResolution(state: AppState, preferLoaded: boolean): AppState {
  const merged = state.cliImport.merged ?? state.workspace.cliParams;
  const resolved = applyCliConflictResolution(merged, state.cliImport.conflicts, preferLoaded);
  return {
    ...state,
    workspace: {
      ...state.workspace,
      cliParams: resolved,
      cliName: state.cliImport.cliName,
      cliEnabled: true,
    },
    cliImport: {
      ...state.cliImport,
      modalOpen: false,
      inFlight: false,
      lastError: null,
    },
  };
}

function cliImportReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "CLI_IMPORT_NAME_CHANGED":
      return {
        ...state,
        workspace: { ...state.workspace, cliName: action.payload.text },
        cliImport: { ...state.cliImport, cliName: action.payload.text, lastError: null },
      };
    case "CLI_IMPORT_PROBE_STARTED":
      return { ...state, cliImport: { ...state.cliImport, inFlight: true, lastError: null, modalOpen: false } };
    case "CLI_IMPORT_PROBE_FAILED":
      return { ...state, cliImport: { ...state.cliImport, inFlight: false, lastError: action.payload.error, modalOpen: false } };
    case "CLI_IMPORT_PROBE_SUCCEEDED": {
      const nextImport: CliImportState = {
        ...state.cliImport,
        cliName: action.payload.cliName,
        inFlight: false,
        lastError: null,
        conflicts: action.payload.mergeResult.conflicts,
        merged: action.payload.mergeResult.merged,
        identicalSkipCount: action.payload.mergeResult.identicalSkipCount,
        loadedDrafts: action.payload.loadedDrafts,
        usedSubcommand: action.payload.usedSubcommand,
        modalOpen: action.payload.mergeResult.conflicts.length > 0,
      };
      const nextState = { ...state, cliImport: nextImport };
      if (action.payload.mergeResult.conflicts.length === 0) {
        return {
          ...nextState,
          workspace: {
            ...nextState.workspace,
            cliParams: [...action.payload.mergeResult.merged],
            cliName: action.payload.cliName,
            cliEnabled: true,
          },
        };
      }
      return nextState;
    }
    case "CLI_IMPORT_RESOLVE_KEEP_EXISTING":
      return applyCliImportResolution(state, false);
    case "CLI_IMPORT_RESOLVE_USE_LOADED":
      return applyCliImportResolution(state, true);
    case "CLI_IMPORT_RESOLVE_CANCEL":
      return { ...state, cliImport: { ...state.cliImport, modalOpen: false, inFlight: false } };
    default:
      return state;
  }
}

function fileBrowserReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "FILE_BROWSER_OPEN":
      return { ...state, fileBrowser: { ...state.fileBrowser, open: true, mode: action.payload.mode, selectedFile: null, typedFilename: "", inFlight: true, lastError: null } };
    case "FILE_BROWSER_NAV":
      return { ...state, fileBrowser: { ...state.fileBrowser, currentPath: action.payload.path, selectedFile: null, inFlight: true, lastError: null } };
    case "FILE_BROWSER_BROWSE_RESULT":
      return { ...state, fileBrowser: { ...state.fileBrowser, open: true, entries: action.payload.entries, currentPath: action.payload.currentPath, selectedFile: null, inFlight: false, lastError: null } };
    case "FILE_BROWSER_SELECT":
      return { ...state, fileBrowser: { ...state.fileBrowser, selectedFile: action.payload.path, typedFilename: state.fileBrowser.mode === "export" ? action.payload.name : state.fileBrowser.typedFilename, lastError: null } };
    case "FILE_BROWSER_FILENAME_CHANGED":
      return { ...state, fileBrowser: { ...state.fileBrowser, typedFilename: action.payload.filename, lastError: null } };
    case "FILE_BROWSER_LOAD_STARTED":
    case "FILE_BROWSER_SAVE_STARTED":
      return { ...state, fileBrowser: { ...state.fileBrowser, inFlight: true, lastError: null } };
    case "FILE_BROWSER_LOAD_SUCCEEDED": {
      const parsed = loadWorkspaceData(action.payload.workspaceJson);
      return {
        ...state,
        workspace: { ...state.workspace, ...parsed, raw: action.payload.workspaceJson, currentPath: action.payload.path },
        tree: { ...state.tree, selected: [], activeAnchor: null },
        fileBrowser: { ...state.fileBrowser, open: false, inFlight: false, lastError: null },
      };
    }
    case "FILE_BROWSER_SAVE_SUCCEEDED":
      return {
        ...state,
        workspace: { ...state.workspace, currentPath: action.payload.updateCurrent ? action.payload.path : state.workspace.currentPath },
        fileBrowser: { ...state.fileBrowser, open: false, inFlight: false, lastError: null },
      };
    case "FILE_BROWSER_FAILED":
      return { ...state, fileBrowser: { ...state.fileBrowser, inFlight: false, lastError: action.payload.error } };
    case "FILE_BROWSER_CANCEL":
      return { ...state, fileBrowser: { ...state.fileBrowser, open: false, inFlight: false, lastError: null } };
    default:
      return state;
  }
}

export function reduceAppState(state: AppState, action: Action): AppState {
  if (action.type.startsWith("FILE_BROWSER_")) {
    return fileBrowserReducer(state, action);
  }
  if (action.type.startsWith("CLI_IMPORT_")) {
    return cliImportReducer(state, action);
  }
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
