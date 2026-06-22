import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import { openQuailbotSettingsMenu, selectSubmenu } from "../commands/quailbot-menu.js";
import type { QuailbotRuntime } from "../extension.js";
import { knowledgeStateFromRuntime } from "./knowledge-runtime.js";
import { splitCommandArgs } from "../workspace/register-workspace-commands.js";
import { renderSkillCatalog } from "./knowledge-render.js";
import { saveKnowledgeState } from "./knowledge-state.js";
import { discoverSkills } from "./skills.js";

const SKILL_WINDOW_VALUES = ["1", "2", "3", "5", "10", "20", "50"];

export function registerKnowledgeCommands(pi: ExtensionAPI, runtime: QuailbotRuntime): void {
  pi.registerCommand("quailbot-skills", {
    description: "Open Quailbot skill controls, list skills, or set the skill-body context window",
    getArgumentCompletions(prefix) {
      return ["list", "window"].filter((command) => command.startsWith(prefix.trim())).map((command) => ({ value: command, label: command }));
    },
    async handler(args, ctx) {
      await handleSkillsCommand(args, ctx, runtime);
    },
  });

  pi.registerCommand("quailbot-reload", {
    description: "Open Quailbot reload controls.",
    async handler(args, ctx) {
      const [sub] = splitCommandArgs(args);
      if (!sub) {
        await openQuailbotSettingsMenu(ctx, [
          {
            id: "reload",
            label: "Reload",
            description: "Reload Quailbot extensions, skills, workspace context, and prompts.",
            currentValue: "select",
            submenu: selectSubmenu(
              "Reload Quailbot",
              "Select reload to refresh Quailbot now.",
              [{ value: "reload", label: "reload" }],
              "reload",
              () => {
                void ctx.reload().catch((error: unknown) => {
                  ctx.ui.notify(`Quailbot reload failed: ${errorMessage(error)}`, "warning");
                });
              },
            ),
          },
        ]);
        return;
      }
      if (sub === "reload") {
        await ctx.reload();
        return;
      }
      ctx.ui.notify("usage: /quailbot-reload reload", "warning");
    },
  });
}

export async function handleSkillsCommand(args: string, ctx: ExtensionCommandContext, runtime: QuailbotRuntime): Promise<void> {
  const [sub, ...rest] = splitCommandArgs(args);
  if (!sub) {
    await openSkillsMenu(ctx, runtime);
    return;
  }

  if (sub === "window") {
    const value = Number(rest[0]);
    if (!Number.isInteger(value) || value <= 0) {
      ctx.ui.notify("Usage: /quailbot-skills window <positive integer>", "warning");
      return;
    }
    runtime.knowledge.skillBodyWindow = value;
    saveKnowledgeState(knowledgeStateFromRuntime(runtime.knowledge), runtime.knowledge.cwd);
    ctx.ui.notify(`Quailbot skill-body window set to ${value}.`, "info");
    return;
  }
  if (sub !== "list") {
    ctx.ui.notify("Usage: /quailbot-skills list|window <positive integer>", "warning");
    return;
  }
  const skills = discoverSkills(runtime.knowledge.cwd, runtime.knowledge.skillCache);
  ctx.ui.notify(renderSkillCatalog(skills, runtime.workspace), "info");
}

async function openSkillsMenu(ctx: ExtensionCommandContext, runtime: QuailbotRuntime): Promise<void> {
  await openQuailbotSettingsMenu(ctx, [
    {
      id: "list",
      label: "List skills",
      description: "Render the current Quailbot skill catalog.",
      currentValue: "select",
      submenu: selectSubmenu(
        "List Skills",
        "Select list to print the current skill catalog.",
        [{ value: "list", label: "list" }],
        "list",
        () => {
          const skills = discoverSkills(runtime.knowledge.cwd, runtime.knowledge.skillCache);
          ctx.ui.notify(renderSkillCatalog(skills, runtime.workspace), "info");
        },
      ),
    },
    {
      id: "window",
      label: "Skill body window",
      description: "Number of newest quailbot_skill results that keep full skill bodies in context.",
      currentValue: String(runtime.knowledge.skillBodyWindow),
      submenu: selectSubmenu(
        "Skill Body Window",
        "Select how many newest quailbot_skill results retain the full skill body in context.",
        SKILL_WINDOW_VALUES.map((value) => ({ value, label: value })),
        String(runtime.knowledge.skillBodyWindow),
        (value) => {
          runtime.knowledge.skillBodyWindow = Number(value);
          saveKnowledgeState(knowledgeStateFromRuntime(runtime.knowledge), runtime.knowledge.cwd);
        },
      ),
    },
  ]);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
