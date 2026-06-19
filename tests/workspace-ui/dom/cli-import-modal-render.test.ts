import { describe, expect, it } from "vitest";

import { cliParamToJson, type CliParamDraft } from "../../../src/workspace-ui/shared/model.js";
import { buildCliConflictReport, type CliImportConflict } from "../../../src/workspace-ui/shared/cli-import.js";
import { initialState, type AppState } from "../../../src/workspace-ui/client/state.js";
import { renderCliImportModal } from "../../../src/workspace-ui/client/render/cli-import-modal.js";

function draft(name: string, label: string, description: string): CliParamDraft {
  return {
    cli_name: "fixturectl",
    name,
    label,
    description,
    tags: "",
    enabled: label !== "Loaded",
    group: "",
    allow_get: true,
    allow_set: false,
    allow_ramp: false,
    readable: true,
    writable: false,
    has_ramp: false,
    safety: null,
    get_cmd: { argv: ["fixturectl", "get", name] },
    set_cmd: null,
    safety_mode: "guarded",
    action_cmd: null,
    linked_observables: [],
    raw_item: {},
  };
}

function stateWith(conflicts: CliImportConflict[], identicalSkipCount: number): AppState {
  const state = initialState();
  state.cliImport = {
    cliName: "fixturectl",
    inFlight: false,
    lastError: null,
    conflicts,
    merged: null,
    identicalSkipCount,
    loadedDrafts: null,
    usedSubcommand: "capabilities",
    modalOpen: true,
  };
  return state;
}

describe("CLI import conflict modal rendering", () => {
  it("renders only conflicting rows, the three resolution buttons, and a byte-exact report block", () => {
    const conflict: CliImportConflict = {
      cli_name: "fixturectl",
      name: "conflict",
      existing: draft("conflict", "Existing", "old"),
      loaded: draft("conflict", "Loaded", "new"),
    };
    const root = document.createElement("div");

    renderCliImportModal(root, stateWith([conflict], 3));

    expect(root.querySelector(".cli-import-modal")?.textContent).toContain("CLI Import — 1 conflict(s) on `CLI_Name, name`");
    const rows = [...root.querySelectorAll<HTMLTableRowElement>("tbody tr")];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain("fixturectl");
    expect(rows[0]?.textContent).toContain("conflict");
    expect(rows[0]?.textContent).not.toContain("identical");
    expect(rows[0]?.textContent).toContain(Object.keys(cliParamToJson(conflict.existing)).join(", "));
    expect(root.querySelector<HTMLButtonElement>('button[data-action="cli-import-keep"]')?.textContent).toBe("Keep existing");
    expect(root.querySelector<HTMLButtonElement>('button[data-action="cli-import-use-loaded"]')?.textContent).toBe("Use loaded");
    expect(root.querySelector<HTMLButtonElement>('button[data-action="cli-import-cancel"]')?.textContent).toBe("Cancel");
    expect(root.querySelector("pre")?.textContent).toBe(buildCliConflictReport([conflict]));
  });

  it("renders nothing when the modal is closed", () => {
    const root = document.createElement("div");
    const state = stateWith([], 0);
    state.cliImport.modalOpen = false;

    renderCliImportModal(root, state);

    expect(root.childElementCount).toBe(0);
  });
});
