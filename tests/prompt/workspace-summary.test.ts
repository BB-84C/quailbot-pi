import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import quailbotExtension from "../../src/extension.js";
import { buildWorkspaceContextText, buildWorkspaceSummary } from "../../src/prompt/workspace-summary.js";
import { loadWorkspace } from "../../src/workspace/load-workspace.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("workspace prompt summary", () => {
  it("summarizes enabled CLI affordances for the active workspace", () => {
    const workspace = loadWorkspace(join(process.cwd(), "tests/workspaces/nanonis-minimal.workspace.json"));

    const summary = buildWorkspaceSummary(workspace);

    expect(summary.cli.enabledParameters).toContainEqual(
      expect.objectContaining({
        name: "current",
        cli_name: "nqctl",
        ref: "nqctl:current",
      }),
    );
    expect(summary.cli.enabledActions).toContainEqual(
      expect.objectContaining({
        name: "Scan_Action",
        cli_name: "nqctl",
        linked_observables: ["scan_status", "scan_buffer", "scan_speed"],
      }),
    );
    expect(summary.cli.actionsAvailable.cli_get).toBe(true);
    expect(summary.cli.actionsAvailable.cli_set).toBe(true);

    const contextText = buildWorkspaceContextText(workspace);
    const contextSummary = JSON.parse(contextText.replace("WORKSPACE (Quailbot active workspace)\n", "")) as ReturnType<
      typeof buildWorkspaceSummary
    >;

    expect(contextText).toContain("WORKSPACE (Quailbot active workspace)");
    expect(contextText).toContain("nqctl:zctrl_setpnt");
    expect(contextText).toContain("linked_observables");
    expect(contextSummary.cli.actionsAvailable).toEqual({
      cli_get: true,
      cli_set: true,
      cli_ramp: false,
      cli_action: true,
    });
  });

  it("injects hidden quailbot context before agent start when a workspace is loaded", async () => {
    const cwd = makeTempDir();
    const workspaceDir = join(cwd, ".quailbot-pi");
    mkdirSync(workspaceDir, { recursive: true });
    copyFileSync(join(process.cwd(), "tests/workspaces/nanonis-minimal.workspace.json"), join(workspaceDir, "workspace.json"));
    const handlers = new Map<string, Handler>();

    quailbotExtension({
      on: (event: string, handler: Handler) => {
        handlers.set(event, handler);
      },
    } as never);

    await handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, { cwd, hasUI: false });
    const result = await handlers.get("before_agent_start")?.(
      { type: "before_agent_start", prompt: "", systemPrompt: "", systemPromptOptions: {} },
      { cwd, hasUI: false },
    );

    expect(result).toEqual({
      message: expect.objectContaining({
        customType: "quailbot-context",
        display: false,
        content: expect.stringContaining("WORKSPACE (Quailbot active workspace)"),
      }),
    });
  });
});

type Handler = (event: unknown, ctx: { cwd: string; hasUI: boolean }) => unknown | Promise<unknown>;

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "quailbot-context-"));
  tempDirs.push(dir);
  return dir;
}
