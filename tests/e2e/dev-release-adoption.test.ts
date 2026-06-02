import { existsSync, mkdirSync, readFileSync, rmSync, copyFileSync } from "node:fs";
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
const quailbotStateRoot = join(root, ".quailbot-pi");
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
  cleanupQuailbotState();
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
    cleanupQuailbotState();
    mkdirSync(quailbotStateRoot, { recursive: true });
    copyFileSync(
      join(root, "tests", "workspaces", "nanonis-minimal.workspace.json"),
      join(quailbotStateRoot, "workspace.json"),
    );

    const { handlers } = await loadBuiltExtensionWithPiStub();

    const extensionContext = createExtensionContextStub(root);
    const sessionStartEvent = { type: "session_start", reason: "startup" } satisfies SessionStartEvent;
    const systemPromptOptions = { cwd: root } satisfies BuildSystemPromptOptions;
    const beforeAgentStartEvent = {
      type: "before_agent_start",
      prompt: "load the active Quailbot workspace",
      systemPrompt: "base Pi system prompt",
      systemPromptOptions,
    } satisfies BeforeAgentStartEvent;

    handlers.get("session_start")?.(sessionStartEvent, extensionContext);
    const context = handlers.get("before_agent_start")?.(beforeAgentStartEvent, extensionContext);
    const hiddenContext = JSON.stringify(context);

    expect(hiddenContext).toContain("WORKSPACE (Quailbot active workspace)");
    expect(hiddenContext).toContain("nqctl:zctrl_setpnt");
    expect(hiddenContext).toContain("mutation_policy");
    expect(hiddenContext).toContain("QUAILBOT_ALLOW_MUTATING_TOOLS");
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

function cleanupQuailbotState(): void {
  rmSync(quailbotStateRoot, { recursive: true, force: true });
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
