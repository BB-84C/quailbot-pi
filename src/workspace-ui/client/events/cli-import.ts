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

function importSuccessMessage(args: { cliName: string; usedSubcommand: string; loadedCount: number; identicalSkipCount: number; conflictCount: number; conflictChoice: "none" | "keep" | "clean" }): string {
  return [
    `Loaded ${args.loadedCount} CLI entries from '${args.cliName} ${args.usedSubcommand}'.`,
    `Identical skipped: ${args.identicalSkipCount}. Conflicts: ${args.conflictCount} (${args.conflictChoice}).`,
  ].join("\n");
}

function alertProbeFailure(cliName: string, error: string): void {
  window.alert(`Unable to query capabilities from '${cliName}'.\n${error}`);
}

function alertResolvedImport(state: AppState, conflictChoice: "keep" | "clean"): void {
  window.alert(
    importSuccessMessage({
      cliName: state.cliImport.cliName,
      usedSubcommand: state.cliImport.usedSubcommand,
      loadedCount: state.cliImport.loadedDrafts?.length ?? 0,
      identicalSkipCount: state.cliImport.identicalSkipCount,
      conflictCount: state.cliImport.conflicts.length,
      conflictChoice,
    }),
  );
}

async function runImport(dispatch: (action: Action) => void, getState: () => AppState): Promise<void> {
  const state = getState();
  const cliName = state.cliImport.cliName.trim() || "cli";
  if (!cliNamePattern.test(cliName)) {
    const error = "invalid CLI name";
    dispatch(cliImportProbeFailed(error));
    alertProbeFailure(cliName, error);
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
      const error = response.error || "CLI import failed";
      dispatch(cliImportProbeFailed(error));
      alertProbeFailure(cliName, error);
      return;
    }
    const usedSubcommand = response.usedSubcommand === "capacities" ? "capacities" : response.usedSubcommand === "capabilities" ? "capabilities" : "";
    const loadedDrafts = loadedDraftsFromCapabilities(response.payload, cliName);
    const mergeResult = mergeCliParamDrafts(getState().workspace.cliParams, loadedDrafts);
    dispatch(cliImportProbeSucceeded({ cliName, usedSubcommand, mergeResult, loadedDrafts }));
    if (mergeResult.conflicts.length === 0) {
      window.alert(
        importSuccessMessage({
          cliName,
          usedSubcommand,
          loadedCount: loadedDrafts.length,
          identicalSkipCount: mergeResult.identicalSkipCount,
          conflictCount: 0,
          conflictChoice: "none",
        }),
      );
    }
  } catch (exc) {
    const error = exc instanceof Error ? exc.message : String(exc);
    dispatch(cliImportProbeFailed(error));
    alertProbeFailure(cliName, error);
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
      alertResolvedImport(getState(), "keep");
      dispatch(cliImportResolveKeepExisting());
      return;
    }
    const useLoaded = closestWithin<HTMLButtonElement>(event.target, 'button[data-action="cli-import-use-loaded"]', modalRoot);
    if (useLoaded) {
      event.preventDefault();
      alertResolvedImport(getState(), "clean");
      dispatch(cliImportResolveUseLoaded());
      return;
    }
    const cancel = closestWithin<HTMLElement>(event.target, '[data-action="cli-import-cancel"]', modalRoot);
    if (cancel) {
      event.preventDefault();
      dispatch(cliImportResolveCancel());
      window.alert("Import cancelled. Existing workspace entries were left unchanged.");
    }
  };
  const onModalKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    dispatch(cliImportResolveCancel());
    window.alert("Import cancelled. Existing workspace entries were left unchanged.");
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
