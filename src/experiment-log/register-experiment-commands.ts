import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import { openQuailbotSettingsMenu, selectSubmenu } from "../commands/quailbot-menu.js";
import {
  findExperimentEventsPath,
  listExperiments,
  readExperiment,
  type ReadExperimentResult,
} from "./experiment-log-reader.js";
import { experimentLogRoot } from "./experiment-log-service.js";
import type { ExperimentLogEvent } from "./experiment-log-types.js";

const SUBCOMMANDS = ["list", "show", "where"] as const;
const USAGE = "usage: /quailbot-experiments list|show <experiment-id>|where";

export function registerExperimentCommands(pi: ExtensionAPI): void {
  pi.registerCommand("quailbot-experiments", {
    description: "List, show, or locate Quailbot experiment logs (read-only).",
    getArgumentCompletions(prefix) {
      const trimmed = prefix.trim();
      return SUBCOMMANDS.filter((command) => command.startsWith(trimmed)).map((command) => ({
        value: command,
        label: command,
      }));
    },
    async handler(args, ctx) {
      await handleExperimentCommand(args, ctx);
    },
  });
}

async function handleExperimentCommand(args: string, ctx: ExtensionCommandContext): Promise<void> {
  const [command, ...rest] = splitCommandArgs(args);
  const root = experimentLogRoot(ctx.cwd);

  switch (command) {
    case undefined:
    case "":
      await openExperimentMenu(ctx);
      return;

    case "where": {
      ctx.ui.notify(`Quailbot experiment log root\n${root}`, "info");
      return;
    }

    case "list": {
      let summaries;
      try {
        summaries = listExperiments(root);
      } catch (error) {
        ctx.ui.notify(`Quailbot experiments list failed: ${errorMessage(error)}`, "warning");
        return;
      }
      notifyJson(ctx, "Quailbot experiments", summaries);
      return;
    }

    case "show": {
      const [experimentId] = rest;
      if (experimentId === undefined || experimentId.length === 0) {
        ctx.ui.notify("usage: /quailbot-experiments show <experiment-id>", "warning");
        return;
      }

      let eventsPath: string | undefined;
      try {
        eventsPath = findExperimentEventsPath(root, experimentId);
      } catch (error) {
        ctx.ui.notify(`Quailbot experiment lookup failed: ${errorMessage(error)}`, "warning");
        return;
      }
      if (eventsPath === undefined) {
        ctx.ui.notify(`Quailbot experiment not found: ${experimentId}`, "warning");
        return;
      }

      let detail: ReadExperimentResult;
      try {
        detail = readExperiment(eventsPath);
      } catch (error) {
        ctx.ui.notify(`Quailbot experiment read failed: ${errorMessage(error)}`, "warning");
        return;
      }

      const payload = buildShowPayload(detail);
      notifyJson(ctx, `Quailbot experiment ${experimentId}`, payload);
      return;
    }

    default:
      ctx.ui.notify(`unknown experiment command: ${command}\n${USAGE}`, "warning");
  }
}

async function openExperimentMenu(ctx: ExtensionCommandContext): Promise<void> {
  await openQuailbotSettingsMenu(ctx, [
    {
      id: "list",
      label: "List",
      description: "List available Quailbot experiment logs.",
      currentValue: "select",
      submenu: selectSubmenu(
        "List Experiments",
        "Select list to print experiment summaries.",
        [{ value: "list", label: "list" }],
        "list",
        () => {
          void handleExperimentCommand("list", ctx);
        },
      ),
    },
    {
      id: "show",
      label: "Show",
      description: "Show one experiment timeline by experiment id.",
      currentValue: "select",
      submenu: selectSubmenu(
        "Show Experiment",
        "Select show, then enter the experiment id.",
        [{ value: "show", label: "show" }],
        "show",
        () => {
          void promptText(ctx, "Experiment id").then((experimentId) => {
            if (experimentId) void handleExperimentCommand(`show "${experimentId.replace(/"/g, "")}"`, ctx);
          });
        },
      ),
    },
    {
      id: "where",
      label: "Where",
      description: "Print the experiment log root directory.",
      currentValue: "select",
      submenu: selectSubmenu(
        "Experiment Log Root",
        "Select where to print the experiment log root.",
        [{ value: "where", label: "where" }],
        "where",
        () => {
          void handleExperimentCommand("where", ctx);
        },
      ),
    },
  ]);
}

async function promptText(ctx: ExtensionCommandContext, title: string): Promise<string | undefined> {
  try {
    const value = await ctx.ui.editor(title, "");
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
  } catch {
    ctx.ui.notify("Text input unavailable. Use the explicit /quailbot-experiments subcommand with arguments.", "warning");
    return undefined;
  }
}

function buildShowPayload(detail: ReadExperimentResult): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    summary: detail.summary,
    timeline: detail.events.map(toTimelineStep),
  };
  if (detail.ignoredTail !== undefined) {
    payload.ignored_tail = detail.ignoredTail;
  }
  if (detail.ignoredLines !== undefined) {
    payload.ignored_lines = detail.ignoredLines;
  }
  return payload;
}

function toTimelineStep(event: ExperimentLogEvent): Record<string, unknown> {
  const base: Record<string, unknown> = {
    event_id: event.event_id,
    sequence: event.sequence,
    timestamp_utc: event.timestamp_utc,
    event_kind: event.event_kind,
  };

  switch (event.event_kind) {
    case "experiment_open":
      return {
        ...base,
        session_start_reason: event.session_start_reason,
        previous_session_file: event.previous_session_file,
        resumed: event.resumed,
      };

    case "tool_invocation_started":
      return {
        ...base,
        tool_call_id: event.tool_call_id,
        tool_name: event.tool_name,
      };

    case "tool_result":
      return {
        ...base,
        tool_call_id: event.tool_call_id,
        parent_event_id: event.parent_event_id,
        tool_name: event.tool_name,
        outcome: event.outcome,
        duration_ms: event.duration_ms,
      };

    case "tool_exception":
      return {
        ...base,
        tool_call_id: event.tool_call_id,
        parent_event_id: event.parent_event_id,
        tool_name: event.tool_name,
        outcome: event.outcome,
        duration_ms: event.duration_ms,
        error_message: event.error_message,
      };

    case "plan_step_result":
      return {
        ...base,
        tool_call_id: event.tool_call_id,
        parent_event_id: event.parent_event_id,
        outcome: event.outcome,
        step: {
          index: event.step.index,
          kind: event.step.kind,
        },
      };

    case "experiment_close":
      return {
        ...base,
        reason: event.reason,
        event_count: event.event_count,
        last_sequence: event.last_sequence,
      };
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
