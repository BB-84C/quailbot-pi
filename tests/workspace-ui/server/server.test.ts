import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { QuailbotRuntime } from "../../../src/extension.js";
import { createKnowledgeRuntime } from "../../../src/knowledge/knowledge-runtime.js";
import { PlanContextStore } from "../../../src/prompt/plan-context.js";
import { ensureWorkspaceUiServer, stopWorkspaceUiServer, type WorkspaceUiServerHandle } from "../../../src/workspace-ui/server.js";
import { setProbeRunner, type ProbeRunner } from "../../../src/workspace-ui/server/cli-import.js";

const tempDirs: string[] = [];
const runtimes: QuailbotRuntime[] = [];

beforeAll(() => {
  runWorkspaceUiClientBuild();
});

afterEach(async () => {
  setProbeRunner(null);
  await Promise.all(runtimes.splice(0).map((runtime) => stopWorkspaceUiServer(runtime)));
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("integrated workspace UI server", () => {
  it("serves an HTML shell containing the runtime token meta tag", async () => {
    const { server } = await startServerWithWorkspace();

    const response = await fetch(`${server.url}/?token=${server.token}`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain(`<meta name="quailbot-workspace-ui-token" content="${server.token}">`);
    expect(html).toContain(`/assets/client.js?token=${encodeURIComponent(server.token)}`);
    expect(html).toContain(`/assets/styles.css?token=${encodeURIComponent(server.token)}`);
    expect(html).toContain("data-menu-root");
    expect(html).toContain("data-help-modal-root");
    expect(html).toContain("data-notice-modal-root");
    expect(html).not.toContain("Set agent workspace");
    expect(html).not.toContain("Use current workspace for agent");
  });

  it("serves the built browser bundle bytes from /assets/client.js", async () => {
    const { server } = await startServerWithWorkspace();
    const expected = readFileSync(join(process.cwd(), "dist", "workspace-ui", "client.js"));

    const response = await fetch(`${server.url}/assets/client.js?token=${server.token}`);
    const actual = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/javascript");
    expect(actual.equals(expected)).toBe(true);
  });

  it("serves responsive CSS that keeps the workspace panes reachable on narrow viewports", async () => {
    const { server } = await startServerWithWorkspace();

    const response = await fetch(`${server.url}/assets/styles.css?token=${server.token}`);
    const css = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/css");
    expect(css).toContain("@media (max-width: 1180px)");
    expect(css).toContain('"canvas"');
    expect(css).toContain('"items"');
    expect(css).toContain('"form"');
    expect(css).toContain("overflow: auto;");
  });

  it("serves file browser modal CSS so load/export opens as an overlay", async () => {
    const { server } = await startServerWithWorkspace();

    const response = await fetch(`${server.url}/assets/styles.css?token=${server.token}`);
    const css = await response.text();

    expect(response.status).toBe(200);
    expect(css).toContain(".file-browser-backdrop");
    expect(css).toContain(".file-browser-modal");
    expect(css).toContain("position: fixed;");
    expect(css).toContain("z-index: 1051;");
    expect(css).toContain(".file-browser-entries");
    expect(css).toContain('button[aria-selected="true"]');
  });

  it("serves notice dialog CSS for DOM-readable app-owned messages", async () => {
    const { server } = await startServerWithWorkspace();

    const response = await fetch(`${server.url}/assets/styles.css?token=${server.token}`);
    const css = await response.text();

    expect(response.status).toBe(200);
    expect(css).toContain(".notice-backdrop");
    expect(css).toContain(".notice-dialog");
    expect(css).toContain(".notice-dialog-message");
    expect(css).toContain("white-space: pre-wrap;");
    expect(css).toContain("z-index: 1200;");
  });

  it("serves an empty favicon response so browser smoke tests stay noise-free", async () => {
    const { server } = await startServerWithWorkspace();

    const response = await fetch(`${server.url}/favicon.ico`);

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  it("serves versioned capture assets by captureId after current metadata changes", async () => {
    const { cwd, server } = await startServerWithWorkspace();
    const stateDir = join(cwd, ".quailbot-pi");
    const oldId = "a1b2c3d4e5f60789";
    const oldBytes = Buffer.from("old capture bytes", "utf8");
    writeFileSync(join(stateDir, `workspace-capture.${oldId}.png`), oldBytes);
    writeFileSync(join(stateDir, "workspace-capture.png"), Buffer.from("current capture bytes", "utf8"));
    writeFileSync(join(stateDir, "workspace-capture.metadata.json"), `${JSON.stringify({ captureId: "0123456789abcdef" })}\n`, "utf8");

    const response = await fetch(`${server.url}/assets/workspace-capture?captureId=${oldId}&token=${server.token}`);
    const actual = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/png");
    expect(actual.equals(oldBytes)).toBe(true);
  });

  it("rejects API routes without the workspace UI token header", async () => {
    const { server } = await startServerWithWorkspace();

    for (const route of ["/api/workspace", "/api/capture", "/api/browse", "/api/load", "/api/save", "/api/cli-import"]) {
      const response = await fetch(`${server.url}${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      expect(response.status, route).toBe(403);
    }
  });

  it("rejects static assets without the query-string token", async () => {
    const { server } = await startServerWithWorkspace();

    const response = await fetch(`${server.url}/assets/client.js`);

    expect(response.status).toBe(403);
  });

  it("rejects the HTML shell without the query-string token", async () => {
    const { server } = await startServerWithWorkspace();

    const response = await fetch(`${server.url}/`);

    expect(response.status).toBe(403);
  });

  it("does not expose the dropped pending-activation API route", async () => {
    const { server } = await startServerWithWorkspace();

    const response = await postJson(server, "/api/request-activation", { targetPath: "workspace.json", expectedHash: "a".repeat(64) });
    const body = (await response.json()) as { ok: false; error: string };

    expect(response.status).toBe(404);
    expect(body).toEqual({ ok: false, error: "not found" });
  });

  it("does not expose the legacy raw write API route", async () => {
    const { server } = await startServerWithWorkspace();

    const response = await postJson(server, "/api/write", { workspaceJson: minimalWorkspace("nqctl"), targetPath: "workspace.json" });
    const body = (await response.json()) as { ok: false; error: string };

    expect(response.status).toBe(404);
    expect(body).toEqual({ ok: false, error: "not found" });
  });

  it("returns the first Tk-style validation message when saving an invalid workspace", async () => {
    const { server, workspacePath } = await startServerWithWorkspace("nqctl");
    const workspaceJson = minimalWorkspace("nqctl");
    workspaceJson.groups = [{ name: "current", active: true }];

    const response = await postJson(server, "/api/save", { path: workspacePath, workspaceJson, updateCurrent: true });
    const body = (await response.json()) as { ok: false; error: string; errors: Array<{ code: string; message: string }> };

    expect(response.status).toBe(422);
    expect(body.error).toBe("Duplicate name: 'current'");
    expect(body.errors[0]).toMatchObject({ code: "duplicate_name", message: "Duplicate name: 'current'" });
  });

  it("returns a 4xx response for invalid JSON request bodies", async () => {
    const { server } = await startServerWithWorkspace();

    for (const route of ["/api/workspace", "/api/capture", "/api/browse", "/api/load", "/api/save", "/api/cli-import"]) {
      const response = await fetch(`${server.url}${route}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-quailbot-workspace-ui-token": server.token },
        body: "{not-json",
      });
      expect(response.status, route).toBeGreaterThanOrEqual(400);
      expect(response.status, route).toBeLessThan(500);
    }
  });

  it("rejects DNS-rebound Host headers", async () => {
    const { server } = await startServerWithWorkspace();

    const response = await getWithHost(server.url, "evil.com:1234");

    expect(response.status).toBe(403);
    expect(response.body).toContain("forbidden host");
  });

  it("returns canonical workspace JSON for the active workspace", async () => {
    const { server, workspacePath } = await startServerWithWorkspace("nqctl");

    const response = await postJson(server, "/api/workspace", {});
    const body = (await response.json()) as {
      ok: true;
      workspaceJson: { rois: Array<{ name: string; x: number; y: number; w: number; h: number }>; cli_params: { cli_name: string } };
      canonicalJson: { anchors: Array<{ name: string; x: number; y: number }> };
      summary: { path: string; hash: string };
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.summary.path).toBe(workspacePath);
    expect(body.summary.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(body.workspaceJson.rois[0]).toMatchObject({ name: "current", x: 120, y: 80, w: 240, h: 160 });
    expect(body.workspaceJson.cli_params.cli_name).toBe("nqctl");
    expect(body.canonicalJson.anchors[0]).toMatchObject({ name: "bias-field", x: 520, y: 300 });
  });

  it("allows CLI import when the request body declares a valid CLI absent from runtime workspace", async () => {
    const runner = vi.fn<ProbeRunner>().mockReturnValue({ status: 0, stdout: '{"ok":true}', stderr: "" });
    setProbeRunner(runner);
    const { server } = await startServerWithWorkspace("runtimectl");

    const response = await postJson(server, "/api/cli-import", { cliName: "draftctl", declaredCliNames: ["draftctl"] });

    expect(response.status).toBe(200);
    expect(runner).toHaveBeenCalledWith("draftctl", ["capabilities"], expect.any(Object));
  });

  it("drops malformed body-declared CLI names but keeps valid ones", async () => {
    const runner = vi.fn<ProbeRunner>().mockReturnValue({ status: 0, stdout: '{"ok":true}', stderr: "" });
    setProbeRunner(runner);
    const { server } = await startServerWithWorkspace("runtimectl");

    const valid = await postJson(server, "/api/cli-import", { cliName: "draftctl", declaredCliNames: ["bad name", "../bad", "draftctl"] });
    const malformed = await postJson(server, "/api/cli-import", { cliName: "bad name", declaredCliNames: ["bad name", "draftctl"] });

    expect(valid.status).toBe(200);
    expect(runner).toHaveBeenCalledWith("draftctl", ["capabilities"], expect.any(Object));
    expect(malformed.status).toBe(400);
  });

  it("deduplicates runtime and body-declared CLI names", async () => {
    const runner = vi.fn<ProbeRunner>().mockReturnValue({ status: 0, stdout: '{"ok":true}', stderr: "" });
    setProbeRunner(runner);
    const { server } = await startServerWithWorkspace("nqctl");

    const response = await postJson(server, "/api/cli-import", { cliName: "nqctl", declaredCliNames: ["nqctl", "nqctl"] });

    expect(response.status).toBe(200);
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it("is closeable through stopWorkspaceUiServer", async () => {
    const { runtime, server } = await startServerWithWorkspace();
    await stopWorkspaceUiServer(runtime);

    await expect(fetch(`${server.url}/?token=${server.token}`)).rejects.toThrow();
    expect(runtime.workspaceUiServer).toBeUndefined();
  });

  it.skipIf(process.platform !== "win32")("captures the physical Windows virtual screen through /api/capture", async () => {
    const { cwd, server } = await startServerWithWorkspace();

    const response = await postJson(server, "/api/capture", {});
    const body = (await response.json()) as { ok: true; frame: { imageWidth: number; imageHeight: number; originX: number; originY: number; captureId: string }; pngPath: string };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.pngPath).toBe(join(cwd, ".quailbot-pi", "workspace-capture.png"));
    expect(body.frame.imageWidth).toBeGreaterThan(0);
    expect(body.frame.imageHeight).toBeGreaterThan(0);
    expect(body.frame.captureId).toMatch(/^[a-f0-9]{16}$/);
    expect(readFileSync(body.pngPath).subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  });
});

async function postJson(server: WorkspaceUiServerHandle, route: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`${server.url}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-quailbot-workspace-ui-token": server.token },
    body: JSON.stringify(body),
  });
}

async function startServerWithWorkspace(cliName = "nqctl"): Promise<{ cwd: string; runtime: QuailbotRuntime; server: WorkspaceUiServerHandle; workspacePath: string }> {
  const cwd = makeTempDir();
  const workspacePath = join(cwd, ".quailbot-pi", "workspace.json");
  mkdirSync(join(cwd, ".quailbot-pi"), { recursive: true });
  writeFileSync(workspacePath, `${JSON.stringify(minimalWorkspace(cliName), null, 2)}\n`, "utf8");
  const runtime: QuailbotRuntime = { planStore: new PlanContextStore(), knowledge: createKnowledgeRuntime() };
  runtimes.push(runtime);
  const server = await ensureWorkspaceUiServer(runtime, cwd);
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
      parameters: { items: [{ name: "bias_v", readable: true, writable: true, set_cmd: { command: "set" } }] },
      action_commands: { items: [{ name: "Approach", action_cmd: { command: "approach" } }] },
    },
  };
}

function runWorkspaceUiClientBuild(): void {
  if (process.platform === "win32") {
    execFileSync("cmd.exe", ["/d", "/s", "/c", "npm run build:workspace-ui-client"], { cwd: process.cwd(), stdio: "pipe" });
    return;
  }
  execFileSync("npm", ["run", "build:workspace-ui-client"], { cwd: process.cwd(), stdio: "pipe" });
}

async function getWithHost(baseUrl: string, host: string): Promise<{ status: number; body: string }> {
  const url = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { hostname: url.hostname, port: url.port, path: "/", method: "GET", headers: { Host: host } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}
