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
import { attachScopedActivation, attachScopedEvent, closestWithin } from "./delegation.js";

type ResponseWithErrors = { error?: string; errors?: unknown[] };

function dirnameLike(filePath: string): string {
  const slash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  return slash > 0 ? filePath.slice(0, slash) : filePath;
}

function joinLike(dir: string, name: string): string {
  if (!dir) return name;
  const sep = dir.includes("\\") ? "\\" : "/";
  return dir.endsWith("\\") || dir.endsWith("/") ? `${dir}${name}` : `${dir}${sep}${name}`;
}

function errorMessage(response: ResponseWithErrors, fallback: string): string {
  if (typeof response.error === "string" && response.error.trim()) return response.error;
  const firstError = response.errors?.[0];
  if (firstError && typeof firstError === "object" && "message" in firstError) {
    const message = (firstError as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function fail(dispatch: (action: Action) => void, message: string, alertUser = false): void {
  dispatch(fileBrowserFailed(message));
  if (alertUser) window.alert(message);
}

async function browse(path: string, dispatch: (action: Action) => void): Promise<void> {
  dispatch(fileBrowserNav(path));
  try {
    const response = await postBrowse(path);
    if (!response.ok || !response.entries || !response.resolved) {
      fail(dispatch, errorMessage(response, "Browse failed"));
      return;
    }
    dispatch(fileBrowserBrowseResult(response.entries, response.resolved));
  } catch (error) {
    fail(dispatch, error instanceof Error ? error.message : String(error));
  }
}

async function loadSelected(dispatch: (action: Action) => void, getState: () => AppState): Promise<void> {
  const selected = getState().fileBrowser.selectedFile;
  if (!selected) {
    fail(dispatch, "Select a workspace JSON file");
    return;
  }
  dispatch(fileBrowserLoadStarted());
  try {
    const response = await postLoad(selected);
    if (!response.ok || !response.path || !response.canonicalJson) {
      fail(dispatch, errorMessage(response, "Load failed"), true);
      return;
    }
    dispatch(fileBrowserLoadSucceeded(response.path, response.canonicalJson));
    window.alert(`Loaded ${response.path}`);
  } catch (error) {
    fail(dispatch, error instanceof Error ? error.message : String(error), true);
  }
}

async function saveTarget(targetPath: string, updateCurrent: boolean, dispatch: (action: Action) => void, getState: () => AppState): Promise<void> {
  if (!targetPath) {
    fail(dispatch, "Save path is required", true);
    return;
  }
  dispatch(fileBrowserSaveStarted());
  const state = getState();
  const workspaceJson = buildWorkspaceJson(state.workspace);
  try {
    const response = await postSave(targetPath, workspaceJson, updateCurrent);
    if (!response.ok || !response.path) {
      fail(dispatch, errorMessage(response, "Save failed"), true);
      return;
    }
    dispatch(fileBrowserSaveSucceeded(response.path, updateCurrent));
    window.alert(`${updateCurrent ? "Saved" : "Exported"} to ${response.path}`);
  } catch (error) {
    fail(dispatch, error instanceof Error ? error.message : String(error), true);
  }
}

export function attachFileBrowserEvents(args: { formRoot?: HTMLElement; formRoots?: HTMLElement[]; modalRoot: HTMLElement; dispatch: (action: Action) => void; getState: () => AppState }): () => void {
  const { modalRoot, dispatch, getState } = args;
  const formRoots = args.formRoots ?? (args.formRoot ? [args.formRoot] : []);
  let lastLoadFileActivation: { path: string; at: number } | null = null;
  const onFormClick = (event: MouseEvent): void => {
    const formRoot = formRoots.find((root) => event.target instanceof Element && root.contains(event.target));
    if (!formRoot) return;
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
      if (kind === "dir") {
        lastLoadFileActivation = null;
        void browse(path, dispatch);
      } else {
        const state = getState();
        const now = Date.now();
        const repeatsSelectedFile =
          state.fileBrowser.mode === "load" &&
          state.fileBrowser.selectedFile === path &&
          lastLoadFileActivation?.path === path &&
          now - lastLoadFileActivation.at <= 1000;
        lastLoadFileActivation = { path, at: now };
        if (repeatsSelectedFile) {
          void loadSelected(dispatch, getState);
        } else {
          dispatch(fileBrowserSelect(entry.dataset.name ?? "", path));
        }
      }
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
  const offs = formRoots.map((formRoot) => attachScopedActivation(formRoot, onFormClick));
  const offModalClick = attachScopedActivation(modalRoot, onModalClick);
  const offModalInput = attachScopedEvent<Event>(modalRoot, "input", onModalInput);
  const offModalKeyDown = attachScopedEvent<KeyboardEvent>(modalRoot, "keydown", onKeyDown);
  return () => {
    for (const off of offs) off();
    offModalClick();
    offModalInput();
    offModalKeyDown();
  };
}
