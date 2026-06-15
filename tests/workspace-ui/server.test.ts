import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { QuailbotRuntime } from "../../src/extension.js";
import { PlanContextStore } from "../../src/prompt/plan-context.js";
import {
  isWorkspaceUiFetchBlockedPort,
  startWorkspaceUiServer,
  type WorkspaceUiServer,
} from "../../src/workspace-ui/server.js";

const tempDirs: string[] = [];
const servers: WorkspaceUiServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("workspace UI server", () => {
  it("identifies TCP ports that browser fetch refuses before binding the UI server", () => {
    expect(isWorkspaceUiFetchBlockedPort(6667)).toBe(true);
    expect(isWorkspaceUiFetchBlockedPort(4190)).toBe(true);
    expect(isWorkspaceUiFetchBlockedPort(10080)).toBe(true);
    expect(isWorkspaceUiFetchBlockedPort(49152)).toBe(false);
  });

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

  it("reports UI server health through an authenticated endpoint", async () => {
    const { server } = await startServerWithWorkspace("nqctl");

    const response = await fetch(`${server.url}/api/health?token=${server.token}`);
    const body = (await response.json()) as { ok: boolean; status: string };

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, status: "workspace-ui-alive" });
  });

  it("reports and serves a real workspace capture image when one exists beside the workspace", async () => {
    const { cwd, server } = await startServerWithWorkspace("nqctl");
    const capturePath = join(cwd, ".quailbot-pi", "workspace-capture.png");
    writeFileSync(capturePath, oneByOnePng(), "binary");

    const response = await fetch(`${server.url}/api/workspace?token=${server.token}`);
    const body = (await response.json()) as {
      ok: true;
      captureFrame: { href: string; imageWidth: number; imageHeight: number; originX: number; originY: number; contentType: string };
    };

    expect(response.status).toBe(200);
    expect(body.captureFrame).toEqual({
      href: `/assets/workspace-capture?token=${encodeURIComponent(server.token)}`,
      imageWidth: 1,
      imageHeight: 1,
      originX: 0,
      originY: 0,
      contentType: "image/png",
    });

    const imageResponse = await fetch(`${server.url}${body.captureFrame.href}`);
    const imageBytes = Buffer.from(await imageResponse.arrayBuffer());

    expect(imageResponse.status).toBe(200);
    expect(imageResponse.headers.get("content-type")).toBe("image/png");
    expect(imageBytes.subarray(0, 8)).toEqual(oneByOnePng().subarray(0, 8));
  });

  it("refreshes the workspace capture image through an authenticated screenshot route", async () => {
    const { cwd, server } = await startServerWithWorkspace("nqctl", async (workspaceCwd) => {
      expect(workspaceCwd).toBe(cwd);
      const capturePath = join(workspaceCwd, ".quailbot-pi", "workspace-capture.png");
      writeFileSync(capturePath, oneByOnePng(), "binary");
      return { path: capturePath, imageWidth: 1, imageHeight: 1, originX: -1920, originY: 120, contentType: "image/png" };
    });

    const response = await fetch(`${server.url}/api/capture?token=${server.token}`, {
      method: "POST",
      headers: { "x-quailbot-workspace-ui-token": server.token },
    });
    const body = (await response.json()) as {
      ok: true;
      captureFrame: { href: string; imageWidth: number; imageHeight: number; originX: number; originY: number; contentType: string };
    };

    expect(response.status).toBe(200);
    expect(body.captureFrame).toEqual({
      href: `/assets/workspace-capture?token=${encodeURIComponent(server.token)}`,
      imageWidth: 1,
      imageHeight: 1,
      originX: -1920,
      originY: 120,
      contentType: "image/png",
    });
  });

  it("preserves refreshed virtual-screen origin when the workspace is loaded again", async () => {
    const { cwd, server } = await startServerWithWorkspace("nqctl", async (workspaceCwd) => {
      expect(workspaceCwd).toBe(cwd);
      const capturePath = join(workspaceCwd, ".quailbot-pi", "workspace-capture.png");
      writeFileSync(capturePath, oneByOnePng(), "binary");
      return { path: capturePath, imageWidth: 1, imageHeight: 1, originX: -1920, originY: 120, contentType: "image/png" };
    });

    await fetch(`${server.url}/api/capture?token=${server.token}`, {
      method: "POST",
      headers: { "x-quailbot-workspace-ui-token": server.token },
    });

    const response = await fetch(`${server.url}/api/workspace?token=${server.token}`);
    const body = (await response.json()) as {
      ok: true;
      captureFrame: { href: string; imageWidth: number; imageHeight: number; originX: number; originY: number; contentType: string };
    };

    expect(response.status).toBe(200);
    expect(body.captureFrame).toEqual({
      href: `/assets/workspace-capture?token=${encodeURIComponent(server.token)}`,
      imageWidth: 1,
      imageHeight: 1,
      originX: -1920,
      originY: 120,
      contentType: "image/png",
    });
  });

  it("does not refresh runtime workspace state from GET /api/workspace", async () => {
    const { runtime, server } = await startServerWithWorkspace("nqctl");

    const response = await fetch(`${server.url}/api/workspace?token=${server.token}`);
    const body = (await response.json()) as { ok: true };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(runtime.activeWorkspace).toBeUndefined();
    expect(runtime.workspace).toBeUndefined();
  });

  it("rejects CLI capability import for names not declared by the draft workspace", async () => {
    const { server } = await startServerWithWorkspace("nqctl");

    const response = await fetch(`${server.url}/api/import-cli?token=${server.token}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-quailbot-workspace-ui-token": server.token,
      },
      body: JSON.stringify({ workspaceJson: minimalWorkspace("nqctl"), cliName: "definitely-not-a-real-cli" }),
    });
    const body = (await response.json()) as { ok: false; error: string };

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/declared by the workspace/i);
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

  it("rejects validation requests that omit the mutating header token", async () => {
    const { server } = await startServerWithWorkspace();

    const response = await fetch(`${server.url}/api/validate?token=${server.token}`, {
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

  it("rejects browser writes outside the active workspace or Quailbot state directory", async () => {
    const { cwd, server } = await startServerWithWorkspace("nqctl");
    const escapedTargetPath = join(dirname(cwd), "escaped.workspace.json");

    const response = await fetch(`${server.url}/api/write?token=${server.token}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-quailbot-workspace-ui-token": server.token,
      },
      body: JSON.stringify({ workspaceJson: minimalWorkspace("blockedctl"), targetPath: escapedTargetPath }),
    });
    const body = (await response.json()) as { ok: false; error: string };

    expect(response.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/outside the active workspace/);
  });

  it("rejects browser writes through symlinked Quailbot state-directory parents", async () => {
    const { cwd, server } = await startServerWithWorkspace("nqctl");
    const outsideDir = join(dirname(cwd), "outside-target");
    const linkDir = join(cwd, ".quailbot-pi", "linked-outside");
    mkdirSync(outsideDir, { recursive: true });
    symlinkSync(outsideDir, linkDir, "junction");

    const response = await fetch(`${server.url}/api/write?token=${server.token}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-quailbot-workspace-ui-token": server.token,
      },
      body: JSON.stringify({ workspaceJson: minimalWorkspace("blockedctl"), targetPath: join(linkDir, "escaped.workspace.json") }),
    });
    const body = (await response.json()) as { ok: false; error: string };

    expect(response.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/outside the active workspace/);
  });

  it("rejects pending activation requests outside the active workspace or Quailbot state directory", async () => {
    const { cwd, server } = await startServerWithWorkspace("nqctl");
    const escapedTargetPath = join(dirname(cwd), "escaped.workspace.json");

    const response = await fetch(`${server.url}/api/request-activation?token=${server.token}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-quailbot-workspace-ui-token": server.token,
      },
      body: JSON.stringify({ targetPath: escapedTargetPath, expectedHash: "a".repeat(64) }),
    });
    const body = (await response.json()) as { ok: false; error: string };

    expect(response.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/outside the active workspace/);
  });

  it("allows pending activation inside the Quailbot state directory before an active workspace exists", async () => {
    const { cwd, runtime, server } = await startServerWithoutWorkspace();
    const targetPath = join(cwd, ".quailbot-pi", "candidate.workspace.json");
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
    expect(runtime.pendingWorkspaceActivation).toEqual({ targetPath, expectedHash });
  });

  it("rejects pending activation outside the Quailbot state directory before an active workspace exists", async () => {
    const { cwd, server } = await startServerWithoutWorkspace();
    const targetPath = join(dirname(cwd), "escaped.workspace.json");

    const response = await fetch(`${server.url}/api/request-activation?token=${server.token}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-quailbot-workspace-ui-token": server.token,
      },
      body: JSON.stringify({ targetPath, expectedHash: "a".repeat(64) }),
    });
    const body = (await response.json()) as { ok: false; error: string };

    expect(response.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/outside the active workspace/);
  });

  it("stages pending workspace activation without reloading from POST /api/request-activation", async () => {
    const { cwd, runtime, server } = await startServerWithWorkspace("nqctl");
    const targetPath = join(cwd, ".quailbot-pi", "candidate.workspace.json");
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

  it("stores pending activation target paths as absolute paths after authorization", async () => {
    const { cwd, runtime, server } = await startServerWithWorkspace("nqctl");
    const relativeTargetPath = join(".quailbot-pi", "candidate.workspace.json");
    const absoluteTargetPath = join(cwd, relativeTargetPath);
    const expectedHash = "a".repeat(64);

    const response = await fetch(`${server.url}/api/request-activation?token=${server.token}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-quailbot-workspace-ui-token": server.token,
      },
      body: JSON.stringify({ targetPath: relativeTargetPath, expectedHash }),
    });
    const body = (await response.json()) as { ok: true; pendingWorkspaceActivation: { targetPath: string; expectedHash: string } };

    expect(response.status).toBe(200);
    expect(body.pendingWorkspaceActivation).toEqual({ targetPath: absoluteTargetPath, expectedHash });
    expect(runtime.pendingWorkspaceActivation).toEqual({ targetPath: absoluteTargetPath, expectedHash });
  });
});

async function startServerWithWorkspace(
  cliName = "nqctl",
  refreshCaptureFrame?: Parameters<typeof startWorkspaceUiServer>[0]["refreshCaptureFrame"],
): Promise<{
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
  const server = await startWorkspaceUiServer({ cwd, runtime, refreshCaptureFrame });
  servers.push(server);
  return { cwd, runtime, server, workspacePath };
}

async function startServerWithoutWorkspace(): Promise<{ cwd: string; runtime: QuailbotRuntime; server: WorkspaceUiServer }> {
  const cwd = makeTempDir();
  const runtime: QuailbotRuntime = { planStore: new PlanContextStore() };
  const server = await startWorkspaceUiServer({ cwd, runtime });
  servers.push(server);
  return { cwd, runtime, server };
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

function oneByOnePng(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64",
  );
}
