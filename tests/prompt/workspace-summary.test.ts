import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import quailbotExtension from "../../src/extension.js";
import { buildWorkspaceContextText, buildWorkspaceSummary } from "../../src/prompt/workspace-summary.js";
import { MUTATION_POLICY_ENV_VAR, disabledMutationPolicy, enabledMutationPolicy } from "../../src/tools/mutation-policy.js";
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

    const summary = buildWorkspaceSummary(workspace, disabledMutationPolicy());

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
    expect(summary.mutation_policy).toEqual({
      mutating_tools_enabled: false,
      enable_env_var: MUTATION_POLICY_ENV_VAR,
      blocked_without_enable: ["cli_set", "cli_ramp", "cli_action", "click_anchor", "set_field"],
      allowed_without_enable: [
        "cli_get",
        "observe",
        "quailbot_planwrite",
        "quailbot_plan_and_execute (read-only plans only)",
      ],
    });

    const contextText = buildWorkspaceContextText(workspace, disabledMutationPolicy());
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

  it("renders enabled mutation policy in workspace context text", () => {
    const workspace = loadWorkspace(join(process.cwd(), "tests/workspaces/nanonis-minimal.workspace.json"));

    const contextText = buildWorkspaceContextText(workspace, enabledMutationPolicy());
    const contextSummary = JSON.parse(contextText.replace("WORKSPACE (Quailbot active workspace)\n", "")) as ReturnType<
      typeof buildWorkspaceSummary
    >;

    expect(contextText).toContain(MUTATION_POLICY_ENV_VAR);
    expect(contextSummary.mutation_policy).toEqual({
      mutating_tools_enabled: true,
      enable_env_var: MUTATION_POLICY_ENV_VAR,
      blocked_without_enable: ["cli_set", "cli_ramp", "cli_action", "click_anchor", "set_field"],
      allowed_without_enable: [
        "cli_get",
        "observe",
        "quailbot_planwrite",
        "quailbot_plan_and_execute (read-only plans only)",
      ],
    });
  });

  it("renders active workspace in the stable system prompt before agent start", async () => {
    const cwd = makeTempDir();
    const workspaceDir = join(cwd, ".quailbot-pi");
    mkdirSync(workspaceDir, { recursive: true });
    copyFileSync(join(process.cwd(), "tests/workspaces/nanonis-minimal.workspace.json"), join(workspaceDir, "workspace.json"));
    const handlers = new Map<string, Handler>();

    quailbotExtension({
      on: (event: string, handler: Handler) => {
        handlers.set(event, handler);
      },
      registerTool: () => undefined,
      registerCommand: () => undefined,
    } as never);

    await handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, { cwd, hasUI: false });
    const result = await handlers.get("before_agent_start")?.(
      { type: "before_agent_start", prompt: "", systemPrompt: "", systemPromptOptions: {} },
      { cwd, hasUI: false },
    );

    const systemPrompt = systemPromptText(result);
    expect(systemPrompt).toContain("quantum uncertain action-outcome instrument loop agent");
    expect(systemPrompt).toContain("WORKSPACE (Quailbot active workspace)");
    expect(systemPrompt).toContain("nqctl:zctrl_setpnt");
    expect((result as { message?: unknown }).message).toBeUndefined();

    const repeated = await handlers.get("before_agent_start")?.(
      { type: "before_agent_start", prompt: "", systemPrompt: "", systemPromptOptions: {} },
      { cwd, hasUI: false },
    );
    expect(systemPromptText(repeated)).toBe(systemPrompt);
  });

  it("replaces the system prompt even when no workspace context is loaded", async () => {
    const cwd = makeTempDir();
    const handlers = new Map<string, Handler>();

    quailbotExtension({
      on: (event: string, handler: Handler) => {
        handlers.set(event, handler);
      },
      registerTool: () => undefined,
      registerCommand: () => undefined,
    } as never);

    const result = await handlers.get("before_agent_start")?.(
      {
        type: "before_agent_start",
        prompt: "",
        systemPrompt: "base Pi coding assistant prompt",
        systemPromptOptions: { cwd },
      },
      { cwd, hasUI: false },
    );

    expect(result).toEqual(
      expect.objectContaining({
        systemPrompt: expect.stringContaining("You are Quailbot"),
      }),
    );
    expect((result as { systemPrompt?: string }).systemPrompt).not.toContain("base Pi coding assistant prompt");
    expect((result as { message?: unknown }).message).toBeUndefined();
  });

  it("clears persisted plan context when a new session starts", async () => {
    const cwd = makeTempDir();
    const workspaceDir = join(cwd, ".quailbot-pi");
    mkdirSync(workspaceDir, { recursive: true });
    copyFileSync(join(process.cwd(), "tests/workspaces/nanonis-minimal.workspace.json"), join(workspaceDir, "workspace.json"));
    const handlers = new Map<string, Handler>();
    const tools: Tool[] = [];

    quailbotExtension({
      on: (event: string, handler: Handler) => {
        handlers.set(event, handler);
      },
      registerTool: (tool: Tool) => {
        tools.push(tool);
      },
      registerCommand: () => undefined,
    } as never);

    await handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, { cwd, hasUI: false });
    await tools.find((tool) => tool.name === "quailbot_planwrite")?.execute("tool-call", {
      mode: "system",
      text: "Session A plan must not leak",
    });

    const sessionAContext = await handlers.get("before_agent_start")?.(
      { type: "before_agent_start", prompt: "", systemPrompt: "", systemPromptOptions: {} },
      { cwd, hasUI: false },
    );
    expect(systemPromptText(sessionAContext)).toContain("WORKSPACE (Quailbot active workspace)");
    expect(renderedContent(sessionAContext)).toContain("Session A plan must not leak");

    await handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, { cwd, hasUI: false });
    const sessionBContext = await handlers.get("before_agent_start")?.(
      { type: "before_agent_start", prompt: "", systemPrompt: "", systemPromptOptions: {} },
      { cwd, hasUI: false },
    );

    expect(renderedContent(sessionBContext)).not.toContain("Session A plan must not leak");
  });
});

type Handler = (event: unknown, ctx: { cwd: string; hasUI: boolean }) => unknown | Promise<unknown>;
type Tool = { name: string; execute: (id: string, params: unknown) => Promise<unknown> };

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "quailbot-context-"));
  tempDirs.push(dir);
  return dir;
}

function renderedContent(result: unknown): string {
  if (!result || typeof result !== "object" || !("message" in result)) {
    return "";
  }

  const message = (result as { message?: { content?: unknown } }).message;
  return typeof message?.content === "string" ? message.content : "";
}

function systemPromptText(result: unknown): string {
  if (!result || typeof result !== "object") {
    return "";
  }

  const systemPrompt = (result as { systemPrompt?: unknown }).systemPrompt;
  return typeof systemPrompt === "string" ? systemPrompt : "";
}
