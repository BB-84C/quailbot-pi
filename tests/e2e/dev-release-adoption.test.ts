import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";
import type {
  BeforeAgentStartEvent,
  BuildSystemPromptOptions,
  ExtensionContext,
  ExtensionHandler,
  SessionStartEvent,
} from "@earendil-works/pi-coding-agent";

import { workspaceFileHash } from "../../src/workspace/workspace-service.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tempDirs: string[] = [];
const expectedToolNames = [
  "click_anchor",
  "cli_action",
  "cli_get",
  "cli_ramp",
  "cli_set",
  "observe",
  "quailbot_plan_and_execute",
  "quailbot_planwrite",
  "set_field",
  "sleep_seconds",
];

type PiEventName = "session_start" | "before_agent_start" | "context" | "session_shutdown" | string;
type PiHandler = ExtensionHandler<any, any>;
type RegisteredTool = { name: string; renderCall?: unknown; renderResult?: unknown };
type RegisteredCommand = {
  name: string;
  description?: string;
  handler: (args: string, ctx: ExtensionContext & { reload: () => Promise<void> }) => Promise<void>;
};

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("local Pi dev release adoption", () => {
  it("advertises the built extension through the Pi package manifest", () => {
    const pkg = readJson(join(root, "package.json"));

    expect(pkg.pi?.extensions).toEqual(["./dist/src/extension.js"]);
  });

  it("points Pi local packages at this repository", () => {
    const settings = readJson(join(root, ".pi", "settings.json"));

    expect(settings.packages).toEqual([".."]);
  });

  it("builds the extension entrypoint consumed by the local Pi package", () => {
    expect(existsSync(join(root, "dist", "src", "extension.js"))).toBe(true);
  });

  it("registers deterministic handlers, commands, and product-agnostic tools from the built extension", async () => {
    const { handlers, tools, commands } = await loadBuiltExtensionWithPiStub();

    expect([...handlers.keys()].sort(compareNames)).toEqual([
      "before_agent_start",
      "context",
      "session_shutdown",
      "session_start",
    ]);
    expect(tools.map((tool) => tool.name).sort(compareExpectedToolNames)).toEqual(expectedToolNames);
    for (const tool of tools) {
      expect(tool.renderResult).toEqual(expect.any(Function));
    }
    expect(commands.map((command) => command.name)).toEqual(["quailbot-workspace"]);
  });

  it("loads the generic starter workspace into hidden context on Pi lifecycle events", async () => {
    const tempCwd = makeTempDir();
    const quailbotStateRoot = join(tempCwd, ".quailbot-pi");
    const workspacePath = join(quailbotStateRoot, "workspace.json");

    mkdirSync(quailbotStateRoot, { recursive: true });
    copyFileSync(
      join(root, "tests", "workspaces", "nanonis-minimal.workspace.json"),
      workspacePath,
    );

    const { handlers } = await loadBuiltExtensionWithPiStub();

    const extensionContext = createExtensionContextStub(tempCwd);
    const sessionStartEvent = { type: "session_start", reason: "startup" } satisfies SessionStartEvent;
    const systemPromptOptions = { cwd: tempCwd } satisfies BuildSystemPromptOptions;
    const beforeAgentStartEvent = {
      type: "before_agent_start",
      prompt: "load the active Quailbot workspace",
      systemPrompt: "base Pi system prompt",
      systemPromptOptions,
    } satisfies BeforeAgentStartEvent;

    handlers.get("session_start")?.(sessionStartEvent, extensionContext);
    const context = await handlers.get("before_agent_start")?.(beforeAgentStartEvent, extensionContext);
    expect(context?.systemPrompt).toContain("quantum uncertain action-outcome instrument loop agent");
    expect(context?.systemPrompt).toContain("allowed quantum instrument CLI parameters");
    expect(context?.systemPrompt).toContain("current tool schema");
    expect(context?.systemPrompt).toContain("linked-observable readback");
    expect(context?.systemPrompt).toContain("Quailbot support-tool boundaries");
    expect(context?.systemPrompt).toContain("File and shell tools are support tools");
    expect(context?.systemPrompt).not.toContain("Available tools:");
    expect(context?.systemPrompt).not.toContain("Guidelines:");
    expect(context?.systemPrompt).not.toContain("Other runtime tools");
    expect(context?.systemPrompt).not.toContain("base Pi system prompt");
    expect(context?.systemPrompt).not.toContain("coding assistant");
    expect(context?.systemPrompt).not.toContain("MCP tool");
    expect(context?.systemPrompt).not.toContain("ReAct");
    expect(context?.systemPrompt).not.toContain("Plan+Execute");
    expect(context?.systemPrompt).not.toContain("wait_until");
    const message = context?.message;

    expect(message).toEqual(
      expect.objectContaining({
        customType: "quailbot-context",
        display: false,
      }),
    );

    const content = message?.content;
    expect(typeof content).toBe("string");
    if (typeof content !== "string") {
      throw new Error("before_agent_start did not return string hidden context content");
    }

    const workspaceHeader = "WORKSPACE (Quailbot active workspace)";
    expect(content.startsWith(`${workspaceHeader}\n`)).toBe(true);
    expect(content).toContain(workspaceHeader);

    const workspaceSummary = JSON.parse(content.slice(`${workspaceHeader}\n`.length)) as {
      workspace_path: string;
      mutation_policy: { enable_env_var: string };
      cli: { enabledParameters: Array<{ ref: string }> };
    };

    expect(workspaceSummary.workspace_path).toBe(workspacePath);
    expect(workspaceSummary.cli.enabledParameters).toContainEqual(
      expect.objectContaining({ ref: "nqctl:zctrl_setpnt" }),
    );
    expect(workspaceSummary.mutation_policy.enable_env_var).toBe("QUAILBOT_ALLOW_MUTATING_TOOLS");
  });

  it("switches workspace through the command adapter, persists settings, reloads, and refreshes hidden context", async () => {
    const tempCwd = makeTempDir();
    const candidatePath = join(tempCwd, "candidate.workspace.json");
    copyFileSync(join(root, "tests", "workspaces", "nanonis-minimal.workspace.json"), candidatePath);

    const { commands, handlers } = await loadBuiltExtensionWithPiStub();
    const workspaceCommand = commands.find((command) => command.name === "quailbot-workspace");
    expect(workspaceCommand).toBeDefined();
    if (!workspaceCommand) {
      throw new Error("workspace command was not registered");
    }

    const commandContext = createCommandContextStub(tempCwd);
    await workspaceCommand.handler(`load "${candidatePath}"`, commandContext);

    expect(commandContext.reloads).toBe(1);
    expect(commandContext.notifications.join("\n")).toContain("workspace selected");

    const savedSettings = readJson(join(tempCwd, ".quailbot-pi", "settings.json"));
    expect(savedSettings.workspace).toBe(candidatePath);

    const extensionContext = createExtensionContextStub(tempCwd);
    const sessionStartEvent = { type: "session_start", reason: "startup" } satisfies SessionStartEvent;
    const systemPromptOptions = { cwd: tempCwd } satisfies BuildSystemPromptOptions;
    const beforeAgentStartEvent = {
      type: "before_agent_start",
      prompt: "read the switched Quailbot workspace",
      systemPrompt: "base Pi system prompt",
      systemPromptOptions,
    } satisfies BeforeAgentStartEvent;

    handlers.get("session_start")?.(sessionStartEvent, extensionContext);
    const context = await handlers.get("before_agent_start")?.(beforeAgentStartEvent, extensionContext);
    const content = context?.message?.content;
    expect(typeof content).toBe("string");
    if (typeof content !== "string") {
      throw new Error("before_agent_start did not return string hidden context content");
    }
    const workspaceHeader = "WORKSPACE (Quailbot active workspace)";
    expect(content.startsWith(`${workspaceHeader}\n`)).toBe(true);
    const switchedSummary = JSON.parse(content.slice(`${workspaceHeader}\n`.length)) as {
      workspace_path: string;
      cli: { enabledParameters: Array<{ ref: string }> };
    };
    expect(switchedSummary.workspace_path).toBe(candidatePath);
    expect(switchedSummary.cli.enabledParameters).toContainEqual(
      expect.objectContaining({ ref: "nqctl:zctrl_setpnt" }),
    );
  });

  it("reports the active workspace selection source after session load", async () => {
    const tempCwd = makeTempDir();
    const selectedPath = join(tempCwd, "selected.workspace.json");
    copyFileSync(join(root, "tests", "workspaces", "nanonis-minimal.workspace.json"), selectedPath);
    mkdirSync(join(tempCwd, ".quailbot-pi"), { recursive: true });
    writeFileSync(
      join(tempCwd, ".quailbot-pi", "settings.json"),
      `${JSON.stringify({ workspace: selectedPath }, null, 2)}\n`,
      "utf8",
    );

    const { commands, handlers } = await loadBuiltExtensionWithPiStub();
    const workspaceCommand = commands.find((command) => command.name === "quailbot-workspace");
    expect(workspaceCommand).toBeDefined();
    if (!workspaceCommand) {
      throw new Error("workspace command was not registered");
    }

    const extensionContext = createExtensionContextStub(tempCwd);
    handlers.get("session_start")?.(
      { type: "session_start", reason: "startup" } satisfies SessionStartEvent,
      extensionContext,
    );

    const commandContext = createCommandContextStub(tempCwd);
    await workspaceCommand.handler("show", commandContext);

    const summary = notificationJson(commandContext.notifications, "Quailbot active workspace") as {
      path: string;
      source: string;
    };
    expect(summary.path).toBe(selectedPath);
    expect(summary.source).toBe("settings");
  });

  it("surfaces load reload failures without reporting activation success", async () => {
    const tempCwd = makeTempDir();
    const candidatePath = join(tempCwd, "candidate.workspace.json");
    copyFileSync(join(root, "tests", "workspaces", "nanonis-minimal.workspace.json"), candidatePath);

    const { commands } = await loadBuiltExtensionWithPiStub();
    const workspaceCommand = commands.find((command) => command.name === "quailbot-workspace");
    expect(workspaceCommand).toBeDefined();
    if (!workspaceCommand) {
      throw new Error("workspace command was not registered");
    }

    const commandContext = createCommandContextStub(tempCwd, new Error("reload containment breach"));
    await expect(workspaceCommand.handler(`load "${candidatePath}"`, commandContext)).resolves.toBeUndefined();

    expect(commandContext.reloads).toBe(1);
    expect(commandContext.notifications.join("\n")).toContain("workspace activation failed");
    expect(commandContext.notifications.join("\n")).toContain("reload containment breach");
    expect(commandContext.notifications.join("\n")).not.toContain("workspace selected");
  });

  it("opens the workspace calibrator and reports the recovery URL", async () => {
    const tempCwd = makeTempDir();
    const { commands, handlers } = await loadBuiltExtensionWithPiStub();
    const workspaceCommand = commands.find((command) => command.name === "quailbot-workspace");
    expect(workspaceCommand).toBeDefined();
    if (!workspaceCommand) {
      throw new Error("workspace command was not registered");
    }

    const commandContext = createCommandContextStub(tempCwd);
    await workspaceCommand.handler("open", commandContext);

    expect(commandContext.notifications.join("\n")).toContain("workspace calibrator open");
    expect(commandContext.notifications.join("\n")).toMatch(/http:\/\/127\.0\.0\.1:\d+/);

    await handlers.get("session_shutdown")?.({ type: "session_shutdown" }, createExtensionContextStub(tempCwd));
  });

  it("warns when activating without a pending workspace activation", async () => {
    const tempCwd = makeTempDir();
    const { commands } = await loadBuiltExtensionWithPiStub();
    const workspaceCommand = commands.find((command) => command.name === "quailbot-workspace");
    expect(workspaceCommand).toBeDefined();
    if (!workspaceCommand) {
      throw new Error("workspace command was not registered");
    }

    const commandContext = createCommandContextStub(tempCwd);
    await workspaceCommand.handler("activate-pending", commandContext);

    expect(commandContext.reloads).toBe(0);
    expect(commandContext.notifications.join("\n")).toContain("no pending workspace activation");
  });

  it("activates a pending workspace after validating its expected hash, reloads, then clears the pending activation", async () => {
    const tempCwd = makeTempDir();
    const candidatePath = join(tempCwd, ".quailbot-pi", "candidate.workspace.json");
    mkdirSync(dirname(candidatePath), { recursive: true });
    copyFileSync(join(root, "tests", "workspaces", "nanonis-minimal.workspace.json"), candidatePath);
    const expectedHash = workspaceFileHash(candidatePath);

    const { commands, handlers } = await loadBuiltExtensionWithPiStub();
    const workspaceCommand = requireWorkspaceCommand(commands);
    const commandContext = createCommandContextStub(tempCwd);

    await workspaceCommand.handler("open", commandContext);
    const { url, token } = await workspaceUiSession(commandContext.notifications);
    await requestPendingActivation(url, token, candidatePath, expectedHash);

    await workspaceCommand.handler("activate-pending", commandContext);

    expect(commandContext.reloads).toBe(1);
    expect(readJson(join(tempCwd, ".quailbot-pi", "settings.json")).workspace).toBe(candidatePath);
    expect(commandContext.notifications.join("\n")).toContain("pending workspace activated");
    expect(commandContext.notifications.join("\n")).toContain(expectedHash);

    await workspaceCommand.handler("activate-pending", commandContext);
    expect(commandContext.notifications.join("\n")).toContain("no pending workspace activation");

    await handlers.get("session_shutdown")?.({ type: "session_shutdown" }, createExtensionContextStub(tempCwd));
  });

  it("round-trips a web-edited workspace into the active hidden WORKSPACE context", async () => {
    const tempCwd = makeTempDir();
    const workspacePath = join(tempCwd, ".quailbot-pi", "workspace.json");
    mkdirSync(dirname(workspacePath), { recursive: true });
    const workspaceJson = readJson(join(root, "tests", "workspaces", "nanonis-minimal.workspace.json"));
    workspaceJson.groups = [{ name: "spectroscopy", active: true }];
    workspaceJson.rois = [{ name: "current", group: "spectroscopy", active: true, x: 120, y: 80, w: 240, h: 160 }];
    workspaceJson.anchors = [
      { name: "bias-field", group: "spectroscopy", active: true, linked_ROIs: ["current"], x: 520, y: 300 },
    ];
    workspaceJson.tools = representativeRealWorkspaceTools();
    writeFileSync(workspacePath, `${JSON.stringify(workspaceJson, null, 2)}\n`, "utf8");

    const { commands, handlers } = await loadBuiltExtensionWithPiStub();
    const workspaceCommand = requireWorkspaceCommand(commands);
    const commandContext = createCommandContextStub(tempCwd);

    await workspaceCommand.handler("open", commandContext);
    const { url, token } = await workspaceUiSession(commandContext.notifications);

    const loadedResponse = await fetch(`${url}/api/workspace?token=${encodeURIComponent(token)}`);
    const loaded = (await loadedResponse.json()) as { ok: true; workspaceJson: any };
    expect(loadedResponse.status).toBe(200);
    expect(loaded.workspaceJson.tools).toEqual(representativeRealWorkspaceTools());

    loaded.workspaceJson.rois[0].x = 321;
    loaded.workspaceJson.rois[0].y = 222;
    loaded.workspaceJson.anchors[0].x = 444;

    const writeResponse = await fetch(`${url}/api/write?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-quailbot-workspace-ui-token": token,
      },
      body: JSON.stringify({ workspaceJson: loaded.workspaceJson, targetPath: workspacePath }),
    });
    const written = (await writeResponse.json()) as { ok: true; hash: string };
    expect(writeResponse.status).toBe(200);
    expect(readJson(workspacePath).tools).toEqual(representativeRealWorkspaceTools());

    await requestPendingActivation(url, token, workspacePath, written.hash);
    await workspaceCommand.handler("activate-pending", commandContext);

    expect(commandContext.reloads).toBe(1);
    expect(readJson(join(tempCwd, ".quailbot-pi", "settings.json")).workspace).toBe(workspacePath);

    const extensionContext = createExtensionContextStub(tempCwd);
    handlers.get("session_start")?.({ type: "session_start", reason: "startup" } satisfies SessionStartEvent, extensionContext);
    const context = await handlers.get("before_agent_start")?.(
      {
        type: "before_agent_start",
        prompt: "read the web-edited workspace",
        systemPrompt: "base Pi system prompt",
        systemPromptOptions: { cwd: tempCwd },
      } satisfies BeforeAgentStartEvent,
      extensionContext,
    );
    const content = context?.message?.content;
    expect(typeof content).toBe("string");
    if (typeof content !== "string") {
      throw new Error("before_agent_start did not return string hidden context content");
    }
    const workspaceHeader = "WORKSPACE (Quailbot active workspace)";
    const summary = JSON.parse(content.slice(`${workspaceHeader}\n`.length)) as {
      workspace_path: string;
      active_rois: Array<{ name?: string; schema: { x?: number; y?: number } }>;
      active_anchors: Array<{ name?: string; schema: { x?: number } }>;
    };

    expect(summary.workspace_path).toBe(workspacePath);
    expect(summary.active_rois).toContainEqual(
      expect.objectContaining({ name: "current", schema: expect.objectContaining({ x: 321, y: 222 }) }),
    );
    expect(summary.active_anchors).toContainEqual(
      expect.objectContaining({ name: "bias-field", schema: expect.objectContaining({ x: 444 }) }),
    );
  });

  it("rejects pending activation hash mismatches and keeps the pending activation for a later retry", async () => {
    const tempCwd = makeTempDir();
    const candidatePath = join(tempCwd, ".quailbot-pi", "candidate.workspace.json");
    const workspaceFixturePath = join(root, "tests", "workspaces", "nanonis-minimal.workspace.json");
    const originalWorkspaceJson = readFileSync(workspaceFixturePath, "utf8");
    mkdirSync(dirname(candidatePath), { recursive: true });
    copyFileSync(workspaceFixturePath, candidatePath);
    const expectedHash = workspaceFileHash(candidatePath);

    const { commands, handlers } = await loadBuiltExtensionWithPiStub();
    const workspaceCommand = requireWorkspaceCommand(commands);
    const commandContext = createCommandContextStub(tempCwd);

    await workspaceCommand.handler("open", commandContext);
    const { url, token } = await workspaceUiSession(commandContext.notifications);
    await requestPendingActivation(url, token, candidatePath, expectedHash);
    writeFileSync(candidatePath, originalWorkspaceJson.replace('"nqctl"', '"dirtyctl"'), "utf8");

    await workspaceCommand.handler("activate-pending", commandContext);

    expect(commandContext.reloads).toBe(0);
    expect(commandContext.notifications.join("\n")).toContain("hash mismatch");
    expect(commandContext.notifications.join("\n")).toContain(expectedHash);

    writeFileSync(candidatePath, originalWorkspaceJson, "utf8");
    await workspaceCommand.handler("activate-pending", commandContext);
    expect(commandContext.reloads).toBe(1);
    expect(commandContext.notifications.join("\n")).toContain("pending workspace activated");

    await handlers.get("session_shutdown")?.({ type: "session_shutdown" }, createExtensionContextStub(tempCwd));
  });

  it("retains pending activation when reload fails so the activation can be retried", async () => {
    const tempCwd = makeTempDir();
    const candidatePath = join(tempCwd, ".quailbot-pi", "candidate.workspace.json");
    mkdirSync(dirname(candidatePath), { recursive: true });
    copyFileSync(join(root, "tests", "workspaces", "nanonis-minimal.workspace.json"), candidatePath);
    const expectedHash = workspaceFileHash(candidatePath);

    const { commands, handlers } = await loadBuiltExtensionWithPiStub();
    const workspaceCommand = requireWorkspaceCommand(commands);
    const failingContext = createCommandContextStub(tempCwd, new Error("reload containment breach"));

    await workspaceCommand.handler("open", failingContext);
    const { url, token } = await workspaceUiSession(failingContext.notifications);
    await requestPendingActivation(url, token, candidatePath, expectedHash);

    await workspaceCommand.handler("activate-pending", failingContext);

    expect(failingContext.reloads).toBe(1);
    expect(failingContext.notifications.join("\n")).toContain("pending workspace activation failed during reload");
    expect(failingContext.notifications.join("\n")).toContain("reload containment breach");

    const retryContext = createCommandContextStub(tempCwd);
    await workspaceCommand.handler("activate-pending", retryContext);
    expect(retryContext.reloads).toBe(1);
    expect(retryContext.notifications.join("\n")).toContain("pending workspace activated");

    await handlers.get("session_shutdown")?.({ type: "session_shutdown" }, createExtensionContextStub(tempCwd));
  });

  it("clears pending workspace activation during session shutdown", async () => {
    const tempCwd = makeTempDir();
    const candidatePath = join(tempCwd, ".quailbot-pi", "candidate.workspace.json");
    mkdirSync(dirname(candidatePath), { recursive: true });
    copyFileSync(join(root, "tests", "workspaces", "nanonis-minimal.workspace.json"), candidatePath);
    const expectedHash = workspaceFileHash(candidatePath);

    const { commands, handlers } = await loadBuiltExtensionWithPiStub();
    const workspaceCommand = requireWorkspaceCommand(commands);
    const commandContext = createCommandContextStub(tempCwd);

    await workspaceCommand.handler("open", commandContext);
    const { url, token } = await workspaceUiSession(commandContext.notifications);
    await requestPendingActivation(url, token, candidatePath, expectedHash);

    await handlers.get("session_shutdown")?.({ type: "session_shutdown" }, createExtensionContextStub(tempCwd));

    await workspaceCommand.handler("activate-pending", commandContext);
    expect(commandContext.reloads).toBe(0);
    expect(commandContext.notifications.join("\n")).toContain("no pending workspace activation");
  });

  it("surfaces write --activate reload failures without reporting activation success", async () => {
    const tempCwd = makeTempDir();
    const candidatePath = join(tempCwd, "candidate.workspace.json");
    const targetPath = join(tempCwd, ".quailbot-pi", "workspace.json");
    copyFileSync(join(root, "tests", "workspaces", "nanonis-minimal.workspace.json"), candidatePath);

    const { commands } = await loadBuiltExtensionWithPiStub();
    const workspaceCommand = commands.find((command) => command.name === "quailbot-workspace");
    expect(workspaceCommand).toBeDefined();
    if (!workspaceCommand) {
      throw new Error("workspace command was not registered");
    }

    const commandContext = createCommandContextStub(tempCwd, new Error("reload containment breach"));
    await expect(
      workspaceCommand.handler(`write "${candidatePath}" "${targetPath}" --activate`, commandContext),
    ).resolves.toBeUndefined();

    expect(commandContext.reloads).toBe(1);
    expect(commandContext.notifications.join("\n")).toContain("workspace activation failed");
    expect(commandContext.notifications.join("\n")).toContain("reload containment breach");
    expect(commandContext.notifications.join("\n")).not.toContain("workspace written and selected");
  });

  it("reports write command before and after hashes in readback", async () => {
    const tempCwd = makeTempDir();
    const candidatePath = join(tempCwd, "candidate.workspace.json");
    const targetPath = join(tempCwd, ".quailbot-pi", "workspace.json");
    copyFileSync(join(root, "tests", "workspaces", "nanonis-minimal.workspace.json"), candidatePath);
    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(join(root, "tests", "workspaces", "nanonis-minimal.workspace.json"), targetPath);

    const { commands } = await loadBuiltExtensionWithPiStub();
    const workspaceCommand = commands.find((command) => command.name === "quailbot-workspace");
    expect(workspaceCommand).toBeDefined();
    if (!workspaceCommand) {
      throw new Error("workspace command was not registered");
    }

    const commandContext = createCommandContextStub(tempCwd);
    await workspaceCommand.handler(`write "${candidatePath}" "${targetPath}"`, commandContext);

    const readback = notificationJson(commandContext.notifications, "workspace written") as {
      targetPath: string;
      previousHash: string;
      hash: string;
      summary: { path: string; source: string };
    };
    expect(readback.targetPath).toBe(targetPath);
    expect(readback.previousHash).toMatch(/^[a-f0-9]{64}$/);
    expect(readback.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(readback.summary.path).toBe(targetPath);
    expect(readback.summary.source).toBe("written");
  });

  it("rejects invalid workspace command candidates without replacing the previous settings", async () => {
    const tempCwd = makeTempDir();
    const validPath = join(tempCwd, "valid.workspace.json");
    const invalidPath = join(tempCwd, "invalid.workspace.json");
    copyFileSync(join(root, "tests", "workspaces", "nanonis-minimal.workspace.json"), validPath);
    writeFileSync(invalidPath, JSON.stringify({ cli_params: [] }), "utf8");

    const { commands } = await loadBuiltExtensionWithPiStub();
    const workspaceCommand = commands.find((command) => command.name === "quailbot-workspace");
    expect(workspaceCommand).toBeDefined();
    if (!workspaceCommand) {
      throw new Error("workspace command was not registered");
    }

    const commandContext = createCommandContextStub(tempCwd);
    await workspaceCommand.handler(`load "${validPath}"`, commandContext);
    expect(readJson(join(tempCwd, ".quailbot-pi", "settings.json")).workspace).toBe(validPath);

    await workspaceCommand.handler(`load "${invalidPath}"`, commandContext);
    expect(readJson(join(tempCwd, ".quailbot-pi", "settings.json")).workspace).toBe(validPath);
    expect(commandContext.reloads).toBe(1);
    expect(commandContext.notifications.join("\n")).toContain("workspace validation failed");
  });
});

async function loadBuiltExtensionWithPiStub(): Promise<{
  handlers: Map<PiEventName, PiHandler>;
  tools: RegisteredTool[];
  commands: RegisteredCommand[];
}> {
  const extensionPath = join(root, "dist", "src", "extension.js");
  const extensionModule = await import(`${pathToFileURL(extensionPath).href}?cacheBust=${Date.now()}`);
  const handlers = new Map<PiEventName, PiHandler>();
  const tools: RegisteredTool[] = [];
  const commands: RegisteredCommand[] = [];

  extensionModule.default({
    on(event: PiEventName, handler: PiHandler) {
      handlers.set(event, handler);
    },
    registerTool(tool: RegisteredTool) {
      tools.push(tool);
    },
    registerCommand(name: string, options: Omit<RegisteredCommand, "name">) {
      commands.push({ name, ...options });
    },
  });

  return { handlers, tools, commands };
}

function representativeRealWorkspaceTools(): Record<string, unknown> {
  return {
    SetBias: {
      requires_rois: ["bias_readout"],
      requires_anchors: ["bias_input"],
      input_unit: "V",
      safety: { min_mV: -5000, max_mV: 5000, tolerance_mV: 2 },
    },
    StartScan: {
      requires_rois: ["scan_status"],
      requires_anchors: ["scan_start_from_top_button", "scan_start_from_bottom_button"],
    },
    nqctl: { enabled: false, parameters: {} },
    cli: {
      enabled: true,
      parameters: {
        aprfgen_freq: {
          label: "Aprfgen Freq",
          name: "aprfgen_freq",
          readable: true,
          writable: true,
          has_ramp: true,
          CLI_Name: "nqctl",
        },
      },
    },
  };
}

function readJson(path: string): Record<string, any> {
  return JSON.parse(readFileSync(path, "utf8"));
}

function requireWorkspaceCommand(commands: RegisteredCommand[]): RegisteredCommand {
  const workspaceCommand = commands.find((command) => command.name === "quailbot-workspace");
  expect(workspaceCommand).toBeDefined();
  if (!workspaceCommand) {
    throw new Error("workspace command was not registered");
  }
  return workspaceCommand;
}

async function workspaceUiSession(notifications: string[]): Promise<{ url: string; token: string }> {
  const notification = notifications.find((item) => item.includes("workspace calibrator open"));
  if (!notification) {
    throw new Error("workspace calibrator open notification was not emitted");
  }
  const url = notification.split("\n").find((line) => line.startsWith("http://127.0.0.1:"));
  if (!url) {
    throw new Error("workspace calibrator URL was not reported");
  }
  const response = await fetch(url);
  const html = await response.text();
  const token = html.match(/data-token="([^"]+)"/)?.[1];
  if (!token) {
    throw new Error("workspace calibrator token was not rendered");
  }
  return { url, token };
}

async function requestPendingActivation(
  url: string,
  token: string,
  targetPath: string,
  expectedHash: string,
): Promise<void> {
  const response = await fetch(`${url}/api/request-activation?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-quailbot-workspace-ui-token": token,
    },
    body: JSON.stringify({ targetPath, expectedHash }),
  });
  expect(response.status).toBe(200);
}

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "quailbot-pi-dev-release-"));
  tempDirs.push(dir);
  return dir;
}

