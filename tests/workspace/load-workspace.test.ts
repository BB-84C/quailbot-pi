import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadWorkspace } from "../../src/workspace/load-workspace.js";
import {
  loadLastWorkspace,
  resolveWorkspaceSelection,
  saveLastWorkspace,
  starterWorkspacePath,
} from "../../src/workspace/workspace-state.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("loadWorkspace", () => {
  it("loads a real workspace JSON path through the product resolver", () => {
    const workspacePath = join(process.cwd(), "tests/workspaces/nanonis-minimal.workspace.json");

    const workspace = loadWorkspace(workspacePath);

    expect(workspace.sourcePath).toBe(workspacePath);
    expect(workspace.cli.enabled).toBe(true);
    expect(workspace.cli.defaultCliName).toBe("nqctl");
    expect(workspace.cli.parameters.get("nqctl:zctrl_setpnt")?.linkedObservables).toEqual(["current"]);
    expect(workspace.cli.actions.get("nqctl:Scan_Action")?.linkedObservables).toEqual([
      "scan_status",
      "scan_buffer",
      "scan_speed",
    ]);
    expect(workspace.cli.actions.get("nqctl:Scan_Action")?.safetyMode).toBe("guarded");
    expect(workspace.cli.actions.get("nqctl:Scan_Action")?.actionCmd).toEqual({
      command: "Scan_Action",
      arg_fields: [{ name: "action", required: true }],
    });
  });

  it.skipIf(!existsSync("D:/quailbot/workspaces/workspace.json"))(
    "loads the authoritative D:/quailbot Tk workspace schema without drift",
    () => {
      const workspace = loadWorkspace("D:/quailbot/workspaces/workspace.json");

      expect(workspace.sourcePath).toBe("D:\\quailbot\\workspaces\\workspace.json");
      expect(workspace.cli.parameters.size).toBeGreaterThan(300);
      expect(workspace.cli.actions.size).toBeGreaterThan(100);
    },
  );

  it("throws when the workspace path does not exist", () => {
    expect(() => loadWorkspace(join(process.cwd(), "tests/workspaces/missing.workspace.json"))).toThrow(
      /workspace file does not exist/,
    );
  });

  it("normalizes relative workspace paths into absolute source paths", () => {
    const workspace = loadWorkspace("tests/workspaces/nanonis-minimal.workspace.json");

    expect(workspace.sourcePath).toBe(join(process.cwd(), "tests/workspaces/nanonis-minimal.workspace.json"));
  });

  it("disables CLI parsing when cli_params is absent", () => {
    const workspace = loadWorkspace(writeWorkspace({ rois: [], anchors: [] }));

    expect(workspace.cli.enabled).toBe(false);
    expect(workspace.cli.parameters.size).toBe(0);
    expect(workspace.cli.actions.size).toBe(0);
  });

  it("loads legacy tools.cli workspaces when cli_params is absent", () => {
    const workspace = loadWorkspace(
      writeWorkspace({
        tools: {
          cli: {
            enabled: true,
            cli_name: "legacyctl",
            parameters: {
              bias: {
                enabled: false,
                description: "Bias voltage",
                actions: { get: true, set: false, ramp: false },
                linked_observables: ["current"],
              },
            },
            actions: {
              Approach: {
                enabled: true,
                description: "Approach tip",
                action_cmd: { command: "Approach" },
                linked_ROIs: ["current"],
              },
            },
          },
        },
      }),
    );

    expect(workspace.cli.enabled).toBe(true);
    expect(workspace.cli.defaultCliName).toBe("legacyctl");
    expect(workspace.cli.parameters.get("legacyctl:bias")).toMatchObject({
      name: "bias",
      enabled: false,
      description: "Bias voltage",
      linkedObservables: ["current"],
      actions: { get: true, set: false, ramp: false },
    });
    expect(workspace.cli.actions.get("legacyctl:Approach")).toMatchObject({
      name: "Approach",
      enabled: true,
      description: "Approach tip",
      linkedObservables: ["current"],
      actionCmd: { command: "Approach" },
    });
  });

  it("loads Tk dict-shaped cli_params parameters, action_commands, and actions", () => {
    const workspace = loadWorkspace(
      writeWorkspace({
        cli_params: {
          cli_name: "nqctl",
          enabled: false,
          parameters: {
            bias: { readable: true, linked_observables: ["current"] },
            Sweep: { action_cmd: { command: "Sweep" }, linked_ROIs: ["spectrum"] },
          },
          action_commands: {
            Approach: { action_cmd: { command: "Approach" } },
          },
          actions: {
            Stop: { action_cmd: { command: "Stop" }, enabled: true },
          },
        },
      }),
    );

    expect(workspace.cli.enabled).toBe(false);
    expect(workspace.cli.defaultCliName).toBe("nqctl");
    expect(workspace.cli.parameters.get("nqctl:bias")).toMatchObject({
      name: "bias",
      enabled: false,
      actions: { get: true, set: false, ramp: false },
      linkedObservables: ["current"],
    });
    expect(workspace.cli.actions.get("nqctl:Sweep")?.actionCmd).toEqual({ command: "Sweep" });
    expect(workspace.cli.actions.get("nqctl:Sweep")?.linkedObservables).toEqual(["spectrum"]);
    expect(workspace.cli.actions.get("nqctl:Approach")?.actionCmd).toEqual({ command: "Approach" });
    expect(workspace.cli.actions.get("nqctl:Stop")).toMatchObject({ enabled: true, actionCmd: { command: "Stop" } });
  });

  it("loads GUI-wrapped visual fields while preserving top-level cli_params", () => {
    const workspace = loadWorkspace(
      writeWorkspace({
        GUI: {
          rois: [{ name: "tunnel-current", active: true }],
          anchors: [{ name: "bias-knob", active: true }],
          groups: [{ name: "operator-panel" }],
        },
        cli_params: {
          cli_name: "qctl",
          parameters: { items: [{ name: "bias", readable: true }] },
          action_commands: { items: [{ name: "Approach", action_cmd: { command: "Approach" } }] },
        },
      }),
    );

    expect(workspace.rois.map((roi) => roi.name)).toEqual(["tunnel-current"]);
    expect(workspace.anchors.map((anchor) => anchor.name)).toEqual(["bias-knob"]);
    expect(workspace.cli.defaultCliName).toBe("qctl");
    expect(workspace.cli.parameters.has("qctl:bias")).toBe(true);
    expect(workspace.cli.actions.has("qctl:Approach")).toBe(true);
  });

  it("rejects malformed cli_params with a contextual error", () => {
    expect(() => loadWorkspace(writeWorkspace({ cli_params: [] }))).toThrow(/workspace cli_params must be an object/);
  });

  it("rejects visual ROI geometry with non-positive saved dimensions", () => {
    expect(() => loadWorkspace(writeWorkspace({ rois: [{ name: "bad", x: 0, y: 0, w: 0, h: 10 }] }))).toThrow(
      /ROI bad width and height must be positive/,
    );
    expect(() => loadWorkspace(writeWorkspace({ rois: [{ name: "bad", x: 0, y: 0, w: 10, h: -1 }] }))).toThrow(
      /ROI bad width and height must be positive/,
    );
  });

  it("derives parameter action permissions conservatively unless explicit actions are present", () => {
    const workspace = loadWorkspace(
      writeWorkspace({
        cli_params: {
          cli_name: "nqctl",
          parameters: {
            items: [
              { name: "readable_only", readable: true, writable: false },
              { name: "writable_without_set_cmd", readable: false, writable: true },
              { name: "writable_with_set_cmd", readable: false, writable: true, set_cmd: { command: "Set" } },
              {
                name: "ramp_blocked",
                writable: true,
                has_ramp: true,
                safety: { ramp_enabled: false },
                set_cmd: { command: "Set" },
              },
              {
                name: "ramp_enabled",
                writable: true,
                has_ramp: true,
                safety: { ramp_enabled: true },
                set_cmd: { command: "Set" },
              },
              { name: "explicit", actions: { get: true, set: true, ramp: true } },
            ],
          },
        },
      }),
    );

    expect(workspace.cli.parameters.get("nqctl:readable_only")?.actions).toEqual({ get: true, set: false, ramp: false });
    expect(workspace.cli.parameters.get("nqctl:writable_without_set_cmd")?.actions).toEqual({
      get: false,
      set: false,
      ramp: false,
    });
    expect(workspace.cli.parameters.get("nqctl:writable_with_set_cmd")?.actions).toEqual({
      get: false,
      set: true,
      ramp: false,
    });
    expect(workspace.cli.parameters.get("nqctl:ramp_blocked")?.actions.ramp).toBe(false);
    expect(workspace.cli.parameters.get("nqctl:ramp_enabled")?.actions.ramp).toBe(true);
    expect(workspace.cli.parameters.get("nqctl:explicit")?.actions).toEqual({ get: true, set: true, ramp: true });
  });

  it("uses item-level CLI names for parameter and action refs", () => {
    const workspace = loadWorkspace(
      writeWorkspace({
        cli_params: {
          cli_name: "nqctl",
          parameters: { items: [{ name: "bias", cli_name: "qctl", readable: true }] },
          action_commands: { items: [{ name: "Approach", CLI_Name: "motion", action_cmd: { command: "Approach" } }] },
        },
      }),
    );

    expect(workspace.cli.defaultCliName).toBe("nqctl");
    expect(workspace.cli.parameters.has("qctl:bias")).toBe(true);
    expect(workspace.cli.parameters.has("nqctl:bias")).toBe(false);
    expect(workspace.cli.actions.has("motion:Approach")).toBe(true);
  });

  it("accepts legacy linked_ROIs as linked observables for parameters and actions", () => {
    const workspace = loadWorkspace(
      writeWorkspace({
        cli_params: {
          cli_name: "nqctl",
          parameters: { items: [{ name: "bias", readable: true, linked_ROIs: ["roi_a"] }] },
          action_commands: {
            items: [{ name: "Approach", linked_ROIs: ["roi_a", "roi_b"], action_cmd: { command: "Approach" } }],
          },
        },
      }),
    );

    expect(workspace.cli.parameters.get("nqctl:bias")?.linkedObservables).toEqual(["roi_a"]);
    expect(workspace.cli.actions.get("nqctl:Approach")?.linkedObservables).toEqual(["roi_a", "roi_b"]);
  });

  it("loads action safety modes including blocked metadata", () => {
    const workspace = loadWorkspace(
      writeWorkspace({
        cli_params: {
          cli_name: "nqctl",
          action_commands: {
            items: [
              { name: "Guarded", safety_mode: "guarded", action_cmd: { command: "Guarded" } },
              { name: "Blocked", safety_mode: "blocked", action_cmd: { command: "Blocked" } },
            ],
          },
        },
      }),
    );

    expect(workspace.cli.actions.get("nqctl:Guarded")?.safetyMode).toBe("guarded");
    expect(workspace.cli.actions.get("nqctl:Blocked")?.safetyMode).toBe("blocked");
    expect(workspace.cli.actions.get("nqctl:Blocked")?.actionCmd).toEqual({ command: "Blocked" });
  });

  it("rejects malformed action_cmd with a contextual error", () => {
    expect(() =>
      loadWorkspace(
        writeWorkspace({
          cli_params: {
            cli_name: "nqctl",
            action_commands: { items: [{ name: "BadAction", action_cmd: "BadAction" }] },
          },
        }),
      ),
    ).toThrow(/workspace action at cli_params\.action_commands\.items\[0\] action_cmd must be an object/);
  });

  it("rejects malformed parameter entries with contextual errors", () => {
    expect(() =>
      loadWorkspace(
        writeWorkspace({
          cli_params: { cli_name: "nqctl", parameters: { items: [{ readable: true }] } },
        }),
      ),
    ).toThrow(/workspace parameter at cli_params\.parameters\.items\[0\] is missing name/);
  });

  it("rejects malformed action entries with contextual errors", () => {
    expect(() =>
      loadWorkspace(
        writeWorkspace({
          cli_params: { cli_name: "nqctl", action_commands: { items: [{ action_cmd: { command: "Action" } }] } },
        }),
      ),
    ).toThrow(/workspace action at cli_params\.action_commands\.items\[0\] is missing name/);
  });
});

describe("workspace state", () => {
  it("uses the starter workspace path under the Quailbot state root", () => {
    const cwd = makeTempDir();

    expect(starterWorkspacePath(cwd)).toBe(join(cwd, ".quailbot-pi", "workspace.json"));
  });

  it("resolves explicit and saved relative workspace paths against the provided cwd", () => {
    const cwd = makeTempDir();

    expect(resolveWorkspaceSelection({ explicitPath: "workspace.json", cwd })).toEqual({
      path: join(cwd, "workspace.json"),
      source: "explicit",
    });

    saveLastWorkspace("saved.workspace.json", cwd);

    expect(loadLastWorkspace(cwd)).toBe(join(cwd, "saved.workspace.json"));
    expect(resolveWorkspaceSelection({ cwd })).toEqual({
      path: join(cwd, "saved.workspace.json"),
      source: "settings",
    });
  });
});

function writeWorkspace(workspace: unknown): string {
  const workspacePath = join(makeTempDir(), "workspace.json");
  writeFileSync(workspacePath, JSON.stringify(workspace), "utf8");
  return workspacePath;
}

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "quailbot-workspace-"));
  tempDirs.push(dir);
  return dir;
}
