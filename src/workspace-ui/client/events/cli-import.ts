import {
  cliImportNameChanged,
  cliImportProbeFailed,
  cliImportProbeStarted,
  cliImportProbeSucceeded,
  cliImportResolveCancel,
  cliImportResolveKeepExisting,
  cliImportResolveUseLoaded,
  type Action,
} from "../actions.js";
import { postCliImport } from "../api/cli-import.js";
import type { AppState } from "../state.js";
import { declaredCliNamesForWorkspace, loadedDraftsFromCapabilities, mergeCliParamDrafts } from "../../shared/cli-import.js";
import { attachScopedActivation, attachScopedEvent, closestWithin } from "./delegation.js";

const cliNamePattern = /^[A-Za-z0-9_.-]+$/;

async function runImport(dispatch: (action: Action) => void, getState: () => AppState): Promise<void> {
  const state = getState();
  const cliName = state.cliImport.cliName.trim();
  if (!cliName) {
    dispatch(cliImportProbeFailed("CLI name is required"));
    return;
  }
  if (!cliNamePattern.test(cliName)) {
    dispatch(cliImportProbeFailed("invalid CLI name"));
    return;
  }
  const declared = declaredCliNamesForWorkspace({ ...state.workspace, cliName });
  if (!declared.has(cliName)) {
    declared.add(cliName);
  }
  dispatch(cliImportProbeStarted());
  try {
    const response = await postCliImport(cliName, [...declared]);
    if (!response.ok || !response.payload) {
      dispatch(cliImportProbeFailed(response.error || "CLI import failed"));
      return;
    }
    const usedSubcommand = response.usedSubcommand === "capacities" ? "capacities" : response.usedSubcommand === "capabilities" ? "capabilities" : "";
    const loadedDrafts = loadedDraftsFromCapabilities(response.payload, cliName);
    const mergeResult = mergeCliParamDrafts(getState().workspace.cliParams, loadedDrafts);
    dispatch(cliImportProbeSucceeded({ cliName, usedSubcommand, mergeResult, loadedDrafts }));
  } catch (exc) {
    dispatch(cliImportProbeFailed(exc instanceof Error ? exc.message : String(exc)));
  }
}

export function attachCliImportEvents(args: { formRoot: HTMLElement; modalRoot: HTMLElement; dispatch: (action: Action) => void; getState: () => AppState }): () => void {
  const { formRoot, modalRoot, dispatch, getState } = args;
  const onFormInput = (event: Event): void => {
    const input = closestWithin<HTMLInputElement>(event.target, 'input[data-cli-import-name="true"]', formRoot);
    if (!input) return;
    dispatch(cliImportNameChanged(input.value));
  };
  const onFormClick = (event: MouseEvent): void => {
    const button = closestWithin<HTMLButtonElement>(event.target, 'button[data-action="cli-import-load"]', formRoot);
    if (!button) return;
    event.preventDefault();
    void runImport(dispatch, getState);
  };
  const onModalClick = (event: MouseEvent): void => {
    const keep = closestWithin<HTMLButtonElement>(event.target, 'button[data-action="cli-import-keep"]', modalRoot);
    if (keep) {
      event.preventDefault();
      dispatch(cliImportResolveKeepExisting());
      return;
    }
    const useLoaded = closestWithin<HTMLButtonElement>(event.target, 'button[data-action="cli-import-use-loaded"]', modalRoot);
    if (useLoaded) {
      event.preventDefault();
      dispatch(cliImportResolveUseLoaded());
      return;
    }
    const cancel = closestWithin<HTMLElement>(event.target, '[data-action="cli-import-cancel"]', modalRoot);
    if (cancel) {
      event.preventDefault();
      dispatch(cliImportResolveCancel());
    }
  };
  const onModalKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    dispatch(cliImportResolveCancel());
  };
  const offFormInput = attachScopedEvent<Event>(formRoot, "input", onFormInput);
  const offFormClick = attachScopedActivation(formRoot, onFormClick);
  const offModalClick = attachScopedActivation(modalRoot, onModalClick);
  const offModalKeyDown = attachScopedEvent<KeyboardEvent>(modalRoot, "keydown", onModalKeyDown);
  return () => {
    offFormInput();
    offFormClick();
    offModalClick();
    offModalKeyDown();
  };
}