function notificationJson(notifications: string[], title: string): unknown {
  const prefix = `${title}\n`;
  const notification = notifications.find((item) => item.startsWith(prefix));
  if (!notification) {
    throw new Error(`missing notification: ${title}`);
  }

  return JSON.parse(notification.slice(prefix.length));
}

function createExtensionContextStub(cwd: string): ExtensionContext {
  const ui: ExtensionContext["ui"] = {
    select: async () => undefined,
    confirm: async () => false,
    input: async () => undefined,
    notify() {},
    onTerminalInput: () => () => {},
    setStatus() {},
    setWorkingMessage() {},
    setWorkingVisible() {},
    setWorkingIndicator() {},
    setHiddenThinkingLabel() {},
    setWidget() {},
    setFooter() {},
    setHeader() {},
    setTitle() {},
    custom: async () => undefined as never,
    pasteToEditor() {},
    setEditorText() {},
    getEditorText: () => "",
    editor: async () => undefined,
    addAutocompleteProvider() {},
    setEditorComponent() {},
    getEditorComponent: () => undefined,
    theme: {} as ExtensionContext["ui"]["theme"],
    getAllThemes: () => [],
    getTheme: () => undefined,
    setTheme: () => ({ success: false, error: "UI unavailable in test stub" }),
    getToolsExpanded: () => false,
    setToolsExpanded() {},
  };

  const context: ExtensionContext = {
    cwd,
    hasUI: false,
    ui,
    sessionManager: {} as ExtensionContext["sessionManager"],
    modelRegistry: {} as ExtensionContext["modelRegistry"],
    model: undefined,
    isIdle: () => true,
    signal: undefined,
    abort() {},
    hasPendingMessages: () => false,
    shutdown() {},
    getContextUsage: () => undefined,
    compact() {},
    getSystemPrompt: () => "",
  };

  return context;
}

function createCommandContextStub(cwd: string, reloadError?: Error): ExtensionContext & {
  reload: () => Promise<void>;
  notifications: string[];
  reloads: number;
} {
  const notifications: string[] = [];
  let reloads = 0;
  const context = createExtensionContextStub(cwd) as ExtensionContext & {
    reload: () => Promise<void>;
    notifications: string[];
    reloads: number;
  };

  context.ui.notify = (message: string) => {
    notifications.push(message);
  };
  context.reload = async () => {
    reloads += 1;
    if (reloadError) {
      throw reloadError;
    }
  };
  Object.defineProperty(context, "notifications", { get: () => notifications });
  Object.defineProperty(context, "reloads", { get: () => reloads });

  return context;
}

function compareNames(left: string, right: string): number {
  return left.localeCompare(right);
}

function compareExpectedToolNames(left: string, right: string): number {
  return expectedToolNames.indexOf(left) - expectedToolNames.indexOf(right);
}
