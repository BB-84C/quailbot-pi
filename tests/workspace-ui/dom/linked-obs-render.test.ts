import { describe, expect, it } from "vitest";

import { renderForm } from "../../../src/workspace-ui/client/render/form.js";
import { initialState, type AppState } from "../../../src/workspace-ui/client/state.js";
import { runtimeLinkedObservables } from "../../../src/workspace-ui/shared/model.js";
import { actionParam, cliDraft, writableParam } from "./cli-meta-helpers.js";
import { fixtureState, selectedState } from "./form-test-helpers.js";

function linkedFrame(root: HTMLElement): HTMLElement | null {
  return root.querySelector<HTMLElement>(".linked-frame");
}

function pickerOptions(root: HTMLElement): string[] {
  return [...root.querySelectorAll<HTMLOptionElement>('select[data-region="linked-picker"] option')].map((option) => option.value);
}

function renderSelected(state: AppState): HTMLElement {
  const root = document.createElement("div");
  renderForm(root, state);
  return root;
}

describe("linked observables render", () => {
  it("renders anchor mode with all ROI names", () => {
    const root = renderSelected(selectedState("anchor", "anchor-1"));
    expect(linkedFrame(root)?.classList.contains("linked-frame--anchor")).toBe(true);
    expect(linkedFrame(root)?.querySelector("h3")?.textContent).toBe("Linked Observables (anchor)");
    expect(pickerOptions(root)).toEqual(["roi-1", "roi-2"]);
    expect(root.querySelector(".linked-list")?.getAttribute("role")).toBe("listbox");
    expect(root.querySelector<HTMLButtonElement>('button[data-action="linked-remove-selected"]')?.textContent).toBe("Remove selected");
  });

  it("renders enabled CLI parameter mode when set_cmd is present", () => {
    const state = fixtureState();
    state.workspace.cliParams = [writableParam(), cliDraft({ name: "other", label: "Other" })];
    state.tree.selected = [{ kind: "cli", name: "writable" }];
    const root = renderSelected(state);

    expect(linkedFrame(root)?.classList.contains("linked-frame--cli")).toBe(true);
    expect(linkedFrame(root)?.getAttribute("aria-disabled")).toBe("false");
    expect(root.querySelector<HTMLInputElement>('input[data-region="linked-search"]')?.disabled).toBe(false);
    expect(pickerOptions(root)).toEqual(["other", "roi-1", "roi-2"]);
    expect(root.querySelector(".linked-hint")?.textContent).toContain("implicit self-observables");
    expect(root.querySelector(".cli-actions-display")?.textContent).toContain("get");
  });

  it("renders disabled CLI parameter mode when set_cmd and action_cmd are absent", () => {
    const state = fixtureState();
    state.workspace.cliParams = [cliDraft({ name: "read-only", set_cmd: null, action_cmd: null }), cliDraft({ name: "other" })];
    state.tree.selected = [{ kind: "cli", name: "read-only" }];
    const root = renderSelected(state);

    expect(linkedFrame(root)?.getAttribute("aria-disabled")).toBe("true");
    expect(root.querySelector<HTMLInputElement>('input[data-region="linked-search"]')?.disabled).toBe(true);
    expect(root.querySelector<HTMLSelectElement>('select[data-region="linked-picker"]')?.disabled).toBe(true);
    expect(root.querySelector<HTMLButtonElement>('button[data-action="linked-add"]')?.disabled).toBe(true);
  });

  it("renders enabled CLI action mode and omits linked frame outside anchor/cli selections", () => {
    const action = actionParam("guarded");
    const state = fixtureState();
    state.workspace.cliParams = [action, cliDraft({ name: "other" })];
    state.tree.selected = [{ kind: "cli", name: action.name }];
    const root = renderSelected(state);

    expect(linkedFrame(root)?.classList.contains("linked-frame--cli_action")).toBe(true);
    expect(linkedFrame(root)?.getAttribute("aria-disabled")).toBe("false");
    expect(pickerOptions(root)).toEqual(["other", "roi-1", "roi-2"]);
    expect(root.querySelector(".linked-hint")).toBeNull();
    expect(root.querySelector(".cli-actions-display")).toBeNull();

    expect(linkedFrame(renderSelected(selectedState("roi", "roi-1")))).toBeNull();
    expect(linkedFrame(renderSelected(selectedState("group", "A")))).toBeNull();
    expect(linkedFrame(renderSelected(initialState()))).toBeNull();
  });

  it("displays CLI auto entries with the auto suffix and excludes current CLI from picker options", () => {
    const cli = writableParam();
    cli.linked_observables = ["other", cli.name];
    const state = fixtureState();
    state.workspace.cliParams = [cli, cliDraft({ name: "other", label: "Other" })];
    state.tree.selected = [{ kind: "cli", name: cli.name }];
    const root = renderSelected(state);

    const renderedEntries = [...root.querySelectorAll<HTMLLIElement>(".linked-list li")].map((li) => ({ text: li.textContent ?? "", disabled: li.getAttribute("aria-disabled") }));
    const expected = runtimeLinkedObservables(cli).map((entry) => `${entry.name}${entry.editable ? "" : " (auto)"}`);
    expect(renderedEntries.map((entry) => entry.text)).toEqual(expected);
    expect(renderedEntries[0]?.disabled).toBe("true");
    expect(root.querySelector<HTMLButtonElement>('button[data-action="linked-remove"]')).toBeNull();
    expect(pickerOptions(root)).toEqual(["other", "roi-1", "roi-2"]);
  });
});
