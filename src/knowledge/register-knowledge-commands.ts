import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import type { QuailbotRuntime } from "../extension.js";
import { splitCommandArgs } from "../workspace/register-workspace-commands.js";
import { renderSkillCatalog } from "./knowledge-render.js";
import { saveKnowledgeState } from "./knowledge-state.js";
import { discoverSkills } from "./skills.js";

export function registerKnowledgeCommands(pi: ExtensionAPI, runtime: QuailbotRuntime): void {
  pi.registerCommand("quailbot-skills", {
    description: "List Quailbot skills, or set the skill-body context window",
    getArgumentCompletions(prefix) {
      return ["list", "window"].filter((command) => command.startsWith(prefix.trim())).map((command) => ({ value: command, label: command }));
    },
    async handler(args, ctx) {
      await handleSkillsCommand(args, ctx, runtime);
    },
  });

  pi.registerCommand("quailbot-reload", {
    description: "Reload Quailbot extensions, skills, and prompts (manual full refresh)",
    async handler(_args, ctx) {
      await ctx.reload();
    },
  });
}

export async function handleSkillsCommand(args: string, ctx: ExtensionCommandContext, runtime: QuailbotRuntime): Promise<void> {
  const [sub = "list", ...rest] = splitCommandArgs(args);
  if (sub === "window") {
    const value = Number(rest[0]);
    if (!Number.isInteger(value) || value <= 0) {
      ctx.ui.notify("Usage: /quailbot-skills window <positive integer>", "warning");
      return;
    }
    runtime.knowledge.skillBodyWindow = value;
    saveKnowledgeState({ loadedDomains: [...runtime.knowledge.loadedDomains], skillBodyWindow: value }, runtime.knowledge.cwd);
    ctx.ui.notify(`Quailbot skill-body window set to ${value}.`, "info");
    return;
  }
  const skills = discoverSkills(runtime.knowledge.cwd, runtime.knowledge.skillCache);
  ctx.ui.notify(renderSkillCatalog(skills, runtime.workspace), "info");
}
