import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { QuailbotRuntime } from "../../src/extension.js";
import { PlanContextStore } from "../../src/prompt/plan-context.js";
import { startWorkspaceUiServer, type WorkspaceUiServer } from "../../src/workspace-ui/server.js";

const tempDirs: string[] = [];
const servers: WorkspaceUiServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("workspace UI server", () => {
  it("serves the workspace calibrator page from GET /", async () => {
    const { server } = await startServerWithWorkspace();

    const response = await fetch(`${server.url}/`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Quailbot Workspace Calibrator");
  });

  it("returns the active workspace summary and editable workspace JSON from GET /api/workspace with the server token", async () => {
    const { server, workspacePath } = await startServerWithWorkspace("nqctl");

    const response = await fetch(`${server.url}/api/workspace?token=${server.token}`);
    const body = (await response.json()) as {
      ok: true;
      summary: { path: string; hash: string; cli: { default_cli_name: string } };
      workspaceJson: {
        groups: Array<{ name: string }>;
        rois: Array<{ name: string; x: number; y: number; w: number; h: number }>;
        anchors: Array<{ name: string; x: number; y: number }>;
        cli_params: { action_commands: { items: Array<{ name: string }> } };
      };
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.summary.path).toBe(workspacePath);
    expect(body.summary.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(body.summary.cli.default_cli_name).toBe("nqctl");
    expect(body.workspaceJson.groups.map((group) => group.name)).toEqual(["spectroscopy"]);
    expect(body.workspaceJson.rois[0]).toMatchObject({ name: "current", x: 120, y: 80, w: 240, h: 160 });
    expect(body.workspaceJson.anchors[0]).toMatchObject({ name: "bias-field", x: 520, y: 300 });
    expect(body.workspaceJson.cli_params.action_commands.items.map((action) => action.name)).toEqual(["Approach"]);
  });

  it("rejects validation requests that omit the query token", async () => {
    const { server } = await startServerWithWorkspace();

    const response = await fetch(`${server.url}/api/validate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceJson: minimalWorkspace("qctl") }),
    });

    expect(response.status).toBe(403);
  });

  it("writes raw workspace JSON through A2 from POST /api/write with query and header tokens", async () => {
    const { cwd, server } = await startServerWithWorkspace("nqctl");
    const targetPath = join(cwd, ".quailbot-pi", "written.workspace.json");

    const response = await fetch(`${server.url}/api/write?token=${server.token}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-quailbot-workspace-ui-token": server.token,
      },
      body: JSON.stringify({ workspaceJson: minimalWorkspace("writectl"), targetPath }),
    });
    const body = (await response.json()) as { ok: true; summary: { hash: string; cli: { default_cli_name: string } } };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.summary.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(body.summary.cli.default_cli_name).toBe("writectl");
    expect(JSON.parse(readFileSync(targetPath, "utf8")) as unknown).toEqual(minimalWorkspace("writectl"));
  });

  it("stages pending workspace activation without reloading from POST /api/request-activation", async () => {
    const { runtime, server } = await startServerWithWorkspace("nqctl");
    const targetPath = "candidate.workspace.json";
    const expectedHash = "a".repeat(64);

    const response = await fetch(`${server.url}/api/request-activation?token=${server.token}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-quailbot-workspace-ui-token": server.token,
      },
      body: JSON.stringify({ targetPath, expectedHash }),
    });
    const body = (await response.json()) as { ok: true; pendingWorkspaceActivation: { targetPath: string; expectedHash: string } };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.pendingWorkspaceActivation).toEqual({ targetPath, expectedHash });
    expect(runtime.pendingWorkspaceActivation).toEqual({ targetPath, expectedHash });
  });
});

async function startServerWithWorkspace(cliName = "nqctl"): Promise<{
  cwd: string;
  runtime: QuailbotRuntime;
  server: WorkspaceUiServer;
  workspacePath: string;
}> {
  const cwd = makeTempDir();
  const workspacePath = join(cwd, ".quailbot-pi", "workspace.json");
  mkdirSync(join(cwd, ".quailbot-pi"), { recursive: true });
  writeFileSync(workspacePath, `${JSON.stringify(minimalWorkspace(cliName), null, 2)}\n`, "utf8");
  const runtime: QuailbotRuntime = { planStore: new PlanContextStore() };
  const server = await startWorkspaceUiServer({ cwd, runtime });
  servers.push(server);
  return { cwd, runtime, server, workspacePath };
}

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "quailbot-workspace-ui-server-"));
  tempDirs.push(dir);
  return dir;
}

function minimalWorkspace(cliName: string): Record<string, unknown> {
  return {
    groups: [{ name: "spectroscopy", active: true }],
    rois: [{ name: "current", group: "spectroscopy", active: true, x: 120, y: 80, w: 240, h: 160 }],
    anchors: [{ name: "bias-field", group: "spectroscopy", active: true, linked_ROIs: ["current"], x: 520, y: 300 }],
    cli_params: {
      cli_name: cliName,
      enabled: true,
      parameters: {
        items: [{ name: "bias_v", readable: true, writable: true, set_cmd: { command: "set" } }],
      },
      action_commands: { items: [{ name: "Approach", action_cmd: { command: "approach" } }] },
    },
  };
}
