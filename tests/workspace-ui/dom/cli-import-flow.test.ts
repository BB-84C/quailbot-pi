import { beforeEach, describe, expect, it, vi } from "vitest";

import { formSelectionChanged, type Action } from "../../../src/workspace-ui/client/actions.js";
import { attachCliImportEvents } from "../../../src/workspace-ui/client/events/cli-import.js";
import { renderCliImportModal } from "../../../src/workspace-ui/client/render/cli-import-modal.js";
import { renderForm } from "../../../src/workspace-ui/client/render/form.js";
import { renderToolbar } from "../../../src/workspace-ui/client/render/toolbar.js";
import { selectionSummary } from "../../../src/workspace-ui/client/selectors/form.js";
import { createStore } from "../../../src/workspace-ui/client/store.js";
import { initialState, type AppState } from "../../../src/workspace-ui/client/state.js";
import { cliParamToJson, type CliParamDraft } from "../../../src/workspace-ui/shared/model.js";
import { applyCliConflictResolution } from "../../../src/workspace-ui/shared/cli-import.js";

function existingConflictDraft(): CliParamDraft {
  return {
    cli_name: "fixturectl",
    name: "conflict",
    label: "Conflict",
    description: "existing",
    tags: "",
    enabled: true,
    group: "",
    allow_get: true,
    allow_set: false,
    allow_ramp: false,
    readable: true,
    writable: true,
    has_ramp: false,
    safety: null,
    get_cmd: { argv: ["fixturectl", "get", "conflict"] },
    set_cmd: null,
    safety_mode: "guarded",
    action_cmd: null,
    linked_observables: [],
    raw_item: {},
  };
}

function fixtureState(): AppState {
  const state = initialState();
  state.workspace.cliName = "fixturectl";
  state.workspace.cliEnabled = false;
  state.workspace.cliParams = [existingConflictDraft()];
  state.cliImport.cliName = "fixturectl";
  return state;
}

function capabilitiesPayload(): Record<string, unknown> {
  return {
    parameters: {
      items: [
        {
          name: "conflict",
          CLI_Name: "fixturectl",
          label: "Conflict Loaded",
          readable: true,
          writable: true,
          enabled: false,
          description: "loaded",
          get_cmd: { argv: ["fixturectl", "get", "conflict"] },
          set_cmd: { argv: ["fixturectl", "set", "conflict"] },
          actions: { get: true, set: true, ramp: false },
        },
      ],
    },
    action_commands: { items: [] },
  };
}

