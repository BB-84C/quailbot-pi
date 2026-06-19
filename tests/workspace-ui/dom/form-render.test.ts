import { describe, expect, it } from "vitest";

import { renderForm } from "../../../src/workspace-ui/client/render/form.js";
import { groupComboboxOptions } from "../../../src/workspace-ui/client/selectors/form.js";
import { initialState } from "../../../src/workspace-ui/client/state.js";
import { fixtureState, selectedState } from "./form-test-helpers.js";

function fields(root: HTMLElement): string[] {
  return [...root.querySelectorAll<HTMLElement>("[data-field]")].map((el) => el.dataset.field ?? "");
}

describe("right-panel form render", () => {
  it("renders empty and multi-select placeholders", () => {
    const root = document.createElement("div");
    renderForm(root, initialState());
    expect(root.textContent).toContain("Select an item to inspect it");

    const multi = fixtureState();
    multi.tree.selected = [
      { kind: "roi", name: "roi-1" },
      { kind: "anchor", name: "anchor-1" },
    ];
    renderForm(root, multi);
    expect(root.querySelector(".form-header")?.textContent).toContain("Multiple items (2)");
    expect(fields(root)).toEqual(["group"]);
  });

  it("renders field visibility for ROI, anchor, group, and CLI stub", () => {
    const root = document.createElement("div");

    renderForm(root, selectedState("roi", "roi-1"));
    expect(root.querySelector(".form-header")?.textContent).toContain("ROI (Observation)");
    expect(fields(root)).toEqual(["name", "x", "y", "w", "h", "tags", "description", "group"]);

    renderForm(root, selectedState("anchor", "anchor-1"));
    expect(root.querySelector(".form-header")?.textContent).toContain("Anchor (Action click point)");
    expect(fields(root)).toEqual(["name", "x", "y", "tags", "description", "group"]);

    renderForm(root, selectedState("group", "A"));
    expect(root.querySelector(".form-header")?.textContent).toContain("Group (Folder)");
    expect(fields(root)).toEqual(["name", "tags", "description", "group"]);

    renderForm(root, selectedState("cli", "bias"));
    expect(root.querySelector(".form-header")?.textContent).toContain("CLI Parameter");
    expect(fields(root)).toEqual(["name", "tags", "description", "group"]);
    expect(root.querySelector<HTMLInputElement>('input[data-field="name"]')?.readOnly).toBe(true);
    expect(root.querySelector(".form-cli-stub")).toBeNull();
    expect(root.querySelector(".cli-meta-block")?.textContent).toContain("CLI Metadata");
    expect(root.querySelector(".cli-linked-obs-placeholder")).toBeNull();
    expect(root.querySelector(".linked-frame")?.textContent).toContain("Linked Observables (cli parameter)");
  });

  it("renders group combobox options from the selector with group descendants excluded", () => {
    const root = document.createElement("div");
    const state = selectedState("group", "A");
    renderForm(root, state);

    const rendered = [...root.querySelectorAll<HTMLOptionElement>('select[data-field="group"] option')].map((opt) => ({ display: opt.textContent ?? "", value: opt.value, selected: opt.selected }));
    expect(rendered).toEqual(groupComboboxOptions(state).map((opt) => ({ display: opt.display, value: opt.value, selected: opt.selected })));
    expect(rendered.map((opt) => opt.value)).not.toContain("A");
    expect(rendered.map((opt) => opt.value)).not.toContain("B");
    expect(rendered.map((opt) => opt.value)).not.toContain("C");
  });
});
