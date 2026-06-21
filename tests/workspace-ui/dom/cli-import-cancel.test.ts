import { beforeEach, describe, expect, it, vi } from "vitest";

import { type Action } from "../../../src/workspace-ui/client/actions.js";
import { attachCliImportEvents } from "../../../src/workspace-ui/client/events/cli-import.js";
import { renderCliImportModal } from "../../../src/workspace-ui/client/render/cli-import-modal.js";
import { createStore } from "../../../src/workspace-ui/client/store.js";
import { initialState, type AppState } from "../../../src/workspace-ui/client/state.js";
import type { CliParamDraft } from "../../../src/workspace-ui/shared/model.js";

function draft(label: string): CliParamDraft {
  return {
    cli_name: "fixturectl",
    name: "conflict",
    label,
    description: label,
    tags: "",
    enabled: true,
    group: "",
    allow_get: true,
    allow_set: false,
    allow_ramp: false,
    readable: true,
    writable: false,
    has_ramp: false,
    safety: null,
    get_cmd: {},
    set_cmd: null,
    safety_mode: "guarded",
    action_cmd: null,
    linked_observables: [],
    raw_item: {},
  };
}

function modalState(): AppState {
  const state = initialState();
  state.cliImport = {
    cliName: "fixturectl",
    inFlight: false,
    lastError: null,
    conflicts: [{ cli_name: "fixturectl", name: "conflict", existing: draft("existing"), loaded: draft("loaded") }],
    merged: [draft("existing")],
    identicalSkipCount: 0,
    loadedDrafts: [draft("loaded")],
    usedSubcommand: "capabilities",
    modalOpen: true,
  };
  return state;
}

function mount() {
  const formRoot = document.createElement("section");
  const modalRoot = document.createElement("section");
  const store = createStore(modalState());
  const dispatch = (action: Action): void => {
    store.dispatch(action);
    renderCliImportModal(modalRoot, store.getState());
  };
  renderCliImportModal(modalRoot, store.getState());
  attachCliImportEvents({ formRoot, modalRoot, dispatch, getState: store.getState });
  return { modalRoot, store };
}

describe("CLI import modal cancellation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(window, "alert").mockImplementation(() => undefined);
  });

  it("dispatches cancel on Escape", () => {
    const { modalRoot, store } = mount();

    modalRoot.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(store.getState().cliImport.modalOpen).toBe(false);
    expect(window.alert).toHaveBeenCalledWith("Import cancelled. Existing workspace entries were left unchanged.");
  });

  it("dispatches cancel when the backdrop is clicked", () => {
    const { modalRoot, store } = mount();

    modalRoot.querySelector<HTMLElement>(".cli-import-backdrop")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(store.getState().cliImport.modalOpen).toBe(false);
    expect(window.alert).toHaveBeenCalledWith("Import cancelled. Existing workspace entries were left unchanged.");
  });
});
