import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import type { SettingItem } from "@earendil-works/pi-tui";
import { SettingsList } from "@earendil-works/pi-tui";

import type { QuailbotRuntime } from "../extension.js";
import { splitCommandArgs } from "../workspace/register-workspace-commands.js";
import type { KnowledgeRuntime } from "./knowledge-runtime.js";
import { saveKnowledgeState } from "./knowledge-state.js";
import { listMemoryDomains } from "./memory.js";

const LOADED = "loaded";
const UNLOADED = "unloaded";

type ToggleValue = typeof LOADED | typeof UNLOADED;

const USAGE = "Usage: /quailbot-memory [list | load <domain> | unload <domain>]";

export function registerMemoryCommands(pi: ExtensionAPI, runtime: QuailbotRuntime): void {
  pi.registerCommand("quailbot-memory", {
    description: "List, load, or unload Quailbot memory domains (no args opens a toggle menu)",
    getArgumentCompletions(prefix) {
      return ["list", "load", "unload"]
        .filter((command) => command.startsWith(prefix.trim()))
        .map((command) => ({ value: command, label: command }));
    },
    async handler(args, ctx) {
      await handleMemoryCommand(args, ctx, runtime);
    },
  });
}

export async function handleMemoryCommand(
  args: string,
  ctx: ExtensionCommandContext,
  runtime: QuailbotRuntime,
): Promise<void> {
  const [sub, ...rest] = splitCommandArgs(args);

  if (!sub) {
    await openMemoryMenu(ctx, runtime);
    return;
  }

  switch (sub) {
    case "list": {
      const domains = listMemoryDomains(runtime.knowledge.cwd);
      const loaded = [...runtime.knowledge.loadedDomains].sort();
      const lines = [
        `Memory domains (${domains.length}): ${domains.length === 0 ? "(none)" : domains.join(", ")}`,
        `Loaded (${loaded.length}): ${loaded.length === 0 ? "(none)" : loaded.join(", ")}`,
      ];
      ctx.ui.notify(lines.join("\n"), "info");
      return;
    }
    case "load": {
      const [domain] = rest;
      if (!domain) {
        ctx.ui.notify(USAGE, "warning");
        return;
      }
      runtime.knowledge.loadedDomains.add(domain);
      persist(runtime.knowledge);
      const known = listMemoryDomains(runtime.knowledge.cwd).includes(domain);
      const suffix = known ? "" : " (no memory file yet; it will render once content is saved)";
      ctx.ui.notify(`Loaded memory domain: ${domain}${suffix}`, "info");
      return;
    }
    case "unload": {
      const [domain] = rest;
      if (!domain) {
        ctx.ui.notify(USAGE, "warning");
        return;
      }
      const removed = runtime.knowledge.loadedDomains.delete(domain);
      persist(runtime.knowledge);
      ctx.ui.notify(
        removed ? `Unloaded memory domain: ${domain}` : `Memory domain not loaded: ${domain}`,
        "info",
      );
      return;
    }
    default:
      ctx.ui.notify(`Unknown subcommand: ${sub}\n${USAGE}`, "warning");
  }
}

async function openMemoryMenu(ctx: ExtensionCommandContext, runtime: QuailbotRuntime): Promise<void> {
  const knowledge = runtime.knowledge;
  const domains = listMemoryDomains(knowledge.cwd);

  if (domains.length === 0) {
    ctx.ui.notify(
      "No memory domains exist yet. Save a topic with quailbot_memory_save before opening the toggle menu.",
      "info",
    );
    return;
  }

  const initialState = new Map<string, ToggleValue>(
    domains.map((domain) => [domain, knowledge.loadedDomains.has(domain) ? LOADED : UNLOADED]),
  );

  let finalState: Map<string, ToggleValue>;
  try {
    finalState = await ctx.ui.custom<Map<string, ToggleValue>>(
      (_tui, _theme, _keybindings, done) => {
        const state = new Map(initialState);
        const items: SettingItem[] = domains.map((domain) => ({
          id: domain,
          label: domain,
          description: knowledge.loadedDomains.has(domain)
            ? "Currently rendered into the knowledge prefix."
            : "Not currently rendered.",
          currentValue: state.get(domain) ?? UNLOADED,
          values: [LOADED, UNLOADED],
        }));

        return new SettingsList(
          items,
          Math.min(items.length, 12),
          getSettingsListTheme(),
          (id, newValue) => {
            if (newValue === LOADED || newValue === UNLOADED) {
              state.set(id, newValue);
            }
          },
          () => done(state),
        );
      },
      { overlay: true },
    );
  } catch (error) {
    ctx.ui.notify(
      `Could not open memory menu (${errorMessage(error)}). Use /quailbot-memory list|load|unload instead.`,
      "warning",
    );
    return;
  }

  const before = new Set(knowledge.loadedDomains);
  const after = new Set<string>();
  for (const [domain, value] of finalState) {
    if (value === LOADED) {
      after.add(domain);
    }
  }
  knowledge.loadedDomains = after;
  persist(knowledge);

  const loadedNow: string[] = [];
  const unloadedNow: string[] = [];
  for (const domain of domains) {
    const wasLoaded = before.has(domain);
    const isLoaded = after.has(domain);
    if (isLoaded && !wasLoaded) {
      loadedNow.push(domain);
    } else if (!isLoaded && wasLoaded) {
      unloadedNow.push(domain);
    }
  }

  const summary = [
    `Memory toggle saved. Loaded (${after.size}): ${after.size === 0 ? "(none)" : [...after].sort().join(", ")}`,
    loadedNow.length > 0 ? `Newly loaded: ${loadedNow.join(", ")}` : undefined,
    unloadedNow.length > 0 ? `Newly unloaded: ${unloadedNow.join(", ")}` : undefined,
    loadedNow.length === 0 && unloadedNow.length === 0 ? "No changes." : undefined,
  ].filter((line): line is string => line !== undefined);

  ctx.ui.notify(summary.join("\n"), "info");
}

function persist(knowledge: KnowledgeRuntime): void {
  saveKnowledgeState(
    { loadedDomains: [...knowledge.loadedDomains], skillBodyWindow: knowledge.skillBodyWindow },
    knowledge.cwd,
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
