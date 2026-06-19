import { describe, expect, it } from "vitest";

import { renderForm } from "../../../src/workspace-ui/client/render/form.js";
import { actionParam, control, readableOnly, stateWithCli, writableParam } from "./cli-meta-helpers.js";

function rendered(cli = readableOnly()): HTMLElement {
  const root = document.createElement("div");
  renderForm(root, stateWithCli(cli));
  return root;
}

describe("CLI metadata action vs parameter modes", () => {
  it("selecting a CLI action shows safety_mode with no parameter controls", () => {
    const root = rendered(actionParam("alwaysAllowed"));
    expect(root.querySelector(".form-header")?.textContent).toContain("CLI Action");
    expect(control(root, ".cli-meta-safety-mode select")).not.toBeNull();
    expect(control(root, ".cli-meta-writable")).toBeNull();
    expect(control(root, ".cli-meta-get-desc")).toBeNull();
    expect(control(root, ".cli-meta-set-desc")).toBeNull();
  });

  it("selecting a set_cmd CLI parameter shows writable but not safety_mode", () => {
    const root = rendered(writableParam());
    expect(root.querySelector(".form-header")?.textContent).toContain("CLI Parameter");
    expect(control(root, ".cli-meta-writable input")).not.toBeNull();
    expect(control(root, ".cli-meta-safety-mode")).toBeNull();
  });

  it("selecting a no-set_cmd CLI parameter shows neither writable nor set description", () => {
    const root = rendered(readableOnly());
    expect(control(root, ".cli-meta-writable")).toBeNull();
    expect(control(root, ".cli-meta-set-desc")).toBeNull();
  });
});
