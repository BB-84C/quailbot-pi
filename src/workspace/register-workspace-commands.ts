import { spawn } from "node:child_process";

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import { openQuailbotSettingsMenu, selectSubmenu } from "../commands/quailbot-menu.js";
import type { QuailbotRuntime } from "../extension.js";
import { ensureWorkspaceUiServer } from "../workspace-ui/server.js";
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
      const commands = ["show", "read", "validate", "load", "write", "open"];
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
  const [command, ...rest] = splitCommandArgs(args);

  if (!command) {
    await openWorkspaceMenu(ctx, runtime);
    return;
  }

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
        notifyJson(ctx, "workspace written and selected", workspaceWriteReadback(result));
        return;
      }
      notifyJson(ctx, "workspace written", workspaceWriteReadback(result));
      return;
    }

    case "open": {
      const server = await ensureWorkspaceUiServer(runtime, ctx.cwd);
      const url = `${server.url}/?token=${encodeURIComponent(server.token)}`;
      launchWorkspaceCalibrator(url, ctx);
      ctx.ui.notify(`workspace calibrator open\n${url}`, "info");
      return;
    }

    default:
      ctx.ui.notify(
        `unknown workspace command: ${command}\nusage: /quailbot-workspace show|read|validate|load|write|open`,
        "warning",
      );
  }
}

async function openWorkspaceMenu(ctx: ExtensionCommandContext, runtime: QuailbotRuntime): Promise<void> {
  await openQuailbotSettingsMenu(ctx, [
    {
      id: "show",
      label: "Show active",
      description: "Show active workspace summary.",
      currentValue: "select",
      submenu: selectSubmenu(
        "Show Active Workspace",
        "Select show to print the active workspace summary.",
        [{ value: "show", label: "show" }],
        "show",
        () => {
          void handleWorkspaceCommand("show", ctx, runtime);
        },
      ),
    },
    {
      id: "load",
      label: "Load",
      description: "Validate, select, and reload a workspace path.",
      currentValue: "select",
      submenu: selectSubmenu(
        "Load Workspace",
        "Select load, then enter the workspace path.",
        [{ value: "load", label: "load" }],
        "load",
        () => {
          void promptWorkspacePath(ctx, "Workspace path to load").then((path) => {
            if (path) void handleWorkspaceCommand(`load ${quoteArg(path)}`, ctx, runtime);
          });
        },
      ),
    },
    {
      id: "validate",
      label: "Validate",
      description: "Validate a workspace path without changing active settings.",
      currentValue: "select",
      submenu: selectSubmenu(
        "Validate Workspace",
        "Select validate, then enter the workspace path.",
        [{ value: "validate", label: "validate" }],
        "validate",
        () => {
          void promptWorkspacePath(ctx, "Workspace path to validate").then((path) => {
            if (path) void handleWorkspaceCommand(`validate ${quoteArg(path)}`, ctx, runtime);
          });
        },
      ),
    },
    {
      id: "write",
      label: "Write",
      description: "Write a candidate workspace JSON to a target path.",
      currentValue: "select",
      submenu: selectSubmenu(
        "Write Workspace",
        "Select write, then enter candidate and target paths on separate lines. Add --activate on a third line to select it.",
        [{ value: "write", label: "write" }],
        "write",
        () => {
          void promptWorkspacePath(ctx, "Candidate path, target path, optional --activate").then((value) => {
            const [candidatePath, targetPath, flag] = value?.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) ?? [];
            if (candidatePath && targetPath) {
              const suffix = flag === "--activate" ? " --activate" : "";
              void handleWorkspaceCommand(`write ${quoteArg(candidatePath)} ${quoteArg(targetPath)}${suffix}`, ctx, runtime);
            }
          });
        },
      ),
    },
    {
      id: "open",
      label: "Open editor",
      description: "Open the browser workspace calibrator.",
      currentValue: "select",
      submenu: selectSubmenu(
        "Open Workspace Editor",
        "Select open to launch the workspace calibrator.",
        [{ value: "open", label: "open" }],
        "open",
        () => {
          void handleWorkspaceCommand("open", ctx, runtime);
        },
      ),
    },
  ]);
}

async function promptWorkspacePath(ctx: ExtensionCommandContext, title: string): Promise<string | undefined> {
  try {
    const value = await ctx.ui.editor(title, "");
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
  } catch {
    ctx.ui.notify("Text input unavailable. Use the explicit /quailbot-workspace subcommand with path arguments.", "warning");
    return undefined;
  }
}

function quoteArg(value: string): string {
  return `"${value.replace(/"/g, "")}"`;
}

function launchWorkspaceCalibrator(url: string, ctx: ExtensionCommandContext): void {
  if (!ctx.hasUI || process.platform !== "win32") {
    return;
  }

  try {
    const child = spawn("cmd", ["/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.on("error", () => undefined);
    child.unref();
  } catch {
    // URL notification above is the recovery path; browser launch is best-effort only.
  }
}

function notifyJson(ctx: ExtensionCommandContext, title: string, value: unknown): void {
  ctx.ui.notify(`${title}\n${JSON.stringify(value, null, 2)}`, "info");
}

function workspaceWriteReadback(result: {
  candidatePath: string;
  targetPath: string;
  previousHash?: string;
  hash: string;
  summary: unknown;
}): Record<string, unknown> {
  return {
    candidatePath: result.candidatePath,
    targetPath: result.targetPath,
    previousHash: result.previousHash,
    hash: result.hash,
    summary: result.summary,
  };
}

export function splitCommandArgs(input: string): string[] {
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
