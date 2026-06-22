import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import { openQuailbotSettingsMenu } from "../commands/quailbot-menu.js";
import type { QuailbotRuntime } from "../extension.js";
import { knowledgeStateFromRuntime } from "./knowledge-runtime.js";
import { splitCommandArgs } from "../workspace/register-workspace-commands.js";
import type { KnowledgeRuntime } from "./knowledge-runtime.js";
import { saveKnowledgeState } from "./knowledge-state.js";
import { listMemoryDomains } from "./memory.js";
import { isSafeKnowledgeName } from "./safe-name.js";

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
      if (!isSafeKnowledgeName(domain)) {
        ctx.ui.notify(`Invalid memory domain name: "${domain}"`, "warning");
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
      if (!isSafeKnowledgeName(domain)) {
        ctx.ui.notify(`Invalid memory domain name: "${domain}"`, "warning");
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

  await openQuailbotSettingsMenu(
    ctx,
    domains.map((domain) => ({
      id: domain,
      label: domain,
      description: knowledge.loadedDomains.has(domain)
        ? "Currently rendered into the knowledge prefix."
        : "Not currently rendered.",
      currentValue: initialState.get(domain) ?? UNLOADED,
      values: [LOADED, UNLOADED],
    })),
    (id, newValue) => {
      if (newValue !== LOADED && newValue !== UNLOADED) {
        return;
      }
      if (newValue === LOADED) {
        knowledge.loadedDomains.add(id);
      } else {
        knowledge.loadedDomains.delete(id);
      }
      persist(knowledge);
      ctx.ui.notify(`${newValue === LOADED ? "Loaded" : "Unloaded"} memory domain: ${id}`, "info");
    },
  );
}

function persist(knowledge: KnowledgeRuntime): void {
  saveKnowledgeState(knowledgeStateFromRuntime(knowledge), knowledge.cwd);
}
