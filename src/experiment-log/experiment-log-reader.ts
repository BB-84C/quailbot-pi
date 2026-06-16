import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

import type { ExperimentLogEvent, ExperimentOutcome, WorkspaceSnapshot } from "./experiment-log-types.js";

export type ExperimentLogStatus = "closed" | "interrupted_unknown" | "open";

export type ExperimentLogSummary = {
  experiment_id: string;
  events_path: string;
  started_at?: string;
  closed_at?: string;
  status: ExperimentLogStatus;
  workspace?: WorkspaceSnapshot;
  event_count: number;
  outcome_counts: Partial<Record<ExperimentOutcome, number>>;
};

export type ReadExperimentResult = {
  events_path: string;
  events: ExperimentLogEvent[];
  summary: ExperimentLogSummary;
  ignoredTail?: string;
};

export function listExperiments(root: string): ExperimentLogSummary[] {
  return findEventsJsonl(root)
    .map((eventsPath) => readExperiment(eventsPath).summary)
    .sort((left, right) => {
      const started = (right.started_at ?? "").localeCompare(left.started_at ?? "");
      return started === 0 ? right.events_path.localeCompare(left.events_path) : started;
    });
}

export function readExperiment(eventsPath: string): ReadExperimentResult {
  const { lines, ignoredTail } = completeLines(readFileSync(eventsPath, "utf8"));
  const events = lines.map((line) => JSON.parse(line) as ExperimentLogEvent);
  const summary = summarize(eventsPath, events);

  return {
    events_path: eventsPath,
    events,
    summary,
    ...withDefined("ignoredTail", ignoredTail),
  };
}

export function findExperimentEventsPath(root: string, experimentId: string): string | undefined {
  for (const eventsPath of findEventsJsonl(root)) {
    if (readExperiment(eventsPath).summary.experiment_id === experimentId) {
      return eventsPath;
    }
  }

  return undefined;
}

function findEventsJsonl(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }

  const results: string[] = [];
  const entries = readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...findEventsJsonl(path));
    } else if (entry.isFile() && entry.name === "events.jsonl") {
      results.push(path);
    }
  }

  return results;
}

function completeLines(content: string): { lines: string[]; ignoredTail?: string } {
  if (content.length === 0) {
    return { lines: [] };
  }

  const endsWithNewline = content.endsWith("\n");
  const completeContent = endsWithNewline ? content : content.slice(0, lastLineBreak(content) + 1);
  const ignoredTail = endsWithNewline ? undefined : content.slice(lastLineBreak(content) + 1);
  const lines = completeContent.split("\n").filter((line) => line.length > 0);

  return { lines, ...withDefined("ignoredTail", ignoredTail) };
}

function summarize(eventsPath: string, events: ExperimentLogEvent[]): ExperimentLogSummary {
  const opened = events.find((event) => event.event_kind === "experiment_open");
  const closed = [...events].reverse().find((event) => event.event_kind === "experiment_close");
  const status = closed === undefined ? (events.length === 0 ? "open" : "interrupted_unknown") : "closed";
  const outcomeCounts = outcomeCountsFor(events);
  if (status === "interrupted_unknown") {
    incrementOutcome(outcomeCounts, "interrupted_unknown");
  }

  return {
    experiment_id: opened?.experiment_id ?? events[0]?.experiment_id ?? basename(join(eventsPath, "..")),
    events_path: eventsPath,
    ...withDefined("started_at", opened?.timestamp_utc ?? events[0]?.timestamp_utc),
    ...withDefined("closed_at", closed?.timestamp_utc),
    status,
    ...withDefined("workspace", latestWorkspace(events)),
    event_count: events.length,
    outcome_counts: outcomeCounts,
  };
}

function outcomeCountsFor(events: ExperimentLogEvent[]): Partial<Record<ExperimentOutcome, number>> {
  const counts: Partial<Record<ExperimentOutcome, number>> = {};
  for (const event of events) {
    const outcome = "outcome" in event ? event.outcome : undefined;
    if (outcome !== undefined) {
      incrementOutcome(counts, outcome);
    }
  }

  return counts;
}

function latestWorkspace(events: ExperimentLogEvent[]): WorkspaceSnapshot | undefined {
  for (const event of [...events].reverse()) {
    if (event.workspace !== undefined) {
      return event.workspace;
    }
  }

  return undefined;
}

function incrementOutcome(counts: Partial<Record<ExperimentOutcome, number>>, outcome: ExperimentOutcome): void {
  counts[outcome] = (counts[outcome] ?? 0) + 1;
}

function lastLineBreak(content: string): number {
  return content.lastIndexOf("\n");
}

function withDefined<TKey extends string, TValue>(key: TKey, value: TValue | undefined): Record<TKey, TValue> | {} {
  return value === undefined ? {} : { [key]: value } as Record<TKey, TValue>;
}
