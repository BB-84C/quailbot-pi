import { describe, expect, it } from "vitest";

import { linkedAdd, linkedPickerChanged, linkedRemove, linkedSearchChanged } from "../../../src/workspace-ui/client/actions.js";
import { linkedPickerOptions } from "../../../src/workspace-ui/client/selectors/form.js";
import { runtimeLinkedObservables } from "../../../src/workspace-ui/shared/model.js";
import { cliDraft, rampParam, writableParam } from "./cli-meta-helpers.js";
import { fixtureState, mountForm, selectedState } from "./form-test-helpers.js";

function input(el: HTMLElement): void {
  el.dispatchEvent(new InputEvent("input", { bubbles: true }));
}

function change(el: HTMLElement): void {
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function click(el: HTMLElement): void {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

describe("linked observables editing", () => {
  it("adds and removes ROI links on an anchor through DOM events", () => {
    const { root, store } = mountForm(selectedState("anchor", "anchor-1"));
    const picker = root.querySelector<HTMLSelectElement>('select[data-region="linked-picker"]');
    if (!picker) throw new Error("missing linked picker");
    picker.value = "roi-2";
    change(picker);
    click(root.querySelector<HTMLButtonElement>('button[data-action="linked-add"]')!);
    expect(store.getState().workspace.anchors[0]?.linked_rois).toEqual(["roi-2"]);

    click(root.querySelector<HTMLButtonElement>('button[data-action="linked-remove"][data-name="roi-2"]')!);
    expect(store.getState().workspace.anchors[0]?.linked_rois).toEqual([]);
  });

  it("does not remove CLI auto entries through disabled controls or direct LINKED_REMOVE", () => {
    const cli = writableParam();
    cli.linked_observables = ["other"];
    const state = fixtureState();
    state.workspace.cliParams = [cli, cliDraft({ name: "other" })];
    state.tree.selected = [{ kind: "cli", name: cli.name }];
    const { root, store, dispatch } = mountForm(state);

    const autoName = runtimeLinkedObservables(cli).find((entry) => !entry.editable)?.name;
    expect(autoName).toBe(cli.name);
    expect(root.querySelector<HTMLButtonElement>(`button[data-action="linked-remove"][data-name="${autoName}"]`)?.disabled).toBe(true);

    dispatch(linkedRemove(autoName ?? ""));
    expect(store.getState().workspace.cliParams[0]?.linked_observables).toEqual(["other"]);
  });

  it("adds CLI links into linked_observables and re-runs action derivation", () => {
    const cli = rampParam();
    cli.safety = { ...cli.safety, ramp_enabled: false };
    cli.allow_ramp = true;
    const state = fixtureState();
    state.workspace.cliParams = [cli, cliDraft({ name: "aux" })];
    state.tree.selected = [{ kind: "cli", name: cli.name }];
    const { store, dispatch } = mountForm(state);

    dispatch(linkedPickerChanged("aux"));
    dispatch(linkedAdd());
    const updated = store.getState().workspace.cliParams[0]!;
    expect(updated.linked_observables).toEqual(["aux"]);
    expect(updated.allow_ramp).toBe(false);
  });

  it("search filters picker options with lowercase substring matching", () => {
    const state = selectedState("anchor", "anchor-1");
    state.workspace.rois.push({ name: "Scope-Monitor", x: 0, y: 0, w: 2, h: 2, description: "", tags: "", active: true, group: "" });
    const { root, store } = mountForm(state);

    const search = root.querySelector<HTMLInputElement>('input[data-region="linked-search"]');
    if (!search) throw new Error("missing linked search");
    search.value = "SCOPE";
    input(search);

    expect(store.getState().form.linkedObs.searchText).toBe("SCOPE");
    expect(linkedPickerOptions(store.getState())).toEqual(["Scope-Monitor"]);
    expect([...root.querySelectorAll<HTMLOptionElement>('select[data-region="linked-picker"] option')].map((option) => option.value)).toEqual(["Scope-Monitor"]);
  });

  it("keeps the linked search input focused while filtering", () => {
    const { root } = mountForm(selectedState("anchor", "anchor-1"));
    document.body.append(root);
    const search = root.querySelector<HTMLInputElement>('input[data-region="linked-search"]');
    if (!search) throw new Error("missing linked search");
    search.focus();
    search.value = "roi";
    input(search);

    expect(document.activeElement).toBe(root.querySelector<HTMLInputElement>('input[data-region="linked-search"]'));
    root.remove();
  });
});