function mount(state = fixtureState()) {
  const formRoot = document.createElement("section");
  const toolbarRoot = document.createElement("section");
  const modalRoot = document.createElement("section");
  document.body.replaceChildren(toolbarRoot, formRoot, modalRoot);
  const store = createStore(state);
  const dispatch = (action: Action): void => {
    store.dispatch(action);
    renderToolbar(toolbarRoot, store.getState());
    renderForm(formRoot, store.getState());
    renderCliImportModal(modalRoot, store.getState());
  };
  dispatch(formSelectionChanged(selectionSummary(store.getState())));
  renderToolbar(toolbarRoot, store.getState());
  const off = attachCliImportEvents({ formRoot: toolbarRoot, modalRoot, dispatch, getState: store.getState });
  return { toolbarRoot, formRoot, modalRoot, store, dispatch, off };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("CLI import client flow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(window, "alert").mockImplementation(() => undefined);
  });

  it("probes, merges, opens conflicts, and applies Use loaded", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ ok: true, payload: capabilitiesPayload(), usedSubcommand: "capabilities", error: "" }) }));
    const { toolbarRoot, formRoot, modalRoot, store } = mount();

    expect(formRoot.querySelector('button[data-action="cli-import-load"]')).toBeNull();
    toolbarRoot.querySelector<HTMLButtonElement>('button[data-action="cli-import-load"]')?.click();
    await flush();

    const pending = store.getState().cliImport;
    expect(pending.modalOpen).toBe(true);
    expect(pending.conflicts).toHaveLength(1);
    expect(modalRoot.querySelector(".cli-import-modal")?.textContent).toContain("1 conflict");
    const expected = applyCliConflictResolution(pending.merged ?? [], pending.conflicts, true).map((draft) => cliParamToJson(draft));

    modalRoot.querySelector<HTMLButtonElement>('button[data-action="cli-import-use-loaded"]')?.click();

    expect(store.getState().workspace.cliEnabled).toBe(true);
    expect(store.getState().workspace.cliName).toBe("fixturectl");
    expect(store.getState().workspace.cliParams.map((draft) => cliParamToJson(draft))).toEqual(expected);
    expect(window.alert).toHaveBeenCalledWith("Loaded 1 CLI entries from 'fixturectl capabilities'.\nIdentical skipped: 0. Conflicts: 1 (clean).");
  });

  it("Cancel leaves the workspace unchanged", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ ok: true, payload: capabilitiesPayload(), usedSubcommand: "capabilities", error: "" }) }));
    const { toolbarRoot, formRoot, modalRoot, store } = mount();
    const before = store.getState().workspace.cliParams.map((draft) => cliParamToJson(draft));

    toolbarRoot.querySelector<HTMLButtonElement>('button[data-action="cli-import-load"]')?.click();
    await flush();
    modalRoot.querySelector<HTMLButtonElement>('button[data-action="cli-import-cancel"]')?.click();

    expect(store.getState().cliImport.modalOpen).toBe(false);
    expect(store.getState().workspace.cliEnabled).toBe(false);
    expect(store.getState().workspace.cliParams.map((draft) => cliParamToJson(draft))).toEqual(before);
    expect(window.alert).toHaveBeenCalledWith("Import cancelled. Existing workspace entries were left unchanged.");
  });

  it("alerts the Tk-style success message when import has no conflicts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({
        ok: true,
        payload: {
          parameters: { items: [{ name: "new_param", CLI_Name: "fixturectl", label: "New Param", readable: true, enabled: false }] },
          action_commands: { items: [] },
        },
        usedSubcommand: "capacities",
        error: "",
      }),
    }));
    const { toolbarRoot, store } = mount();

    toolbarRoot.querySelector<HTMLButtonElement>('button[data-action="cli-import-load"]')?.click();
    await flush();

    expect(store.getState().cliImport.modalOpen).toBe(false);
    expect(store.getState().workspace.cliParams.map((draft) => draft.name)).toEqual(["conflict", "new_param"]);
    expect(window.alert).toHaveBeenCalledWith("Loaded 1 CLI entries from 'fixturectl capacities'.\nIdentical skipped: 0. Conflicts: 0 (none).");
  });

  it("alerts probe failures like Tk showerror", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ ok: false, usedSubcommand: "capacities", error: "no capacities" }) }));
    const { toolbarRoot, store } = mount();

    toolbarRoot.querySelector<HTMLButtonElement>('button[data-action="cli-import-load"]')?.click();
    await flush();

    expect(store.getState().cliImport.lastError).toBe("no capacities");
    expect(window.alert).toHaveBeenCalledWith("Unable to query capabilities from 'fixturectl'.\nno capacities");
  });

  it("uses the edited native CLI Name input when probing the CLI", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        ok: true,
        payload: { parameters: { items: [] }, action_commands: { items: [] } },
        usedSubcommand: "capabilities",
        error: "",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { toolbarRoot, store } = mount();

    const input = toolbarRoot.querySelector<HTMLInputElement>('input[data-cli-import-name="true"]');
    if (!input) throw new Error("missing CLI Name input");
    input.value = "customctl";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    toolbarRoot.querySelector<HTMLButtonElement>('button[data-action="cli-import-load"]')?.click();
    await flush();

    expect(store.getState().cliImport.cliName).toBe("customctl");
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toMatchObject({
      cliName: "customctl",
      declaredCliNames: expect.arrayContaining(["customctl"]),
    });
    expect(store.getState().workspace.cliName).toBe("customctl");
  });

  it("uses Tk's default cli name when the native CLI Name input is blank", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        ok: true,
        payload: { parameters: { items: [] }, action_commands: { items: [] } },
        usedSubcommand: "capabilities",
        error: "",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { toolbarRoot, store } = mount();

    const input = toolbarRoot.querySelector<HTMLInputElement>('input[data-cli-import-name="true"]');
    if (!input) throw new Error("missing CLI Name input");
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    toolbarRoot.querySelector<HTMLButtonElement>('button[data-action="cli-import-load"]')?.click();
    await flush();

    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toMatchObject({
      cliName: "cli",
      declaredCliNames: expect.arrayContaining(["cli"]),
    });
    expect(store.getState().cliImport.lastError).toBeNull();
    expect(store.getState().workspace.cliName).toBe("cli");
  });
});
