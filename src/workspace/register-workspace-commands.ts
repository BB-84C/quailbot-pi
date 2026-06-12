import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import type { QuailbotRuntime } from "../extension.js";
import {
  loadActiveWorkspace,
  selectWorkspace,
  summarizeWorkspace,
  validateWorkspaceCandidate,
  writeWorkspaceCandidate,
} from "./workspace-service.js";

export function registerWorkspaceCommands(pi: ExtensionAPI, runtime: QuailbotRuntime): void {
  pi.registerCommand("quailbot-workspace", {
    description: "Show, validate, select, or write the active Quailbot workspace",
    getArgumentCompletions(prefix) {
      const commands = ["show", "read", "validate", "load", "write"];
      const matches = commands.filter((command) => command.startsWith(prefix.trim()));
      return matches.map((command) => ({ value: command, label: command }));
    },
    async handler(args, ctx) {
      await handleWorkspaceCommand(args, ctx, runtime);
    },
  });
}

async function handleWorkspaceCommand(
  args: string,
  ctx: ExtensionCommandContext,
  runtime: QuailbotRuntime,
): Promise<void> {
  const [command = "show", ...rest] = splitCommandArgs(args);

  switch (command) {
    case "show":
    case "read": {
      if (runtime.activeWorkspace) {
        notifyJson(ctx, "Quailbot active workspace", runtime.activeWorkspace.summary);
        return;
      }

      try {
        const active = loadActiveWorkspace({ cwd: ctx.cwd });
        notifyJson(ctx, "Quailbot active workspace", active.summary);
      } catch (error) {
        ctx.ui.notify(`Quailbot workspace unavailable: ${errorMessage(error)}`, "warning");
      }
      return;
    }

    case "validate": {
      const [path] = rest;
      if (!path) {
        ctx.ui.notify("usage: /quailbot-workspace validate <workspace-path>", "warning");
        return;
      }
      const validation = validateWorkspaceCandidate(path, { cwd: ctx.cwd });
      if (!validation.ok) {
        ctx.ui.notify(`workspace validation failed: ${validation.error}`, "warning");
        return;
      }
      notifyJson(ctx, "workspace validation passed", validation.summary);
      return;
    }

    case "load": {
      const [path] = rest;
      if (!path) {
        ctx.ui.notify("usage: /quailbot-workspace load <workspace-path>", "warning");
        return;
      }
      const selection = selectWorkspace(path, { cwd: ctx.cwd });
      if (!selection.ok) {
        ctx.ui.notify(`workspace validation failed: ${selection.error}`, "warning");
        return;
      }
      try {
        await ctx.reload();
      } catch (error) {
        ctx.ui.notify(
          `workspace activation failed after selection was saved: ${errorMessage(error)}`,
          "warning",
        );
        return;
      }
      ctx.ui.notify(`workspace selected: ${selection.summary.path}\nsha256: ${selection.hash}`, "info");
      return;
    }

    case "write": {
      const [candidatePath, targetPath, flag] = rest;
      if (!candidatePath || !targetPath) {
        ctx.ui.notify(
          "usage: /quailbot-workspace write <candidate-path> <target-path> [--activate]",
          "warning",
        );
        return;
      }
      const result = writeWorkspaceCandidate({ candidatePath, targetPath, cwd: ctx.cwd });
      if (!result.ok) {
        ctx.ui.notify(`workspace write failed: ${result.error}`, "warning");
        return;
      }
      if (flag === "--activate") {
        const selected = selectWorkspace(result.targetPath, { cwd: ctx.cwd });
        if (!selected.ok) {
          ctx.ui.notify(`workspace write succeeded but activation failed: ${selected.error}`, "warning");
          return;
        }
        try {
          await ctx.reload();
        } catch (error) {
          ctx.ui.notify(
            `workspace activation failed after write and selection were saved: ${errorMessage(error)}`,
            "warning",
          );
          return;
        }
        ctx.ui.notify(`workspace written and selected: ${result.targetPath}\nsha256: ${result.hash}`, "info");
        return;
      }
      notifyJson(ctx, "workspace written", result.summary);
      return;
    }

    default:
      ctx.ui.notify(
        `unknown workspace command: ${command}\nusage: /quailbot-workspace show|read|validate|load|write`,
        "warning",
      );
  }
}

function notifyJson(ctx: ExtensionCommandContext, title: string, value: unknown): void {
  ctx.ui.notify(`${title}\n${JSON.stringify(value, null, 2)}`, "info");
}

function splitCommandArgs(input: string): string[] {
  const result: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;

  for (const char of input.trim()) {
    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === " " || char === "\t") {
      if (current.length > 0) {
        result.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    result.push(current);
  }

  return result;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
