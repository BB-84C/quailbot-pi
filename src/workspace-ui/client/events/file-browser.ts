import {
  fileBrowserBrowseResult,
  fileBrowserCancel,
  fileBrowserFailed,
  fileBrowserFilenameChanged,
  fileBrowserLoadStarted,
  fileBrowserLoadSucceeded,
  fileBrowserNav,
  fileBrowserOpen,
  fileBrowserSaveStarted,
  fileBrowserSaveSucceeded,
  fileBrowserSelect,
  type Action,
} from "../actions.js";
import { postBrowse, postLoad, postSave } from "../api/file-browser.js";
import type { AppState } from "../state.js";
import { buildWorkspaceJson } from "../../shared/serialize.js";

function closestWithin<T extends Element>(target: EventTarget | null, selector: string, root: HTMLElement): T | null {
  if (!(target instanceof Element)) return null;
  const found = target.closest<T>(selector);
  return found && root.contains(found) ? found : null;
}

function dirnameLike(filePath: string): string {
  const slash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  return slash > 0 ? filePath.slice(0, slash) : filePath;
}

function joinLike(dir: string, name: string): string {
  if (!dir) return name;
  const sep = dir.includes("\\") ? "\\" : "/";
  return dir.endsWith("\\") || dir.endsWith("/") ? `${dir}${name}` : `${dir}${sep}${name}`;
}

async function browse(path: string, dispatch: (action: Action) => void): Promise<void> {
  dispatch(fileBrowserNav(path));
  try {
    const response = await postBrowse(path);
    if (!response.ok || !response.entries || !response.resolved) {
      dispatch(fileBrowserFailed(response.error || "Browse failed"));
      return;
    }
    dispatch(fileBrowserBrowseResult(response.entries, response.resolved));
  } catch (error) {
    dispatch(fileBrowserFailed(error instanceof Error ? error.message : String(error)));
  }
}

async function loadSelected(dispatch: (action: Action) => void, getState: () => AppState): Promise<void> {
  const selected = getState().fileBrowser.selectedFile;
  if (!selected) {
    dispatch(fileBrowserFailed("Select a workspace JSON file"));
    return;
  }
  dispatch(fileBrowserLoadStarted());
  try {
    const response = await postLoad(selected);
    if (!response.ok || !response.path || !response.canonicalJson) {
      dispatch(fileBrowserFailed(response.error || "Load failed"));
      return;
    }
    dispatch(fileBrowserLoadSucceeded(response.path, response.canonicalJson));
  } catch (error) {
    dispatch(fileBrowserFailed(error instanceof Error ? error.message : String(error)));
  }
}

async function saveTarget(targetPath: string, updateCurrent: boolean, dispatch: (action: Action) => void, getState: () => AppState): Promise<void> {
  if (!targetPath) {
    dispatch(fileBrowserFailed("Save path is required"));
    return;
  }
  dispatch(fileBrowserSaveStarted());
  const state = getState();
  const workspaceJson = buildWorkspaceJson(state.workspace);
  try {
    const response = await postSave(targetPath, workspaceJson, updateCurrent);
    if (!response.ok || !response.path) {
      dispatch(fileBrowserFailed(response.error || "Save failed"));
      return;
    }
    dispatch(fileBrowserSaveSucceeded(response.path, updateCurrent));
  } catch (error) {
    dispatch(fileBrowserFailed(error instanceof Error ? error.message : String(error)));
  }
}

export function attachFileBrowserEvents(args: { formRoot: HTMLElement; modalRoot: HTMLElement; dispatch: (action: Action) => void; getState: () => AppState }): () => void {
  const { formRoot, modalRoot, dispatch, getState } = args;
  const onFormClick = (event: MouseEvent): void => {
    const load = closestWithin<HTMLButtonElement>(event.target, 'button[data-action="file-browser-load"]', formRoot);
    if (load) {
      event.preventDefault();
      dispatch(fileBrowserOpen("load"));
      void browse(dirnameLike(getState().workspace.currentPath), dispatch);
      return;
    }
    const save = closestWithin<HTMLButtonElement>(event.target, 'button[data-action="file-browser-save"]', formRoot);
    if (save) {
      event.preventDefault();
      void saveTarget(getState().workspace.currentPath, true, dispatch, getState);
      return;
    }
    const exp = closestWithin<HTMLButtonElement>(event.target, 'button[data-action="file-browser-export"]', formRoot);
    if (exp) {
      event.preventDefault();
      dispatch(fileBrowserOpen("export"));
      void browse(dirnameLike(getState().workspace.currentPath), dispatch);
    }
  };
  const onModalClick = (event: MouseEvent): void => {
    const entry = closestWithin<HTMLButtonElement>(event.target, 'button[data-action="file-browser-entry"]', modalRoot);
    if (entry) {
      event.preventDefault();
      const kind = entry.dataset.fileBrowserEntry;
      const path = entry.dataset.path ?? "";
      if (kind === "dir") void browse(path, dispatch);
      else dispatch(fileBrowserSelect(entry.dataset.name ?? "", path));
      return;
    }
    const up = closestWithin<HTMLButtonElement>(event.target, 'button[data-action="file-browser-up"]', modalRoot);
    if (up) {
      event.preventDefault();
      void browse(dirnameLike(getState().fileBrowser.currentPath), dispatch);
      return;
    }
    const open = closestWithin<HTMLButtonElement>(event.target, 'button[data-action="file-browser-open"]', modalRoot);
    if (open) {
      event.preventDefault();
      void loadSelected(dispatch, getState);
      return;
    }
    const save = closestWithin<HTMLButtonElement>(event.target, 'button[data-action="file-browser-save"]', modalRoot);
    if (save) {
      event.preventDefault();
      const state = getState();
      void saveTarget(joinLike(state.fileBrowser.currentPath, state.fileBrowser.typedFilename), false, dispatch, getState);
      return;
    }
    const cancel = closestWithin<HTMLElement>(event.target, '[data-action="file-browser-cancel"]', modalRoot);
    if (cancel) {
      event.preventDefault();
      dispatch(fileBrowserCancel());
    }
  };
  const onModalInput = (event: Event): void => {
    const input = closestWithin<HTMLInputElement>(event.target, 'input[data-file-browser-filename="true"]', modalRoot);
    if (input) dispatch(fileBrowserFilenameChanged(input.value));
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    dispatch(fileBrowserCancel());
  };
  formRoot.addEventListener("click", onFormClick);
  modalRoot.addEventListener("click", onModalClick);
  modalRoot.addEventListener("input", onModalInput);
  modalRoot.addEventListener("keydown", onKeyDown);
  return () => {
    formRoot.removeEventListener("click", onFormClick);
    modalRoot.removeEventListener("click", onModalClick);
    modalRoot.removeEventListener("input", onModalInput);
    modalRoot.removeEventListener("keydown", onKeyDown);
  };
}
