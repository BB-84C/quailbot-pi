import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { JSDOM } from "jsdom";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  effectiveScale as directEffectiveScale,
  screenToCanvas as directScreenToCanvas,
} from "../../../src/workspace-ui/shared/geometry.js";

type WorkspaceUiWindow = Window & {
  __quailbotWorkspaceUiReady?: boolean;
  __quailbotShared?: {
    effectiveScale: typeof directEffectiveScale;
    screenToCanvas: typeof directScreenToCanvas;
  };
};

const bundlePath = join(process.cwd(), "dist", "workspace-ui", "client.js");
const metaPath = join(process.cwd(), "dist", "workspace-ui", "client.meta.json");

describe("workspace UI browser bundle", () => {
  beforeAll(() => {
    runWorkspaceUiClientBuild();
  });

  it("includes shared geometry in the esbuild metafile inputs", () => {
    const metafile = JSON.parse(readFileSync(metaPath, "utf8")) as { inputs: Record<string, unknown> };
    const inputs = Object.keys(metafile.inputs).map(normalizePath);

    expect(inputs).toContain("src/workspace-ui/shared/geometry.ts");
  });

  it("executes the built bundle and exposes shared geometry functions from the bundle path", () => {
    const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { runScripts: "dangerously" });
    const script = dom.window.document.createElement("script");
    script.text = readFileSync(bundlePath, "utf8");
    dom.window.document.head.appendChild(script);

    dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
    const bundledWindow = dom.window as unknown as WorkspaceUiWindow;

    expect(bundledWindow.__quailbotWorkspaceUiReady).toBe(true);
    expect(typeof bundledWindow.__quailbotShared?.effectiveScale).toBe("function");

    const frame = { imageWidth: 1000, imageHeight: 1000, originX: 0, originY: 0, captureId: "bundle-test" };
    const viewport = { width: 500, height: 500, zoom: 1 };

    expect(bundledWindow.__quailbotShared?.effectiveScale(frame, viewport)).toBe(directEffectiveScale(frame, viewport));
  });

  it("bootstraps by POSTing workspace and capture data on DOMContentLoaded", async () => {
    const dom = new JSDOM(
      '<!doctype html><html><head><meta name="quailbot-workspace-ui-token" content="bundle-token"></head><body><main data-workspace-ui-root><section data-canvas-root></section><section data-items-tree-root></section><section data-filter-root></section><section data-form-root></section></main></body></html>',
      { runScripts: "dangerously", url: "http://127.0.0.1:3000/?token=bundle-token" },
    );
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/workspace") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              ok: true,
              canonicalJson: { rois: [{ name: "startup-roi", x: 1, y: 2, w: 3, h: 4, description: "loaded", active: true }], anchors: [], groups: [] },
              summary: { path: "D:\\quailbot\\workspaces\\startup.json", hash: "abc123" },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({ ok: true, frame: { imageWidth: 100, imageHeight: 50, originX: 0, originY: 0, captureId: "startup-capture" } }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    });
    Object.defineProperty(dom.window, "fetch", { value: fetchMock, configurable: true });
    const script = dom.window.document.createElement("script");
    script.text = readFileSync(bundlePath, "utf8");
    dom.window.document.head.appendChild(script);

    dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));

    await vi.waitFor(() => expect(dom.window.document.body.textContent).toContain("startup-roi"));
    expect(dom.window.document.title).toBe("Workspace Calibrator - startup.json - idle");
    expect(fetchMock).toHaveBeenCalledWith("/api/workspace", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "x-quailbot-workspace-ui-token": "bundle-token" }) }));
    expect(fetchMock).toHaveBeenCalledWith("/api/capture", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "x-quailbot-workspace-ui-token": "bundle-token" }) }));
    expect(dom.window.document.querySelector('.canvas-image[href*="startup-capture"]')).toBeTruthy();
  });

  it("bootstraps immediately when the bundle loads after DOMContentLoaded", async () => {
    const dom = new JSDOM(
      '<!doctype html><html><head><meta name="quailbot-workspace-ui-token" content="late-token"></head><body><main data-workspace-ui-root><section data-canvas-root></section><section data-items-tree-root></section><section data-filter-root></section><section data-workspace-toolbar-root></section><section data-form-root></section></main></body></html>',
      { runScripts: "dangerously", url: "http://127.0.0.1:3000/?token=late-token" },
    );
    Object.defineProperty(dom.window.document, "readyState", { value: "complete", configurable: true });
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/workspace") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              ok: true,
              canonicalJson: { rois: [], anchors: [], groups: [], cli_params: { cli_name: "latectl", enabled: true, parameters: { items: [{ name: "late-param", enabled: true }] } } },
              summary: { path: "workspace.json", hash: "latehash" },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ ok: false, error: "capture unavailable in test" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    });
    Object.defineProperty(dom.window, "fetch", { value: fetchMock, configurable: true });

    const script = dom.window.document.createElement("script");
    script.text = readFileSync(bundlePath, "utf8");
    dom.window.document.head.appendChild(script);

    await vi.waitFor(() => expect(dom.window.document.body.textContent).toContain("late-param"));
    expect((dom.window as unknown as WorkspaceUiWindow).__quailbotWorkspaceUiReady).toBe(true);
    expect(dom.window.document.querySelector<HTMLElement>("[data-workspace-ui-root]")?.dataset.workspaceUiReady).toBe("true");
    expect(fetchMock).toHaveBeenCalledWith("/api/workspace", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "x-quailbot-workspace-ui-token": "late-token" }) }));
  });
});

function normalizePath(input: string): string {
  return relative(process.cwd(), join(process.cwd(), input)).split(sep).join("/");
}

function runWorkspaceUiClientBuild(): void {
  if (process.platform === "win32") {
    execFileSync("cmd.exe", ["/d", "/s", "/c", "npm run build:workspace-ui-client"], { cwd: process.cwd(), stdio: "pipe" });
    return;
  }

  execFileSync("npm", ["run", "build:workspace-ui-client"], { cwd: process.cwd(), stdio: "pipe" });
}
