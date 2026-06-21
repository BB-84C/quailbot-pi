import { describe, expect, it } from "vitest";

import { mountForm, typeInto } from "./form-test-helpers.js";
import { actionParam, checkbox, cliTextarea, rampParam, safetyInput, stateWithCli, writableParam } from "./cli-meta-helpers.js";

function change(el: HTMLElement): void {
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("CLI metadata editing", () => {
  it("writable checkbox commits immediately and re-runs action derivation", () => {
    const { root, store } = mountForm(stateWithCli(writableParam()));
    const writable = checkbox(root, "writable");
    writable.checked = false;
    change(writable);
    const cli = store.getState().workspace.cliParams[0]!;
    expect(cli.writable).toBe(false);
    expect(cli.allow_set).toBe(false);
  });

  it("safety_mode select commits for action_cmd drafts", () => {
    const { root, store } = mountForm(stateWithCli(actionParam("guarded")));
    const select = root.querySelector<HTMLSelectElement>('select[data-cli-meta="safetyMode"]');
    if (!select) throw new Error("missing safety mode select");
    select.value = "blocked";
    change(select);
    expect(store.getState().workspace.cliParams[0]?.safety_mode).toBe("blocked");
  });

  it("description textareas write get_cmd/set_cmd descriptions on input", () => {
    const { root, store } = mountForm(stateWithCli(writableParam()));
    typeInto(cliTextarea(root, "getCmdDescription"), "fresh get");
    expect(store.getState().form.cliMeta.getCmdDescription).toBe("fresh get");
    expect(store.getState().workspace.cliParams[0]?.get_cmd?.description).toBe("fresh get");

    typeInto(cliTextarea(root, "setCmdDescription"), "fresh set");
    expect(store.getState().workspace.cliParams[0]?.set_cmd?.description).toBe("fresh set");
  });

  it("safety field input uses safeFloat fallback for garbage text", () => {
    const { root, store } = mountForm(stateWithCli(rampParam()));
    const maxStep = safetyInput(root, "max_step");
    maxStep.value = "garbage";
    maxStep.dispatchEvent(new InputEvent("input", { bubbles: true }));
    expect(store.getState().workspace.cliParams[0]?.safety?.max_step).toBe(3);
  });

  it("rampEnabled checkbox commits immediately and re-derives allow_ramp", () => {
    const { root, store } = mountForm(stateWithCli(rampParam()));
    const rampEnabled = checkbox(root, "rampEnabled");
    rampEnabled.checked = false;
    change(rampEnabled);
    const cli = store.getState().workspace.cliParams[0]!;
    expect(cli.safety?.ramp_enabled).toBe(false);
    expect(cli.allow_ramp).toBe(false);
  });
});
