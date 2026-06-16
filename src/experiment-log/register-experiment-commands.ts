import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

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
      ctx.ui.notify(USAGE, "warning");
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

function buildShowPayload(detail: ReadExperimentResult): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    summary: detail.summary,
    timeline: detail.events.map(toTimelineStep),
  };
  if (detail.ignoredTail !== undefined) {
    payload.ignored_tail = detail.ignoredTail;
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
  if ("tool_name" in event) {
    base.tool_name = event.tool_name;
  }
  if ("tool_call_id" in event) {
    base.tool_call_id = event.tool_call_id;
  }
  if ("outcome" in event) {
    base.outcome = event.outcome;
  }
  if ("reason" in event) {
    base.reason = event.reason;
  }
  return base;
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
