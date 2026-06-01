import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveLinkedObservables } from "../../src/linked-observables/resolve-linked-observables.js";
import { loadWorkspace } from "../../src/workspace/load-workspace.js";
import type { Workspace } from "../../src/workspace/types.js";

describe("resolveLinkedObservables", () => {
  it("resolves a CLI set mutation to self readback plus workspace-linked CLI observables", () => {
    const workspace = fixtureWorkspace();

    const resolved = resolveLinkedObservables(workspace, {
      kind: "cli_set",
      cli_name: "nqctl",
      parameter: "zctrl_setpnt",
    });

    expect(resolved).toEqual({
      cli: ["nqctl:zctrl_setpnt", "nqctl:current"],
      roi: [],
      unresolved: [],
    });
  });

  it("preserves unresolved CLI action linked observables instead of silently dropping them", () => {
    const workspace = fixtureWorkspace();

    const resolved = resolveLinkedObservables(workspace, {
      kind: "cli_action",
      cli_name: "nqctl",
      action_name: "Scan_Action",
    });

    expect(resolved).toEqual({
      cli: [],
      roi: [],
      unresolved: ["scan_status", "scan_buffer", "scan_speed"],
    });
  });

  it("classifies explicit linked observables and resolves active ROI names", () => {
    const workspace = fixtureWorkspace();
    workspace.rois.push({
      ref: "roi:scan-window",
      name: "scan_window",
      active: true,
      linkedObservables: [],
      schema: {},
    });
    workspace.rois.push({
      ref: "roi:inactive",
      name: "dark_roi",
      active: false,
      linkedObservables: [],
      schema: {},
    });

    const resolved = resolveLinkedObservables(workspace, {
      kind: "cli_set",
      cli_name: "nqctl",
      parameter: "zctrl_setpnt",
      linked_observables: ["scan_window", "nqctl:current", "dark_roi", "unknown_signal"],
    });

    expect(resolved).toEqual({
      cli: ["nqctl:current", "nqctl:zctrl_setpnt"],
      roi: ["roi:scan-window"],
      unresolved: ["dark_roi", "unknown_signal"],
    });
  });

  it("emits both ROI and CLI channels when an observable name collides", () => {
    const workspace = fixtureWorkspace();
    workspace.rois.push({
      ref: "current",
      name: "current",
      active: true,
      linkedObservables: [],
      schema: {},
    });

    const resolved = resolveLinkedObservables(workspace, {
      kind: "click_anchor",
      linked_observables: ["current"],
    });

    expect(resolved).toEqual({
      cli: ["nqctl:current"],
      roi: ["current"],
      unresolved: [],
    });
  });

  it("normalizes driver-qualified CLI set targets for self-readback and parameter lookup", () => {
    const workspace = fixtureWorkspace();

    const resolved = resolveLinkedObservables(workspace, {
      kind: "cli_set",
      cli_name: "nqctl",
      parameter: "nqctl:zctrl_setpnt",
    });

    expect(resolved).toEqual({
      cli: ["nqctl:zctrl_setpnt", "nqctl:current"],
      roi: [],
      unresolved: [],
    });
  });

  it("normalizes driver-qualified CLI action targets for action lookup", () => {
    const workspace = fixtureWorkspace();

    const resolved = resolveLinkedObservables(workspace, {
      kind: "cli_action",
      cli_name: "nqctl",
      action_name: "nqctl:Scan_Action",
    });

    expect(resolved).toEqual({
      cli: [],
      roi: [],
      unresolved: ["scan_status", "scan_buffer", "scan_speed"],
    });
  });
});

function fixtureWorkspace(): Workspace {
  return loadWorkspace(join(process.cwd(), "tests/workspaces/nanonis-minimal.workspace.json"));
}
