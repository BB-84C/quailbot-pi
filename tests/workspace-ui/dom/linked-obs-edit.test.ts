import { describe, expect, it } from "vitest";

import { formSelectionChanged, linkedAdd, linkedPickerChanged, linkedRemove, linkedSearchChanged } from "../../../src/workspace-ui/client/actions.js";
import { linkedPickerOptions, selectionSummary } from "../../../src/workspace-ui/client/selectors/form.js";
import { runtimeLinkedObservables } from "../../../src/workspace-ui/shared/model.js";
import { actionParam, cliDraft, rampParam, writableParam } from "./cli-meta-helpers.js";
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

function ctrlClick(el: HTMLElement): void {
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
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

    click(root.querySelector<HTMLElement>('.linked-list [data-action="linked-select"][data-name="roi-2"]')!);
    expect(root.querySelector<HTMLElement>('.linked-list [data-name="roi-2"]')?.getAttribute("aria-selected")).toBe("true");
    click(root.querySelector<HTMLButtonElement>('button[data-action="linked-remove-selected"]')!);
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
    expect(root.querySelector<HTMLElement>(`.linked-list [data-action="linked-select"][data-name="${autoName}"]`)?.getAttribute("aria-disabled")).toBe("true");
    expect(root.querySelector<HTMLButtonElement>('button[data-action="linked-remove"]')).toBeNull();

    dispatch(linkedRemove(autoName ?? ""));
    expect(store.getState().workspace.cliParams[0]?.linked_observables).toEqual(["other"]);
  });

  it("removes multiple selected editable linked entries with the Tk-style Remove selected button", () => {
    const state = selectedState("anchor", "anchor-1");
    state.workspace.anchors[0]!.linked_rois = ["roi-1", "roi-2"];
    const { root, store } = mountForm(state);

    click(root.querySelector<HTMLElement>('.linked-list [data-action="linked-select"][data-name="roi-1"]')!);
    ctrlClick(root.querySelector<HTMLElement>('.linked-list [data-action="linked-select"][data-name="roi-2"]')!);
    expect(store.getState().form.linkedObs.selectedNames).toEqual(["roi-1", "roi-2"]);

    click(root.querySelector<HTMLButtonElement>('button[data-action="linked-remove-selected"]')!);
    expect(store.getState().workspace.anchors[0]?.linked_rois).toEqual([]);
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

  it("adds ROI links into CLI linked_observables", () => {
    const cli = rampParam();
    const state = fixtureState();
    state.workspace.cliParams = [cli, cliDraft({ name: "aux" })];
    state.tree.selected = [{ kind: "cli", name: cli.name }];
    const { root, store, dispatch } = mountForm(state);

    expect([...root.querySelectorAll<HTMLOptionElement>('select[data-region="linked-picker"] option')].map((option) => option.value)).toEqual([
      "aux",
      "roi-1",
      "roi-2",
    ]);

    dispatch(linkedPickerChanged("roi-2"));
    dispatch(linkedAdd());

    expect(store.getState().workspace.cliParams[0]?.linked_observables).toEqual(["roi-2"]);
    expect(root.querySelector<HTMLElement>('.linked-list [data-action="linked-select"][data-name="roi-2"]')).not.toBeNull();
  });

  it("adds ROI links into CLI action linked_observables", () => {
    const action = actionParam("guarded");
    const state = fixtureState();
    state.workspace.cliParams = [action, cliDraft({ name: "current" })];
    state.tree.selected = [{ kind: "cli", name: action.name }];
    const { store, dispatch } = mountForm(state);

    expect(linkedPickerOptions(store.getState())).toEqual(["current", "roi-1", "roi-2"]);

    dispatch(linkedPickerChanged("roi-1"));
    dispatch(linkedAdd());

    expect(store.getState().workspace.cliParams[0]?.linked_observables).toEqual(["roi-1"]);
  });

  it("offers raw and current CLI links in the picker so removed links can be restored", () => {
    const cli = cliDraft({
      name: "action",
      readable: false,
      writable: false,
      allow_get: false,
      allow_set: false,
      get_cmd: null,
      set_cmd: null,
      safety: null,
      action_cmd: { command: "Action" },
      linked_observables: ["scan_status", "scan_speed"],
      raw_item: { linked_observables: ["scan_status", "scan_buffer", "scan_speed"] },
    });
    const state = fixtureState();
    state.workspace.cliParams = [cli, cliDraft({ name: "current" })];
    state.tree.selected = [{ kind: "cli", name: "action" }];
    const { root, store, dispatch } = mountForm(state);

    expect(linkedPickerOptions(store.getState())).toEqual(["current", "roi-1", "roi-2", "scan_status", "scan_buffer", "scan_speed"]);

    dispatch(linkedPickerChanged("scan_buffer"));
    dispatch(linkedAdd());
    expect(store.getState().workspace.cliParams[0]?.linked_observables).toEqual(["scan_status", "scan_speed", "scan_buffer"]);
    expect([...root.querySelectorAll<HTMLElement>('.linked-list [role="option"]')].map((item) => item.dataset.name)).toEqual(["scan_status", "scan_speed", "scan_buffer"]);
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

  it("resets linked search and picker when the selected item changes", () => {
    const state = selectedState("anchor", "anchor-1");
    state.workspace.cliParams.push(cliDraft({ name: "aux" }));
    const { root, store, dispatch } = mountForm(state);

    dispatch(linkedSearchChanged("roi"));
    expect(store.getState().form.linkedObs.searchText).toBe("roi");

    dispatch({ type: "TREE_CLICK_ITEM", payload: { kind: "cli", name: "bias", region: "body", modifiers: { ctrl: false, shift: false } } });
    dispatch(formSelectionChanged(selectionSummary(store.getState())));

    expect(store.getState().form.linkedObs.searchText).toBe("");
    expect(linkedPickerOptions(store.getState())).toEqual(["aux", "roi-1", "roi-2"]);
    expect(root.querySelector<HTMLInputElement>('input[data-region="linked-search"]')?.value).toBe("");
    expect([...root.querySelectorAll<HTMLOptionElement>('select[data-region="linked-picker"] option')].map((option) => option.value)).toEqual(["aux", "roi-1", "roi-2"]);
  });
});
