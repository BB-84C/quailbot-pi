import { describe, expect, it } from "vitest";

import { cliMetaVisibility } from "../../../src/workspace-ui/client/selectors/form.js";
import { renderForm } from "../../../src/workspace-ui/client/render/form.js";
import { actionParam, control, rampParam, readableOnly, safetyFields, stateWithCli, writableParam } from "./cli-meta-helpers.js";

function rendered(cli = readableOnly()): HTMLElement {
  const root = document.createElement("div");
  renderForm(root, stateWithCli(cli));
  return root;
}

describe("CLI metadata visibility", () => {
  it("matches selector and DOM visibility for readable-only parameters", () => {
    const cli = readableOnly();
    expect(cliMetaVisibility(cli)).toMatchObject({ showWritable: false, showSafetyMode: false, showGetDesc: true, showSetDesc: false, rampEnabledVisible: false });
    const root = rendered(cli);
    expect(control(root, ".cli-meta-writable")).toBeNull();
    expect(control(root, ".cli-meta-safety-mode")).toBeNull();
    expect(control(root, ".cli-meta-get-desc textarea:not([disabled])")).not.toBeNull();
    expect(control(root, ".cli-meta-set-desc")).toBeNull();
  });

  it("shows writable and set description for parameters with set_cmd", () => {
    const cli = writableParam();
    expect(cliMetaVisibility(cli)).toMatchObject({ showWritable: true, showSafetyMode: false, showGetDesc: true, showSetDesc: true });
    const root = rendered(cli);
    expect(control(root, ".cli-meta-writable input")).not.toBeNull();
    expect(control(root, ".cli-meta-set-desc textarea:not([disabled])")).not.toBeNull();
    expect(control(root, ".cli-meta-safety-mode")).toBeNull();
  });

  it("enables only present safety fields and ramp_enabled for ramp-capable parameters", () => {
    const cli = rampParam();
    expect(cliMetaVisibility(cli).rampEnabledVisible).toBe(true);
    const root = rendered(cli);
    for (const field of safetyFields) {
      expect(control(root, `.cli-meta-safety-${field} input:not([disabled])`), field).not.toBeNull();
    }
    expect(control(root, ".cli-meta-ramp-enabled input")).not.toBeNull();
  });

  it.each(["alwaysAllowed", "blocked", "guarded"] as const)("shows only safety_mode for action_cmd %s", (mode) => {
    const root = rendered(actionParam(mode));
    expect(control(root, ".cli-meta-safety-mode select")).not.toBeNull();
    expect(control(root, ".cli-meta-writable")).toBeNull();
    expect(control(root, ".cli-meta-get-desc")).toBeNull();
    expect(control(root, ".cli-meta-set-desc")).toBeNull();
  });
});
