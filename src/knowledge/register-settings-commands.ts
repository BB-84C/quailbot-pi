import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import { openQuailbotSettingsMenu, selectSubmenu } from "../commands/quailbot-menu.js";
import type { QuailbotRuntime } from "../extension.js";
import { knowledgeStateFromRuntime } from "./knowledge-runtime.js";
import { saveKnowledgeState } from "./knowledge-state.js";
import { splitCommandArgs } from "../workspace/register-workspace-commands.js";

const SUBCOMMANDS = ["show", "cli-window", "image-window", "skill-window"] as const;
const WINDOW_VALUES = ["1", "2", "3", "5", "10", "20", "50"];
const USAGE = "usage: /quailbot-settings show|cli-window <n>|image-window <n>|skill-window <n>";

export function registerSettingsCommands(pi: ExtensionAPI, runtime: QuailbotRuntime): void {
  pi.registerCommand("quailbot-settings", {
    description: "Configure Quailbot context pruning and runtime windows.",
    getArgumentCompletions(prefix) {
      const trimmed = prefix.trim();
      return SUBCOMMANDS.filter((command) => command.startsWith(trimmed)).map((command) => ({
        value: command,
        label: command,
      }));
    },
    async handler(args, ctx) {
      await handleSettingsCommand(args, ctx, runtime);
    },
  });
}

export async function handleSettingsCommand(
  args: string,
  ctx: ExtensionCommandContext,
  runtime: QuailbotRuntime,
): Promise<void> {
  const [sub, ...rest] = splitCommandArgs(args);
  if (!sub) {
    await openSettingsMenu(ctx, runtime);
    return;
  }

  switch (sub) {
    case "show":
      notifyCurrentSettings(ctx, runtime);
      return;
    case "cli-window":
      setPositiveWindow(ctx, runtime, rest[0], "recentFullCliResultWindow", "direct CLI result window");
      return;
    case "image-window":
      setPositiveWindow(ctx, runtime, rest[0], "recentImageResultWindow", "image result window");
      return;
    case "skill-window":
      setPositiveWindow(ctx, runtime, rest[0], "skillBodyWindow", "skill body window");
      return;
    default:
      ctx.ui.notify(`unknown settings command: ${sub}\n${USAGE}`, "warning");
  }
}

async function openSettingsMenu(ctx: ExtensionCommandContext, runtime: QuailbotRuntime): Promise<void> {
  await openQuailbotSettingsMenu(ctx, [
    {
      id: "cli-window",
      label: "Direct CLI results",
      description: "Number of newest direct cli_get/cli_set/cli_ramp/cli_action results kept in recent-full context.",
      currentValue: String(runtime.knowledge.recentFullCliResultWindow),
      submenu: selectSubmenu(
        "Direct CLI Results",
        "Select how many newest direct CLI tool results retain full raw output in context.",
        valueOptions(WINDOW_VALUES),
        String(runtime.knowledge.recentFullCliResultWindow),
        (value) => setRuntimeWindow(runtime, "recentFullCliResultWindow", Number(value)),
      ),
    },
    {
      id: "image-window",
      label: "Image results",
      description: "Number of newest Quailbot image-bearing tool results that keep provider-visible image blocks.",
      currentValue: String(runtime.knowledge.recentImageResultWindow),
      submenu: selectSubmenu(
        "Image Results",
        "Select how many newest image-bearing Quailbot tool results keep image blocks in context.",
        valueOptions(WINDOW_VALUES),
        String(runtime.knowledge.recentImageResultWindow),
        (value) => setRuntimeWindow(runtime, "recentImageResultWindow", Number(value)),
      ),
    },
    {
      id: "skill-window",
      label: "Skill bodies",
      description: "Number of newest quailbot_skill results that keep full skill bodies in context.",
      currentValue: String(runtime.knowledge.skillBodyWindow),
      submenu: selectSubmenu(
        "Skill Bodies",
        "Select how many newest quailbot_skill results retain the full skill body in context.",
        valueOptions(WINDOW_VALUES),
        String(runtime.knowledge.skillBodyWindow),
        (value) => setRuntimeWindow(runtime, "skillBodyWindow", Number(value)),
      ),
    },
  ]);
}

function notifyCurrentSettings(ctx: ExtensionCommandContext, runtime: QuailbotRuntime): void {
  ctx.ui.notify(
    [
      "Quailbot settings",
      `direct CLI result window: ${runtime.knowledge.recentFullCliResultWindow}`,
      `image result window: ${runtime.knowledge.recentImageResultWindow}`,
      `skill body window: ${runtime.knowledge.skillBodyWindow}`,
    ].join("\n"),
    "info",
  );
}

function setPositiveWindow(
  ctx: ExtensionCommandContext,
  runtime: QuailbotRuntime,
  rawValue: string | undefined,
  key: "recentFullCliResultWindow" | "recentImageResultWindow" | "skillBodyWindow",
  label: string,
): void {
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value <= 0) {
    ctx.ui.notify(USAGE, "warning");
    return;
  }
  setRuntimeWindow(runtime, key, value);
  ctx.ui.notify(`Quailbot ${label} set to ${value}.`, "info");
}

function setRuntimeWindow(
  runtime: QuailbotRuntime,
  key: "recentFullCliResultWindow" | "recentImageResultWindow" | "skillBodyWindow",
  value: number,
): void {
  runtime.knowledge[key] = value;
  saveKnowledgeState(knowledgeStateFromRuntime(runtime.knowledge), runtime.knowledge.cwd);
}

function valueOptions(values: string[]): Array<{ value: string; label: string }> {
  return values.map((value) => ({ value, label: value }));
}
