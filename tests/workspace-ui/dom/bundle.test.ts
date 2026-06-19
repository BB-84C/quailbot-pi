import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { JSDOM } from "jsdom";
import { beforeAll, describe, expect, it } from "vitest";

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
