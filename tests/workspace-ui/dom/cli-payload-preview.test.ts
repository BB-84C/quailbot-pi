import { describe, expect, it } from "vitest";

import { cliParamToJson } from "../../../src/workspace-ui/shared/model.js";
import { cliPayloadPreviewText } from "../../../src/workspace-ui/client/selectors/form.js";
import { mountForm } from "./form-test-helpers.js";
import { actionParam, checkbox, stateWithCli, writableParam } from "./cli-meta-helpers.js";

function change(el: HTMLElement): void {
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function preview(root: HTMLElement): string {
  return root.querySelector<HTMLElement>(".cli-meta-payload-preview")?.textContent ?? "";
}

describe("CLI payload preview", () => {
  it("renders direct cliPayloadPreviewText output", () => {
    const cli = writableParam();
    const { root } = mountForm(stateWithCli(cli));
    expect(preview(root)).toBe(cliPayloadPreviewText(cli));
    expect(preview(root)).toBe(JSON.stringify(cliParamToJson(cli), null, 2));
  });

  it("updates after writable changes", () => {
    const { root, store } = mountForm(stateWithCli(writableParam()));
    const writable = checkbox(root, "writable");
    writable.checked = false;
    change(writable);
    expect(preview(root)).toBe(cliPayloadPreviewText(store.getState().workspace.cliParams[0]!));
  });

  it("updates after safety_mode changes and keeps normalized casing", () => {
    const { root, store } = mountForm(stateWithCli(actionParam("guarded")));
    const select = root.querySelector<HTMLSelectElement>('select[data-cli-meta="safetyMode"]');
    if (!select) throw new Error("missing safety mode select");
    select.value = "alwaysAllowed";
    change(select);
    expect(preview(root)).toBe(cliPayloadPreviewText(store.getState().workspace.cliParams[0]!));
    expect(preview(root)).toContain('"safety_mode": "alwaysAllowed"');
    expect(preview(root)).not.toContain("alwaysallowed");
  });
});
