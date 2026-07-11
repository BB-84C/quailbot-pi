import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readLinkedObservablesWithContent } from "../../src/linked-observables/read-linked-observables.js";
import type { RunCli } from "../../src/cli/cli-driver.js";
import { createToolContext } from "../../src/tools/tool-context.js";
import { loadWorkspace } from "../../src/workspace/load-workspace.js";

describe("CLI linked-observable image readback", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "quailbot-linked-observable-image-"));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it("attaches an image content part from a CLI readback payload while retaining the payload metadata", async () => {
    const imagePath = join(cwd, "topograph.png");
    const imageBytes = Buffer.from("linked-observable-image");
    writeFileSync(imagePath, imageBytes);
    const ctx = contextForPayload({ image_path: imagePath, mime_type: "image/png", scan_id: "scan-42" });

    const result = await readLinkedObservablesWithContent(ctx, { cli: ["nqctl:last_scan"], roi: [], unresolved: [] });

    expect(result.content).toEqual([{ type: "image", data: imageBytes.toString("base64"), mimeType: "image/png" }]);
    expect(result.observation.channels.cli.results["nqctl:last_scan"]?.payload).toEqual({
      image_path: imagePath,
      mime_type: "image/png",
      scan_id: "scan-42",
    });
  });

  it("keeps image metadata but warns instead of attaching an image for models without image support", async () => {
    const imagePath = join(cwd, "topograph.png");
    writeFileSync(imagePath, Buffer.from("linked-observable-image"));
    const ctx = contextForPayload({ image_path: imagePath, mime_type: "image/png" }, false);

    const result = await readLinkedObservablesWithContent(ctx, { cli: ["nqctl:last_scan"], roi: [], unresolved: [] });

    expect(result.content).toEqual([]);
    expect(result.observation.channels.cli.results["nqctl:last_scan"]).toMatchObject({
      payload: { image_path: imagePath, mime_type: "image/png" },
      warning: "ROI screenshots were captured, but the current model does not accept image input; continuing with ROI metadata only.",
    });
  });

  it("records a warning and preserves the CLI readback when its image file is missing", async () => {
    const imagePath = join(cwd, "missing.png");
    const ctx = contextForPayload({ image_path: imagePath, mime_type: "image/png" });

    const result = await readLinkedObservablesWithContent(ctx, { cli: ["nqctl:last_scan"], roi: [], unresolved: [] });

    expect(result.content).toEqual([]);
    expect(result.observation.channels.cli.results["nqctl:last_scan"]).toMatchObject({
      ok: true,
      payload: { image_path: imagePath, mime_type: "image/png" },
      warning: expect.stringContaining(`linked observable image readback failed for ${imagePath}:`),
    });
  });

  it("leaves plain JSON CLI readbacks unchanged", async () => {
    const payload = { current: 1.2, unit: "nA" };
    const ctx = contextForPayload(payload);

    const result = await readLinkedObservablesWithContent(ctx, { cli: ["nqctl:current"], roi: [], unresolved: [] });

    expect(result.content).toEqual([]);
    expect(result.observation.channels.cli.results["nqctl:current"]).toEqual({
      ok: true,
      exit_code: 0,
      stdout: JSON.stringify(payload),
      stderr: "",
      payload,
      argv: ["nqctl", "get", "current"],
    });
  });
});

function contextForPayload(payload: unknown, modelSupportsImages = true) {
  const runCli = vi.fn<RunCli>().mockImplementation(async (cliName, args) => ({
    ok: true,
    exitCode: 0,
    stdout: JSON.stringify(payload),
    stderr: "",
    payload,
    argv: [cliName, ...args],
  }));
  return createToolContext({
    workspace: loadWorkspace(join(process.cwd(), "tests/workspaces/nanonis-minimal.workspace.json")),
    runCli,
    modelSupportsImages,
  });
}
