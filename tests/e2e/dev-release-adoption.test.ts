import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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

type PiEventName = "session_start" | "before_agent_start" | string;
type PiHandler = ExtensionHandler<any, any>;
type RegisteredTool = { name: string };

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

  it("registers deterministic handlers and product-agnostic tools from the built extension", async () => {
    const { handlers, tools } = await loadBuiltExtensionWithPiStub();

    expect([...handlers.keys()].sort(compareNames)).toEqual(["before_agent_start", "session_start"]);
    expect(tools.map((tool) => tool.name).sort(compareExpectedToolNames)).toEqual(expectedToolNames);
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
});

async function loadBuiltExtensionWithPiStub(): Promise<{ handlers: Map<PiEventName, PiHandler>; tools: RegisteredTool[] }> {
  const extensionPath = join(root, "dist", "src", "extension.js");
  const extensionModule = await import(`${pathToFileURL(extensionPath).href}?cacheBust=${Date.now()}`);
  const handlers = new Map<PiEventName, PiHandler>();
  const tools: RegisteredTool[] = [];

  extensionModule.default({
    on(event: PiEventName, handler: PiHandler) {
      handlers.set(event, handler);
    },
    registerTool(tool: RegisteredTool) {
      tools.push(tool);
    },
  });

  return { handlers, tools };
}

function readJson(path: string): Record<string, any> {
  return JSON.parse(readFileSync(path, "utf8"));
}

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "quailbot-pi-dev-release-"));
  tempDirs.push(dir);
  return dir;
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

function compareNames(left: string, right: string): number {
  return left.localeCompare(right);
}

function compareExpectedToolNames(left: string, right: string): number {
  return expectedToolNames.indexOf(left) - expectedToolNames.indexOf(right);
}
