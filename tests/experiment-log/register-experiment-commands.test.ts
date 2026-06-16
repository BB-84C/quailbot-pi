import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  EXPERIMENT_LOG_SCHEMA_VERSION,
  type ExperimentLogEvent,
} from "../../src/experiment-log/experiment-log-types.js";
import { registerExperimentCommands } from "../../src/experiment-log/register-experiment-commands.js";

type Notification = { message: string; type: "info" | "warning" | "error" };

type RegisteredCommandRecord = {
  name: string;
  description?: string;
  getArgumentCompletions?: (
    prefix: string,
  ) => Array<{ value: string; label: string }> | null | Promise<Array<{ value: string; label: string }> | null>;
  handler: (args: string, ctx: FakeCommandContext) => Promise<void>;
};

type FakeCommandContext = {
  cwd: string;
  hasUI: boolean;
  ui: { notify: (message: string, type?: "info" | "warning" | "error") => void };
  notifications: Notification[];
};

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("registerExperimentCommands", () => {
  it("registers the quailbot-experiments command with subcommand completions", () => {
    const { commands } = registerWithFakePi();

    expect(commands).toHaveLength(1);
    const command = commands[0]!;
    expect(command.name).toBe("quailbot-experiments");
    expect(command.description).toBeTypeOf("string");
    expect(command.description ?? "").not.toHaveLength(0);

    const completions = command.getArgumentCompletions?.("");
    const completionValues = Array.isArray(completions)
      ? completions.map((entry) => entry.value)
      : [];
    expect(completionValues).toEqual(expect.arrayContaining(["list", "show", "where"]));

    const filtered = command.getArgumentCompletions?.("sh");
    expect(Array.isArray(filtered) ? filtered.map((entry) => entry.value) : []).toEqual(["show"]);
  });

  it("where notifies the experiment log root computed from ctx.cwd", async () => {
    const { commands } = registerWithFakePi();
    const command = commands[0]!;
    const cwd = makeTempDir();
    const ctx = makeCtx(cwd);

    await command.handler("where", ctx);

    expect(ctx.notifications).toHaveLength(1);
    const entry = ctx.notifications[0]!;
    expect(entry.type).toBe("info");
    expect(entry.message).toContain(join(cwd, ".quailbot-pi", "experiments"));
  });

  it("list reports a closed experiment summary as JSON", async () => {
    const { commands } = registerWithFakePi();
    const command = commands[0]!;
    const cwd = makeTempDir();
    seedExperiment(cwd, "2026/06/16/exp_closed", [
      event({
        event_id: "evt-open",
        experiment_id: "exp_closed",
        sequence: 1,
        timestamp_utc: "2026-06-16T06:30:00.000Z",
        event_kind: "experiment_open",
      }),
      event({
        event_id: "evt-close",
        experiment_id: "exp_closed",
        sequence: 2,
        timestamp_utc: "2026-06-16T06:35:00.000Z",
        event_kind: "experiment_close",
        reason: "session_shutdown",
        event_count: 2,
        last_sequence: 2,
      }),
    ]);

    const ctx = makeCtx(cwd);
    await command.handler("list", ctx);

    expect(ctx.notifications).toHaveLength(1);
    const entry = ctx.notifications[0]!;
    expect(entry.type).toBe("info");
    expect(entry.message.startsWith("Quailbot experiments\n")).toBe(true);
    const payload = parseJsonAfterTitle(entry.message);
    expect(Array.isArray(payload)).toBe(true);
    expect(payload).toHaveLength(1);
    const summary = (payload as Array<Record<string, unknown>>)[0]!;
    expect(summary.experiment_id).toBe("exp_closed");
    expect(summary.status).toBe("closed");
  });

  it("show <id> returns timeline event kinds and summary for an interrupted experiment", async () => {
    const { commands } = registerWithFakePi();
    const command = commands[0]!;
    const cwd = makeTempDir();
    seedExperiment(cwd, "2026/06/16/exp_interrupted", [
      event({
        event_id: "evt-open",
        experiment_id: "exp_interrupted",
        sequence: 1,
        timestamp_utc: "2026-06-16T06:30:00.000Z",
        event_kind: "experiment_open",
      }),
      event({
        event_id: "evt-result",
        experiment_id: "exp_interrupted",
        sequence: 2,
        timestamp_utc: "2026-06-16T06:31:00.000Z",
        event_kind: "tool_result",
        outcome: "measured",
        result: { ok: true, action: "cli_get", action_input: {}, primary_result: { ok: true } },
      }),
    ]);

    const ctx = makeCtx(cwd);
    await command.handler("show exp_interrupted", ctx);

    expect(ctx.notifications).toHaveLength(1);
    const entry = ctx.notifications[0]!;
    expect(entry.type).toBe("info");
    expect(entry.message.startsWith("Quailbot experiment exp_interrupted\n")).toBe(true);
    const payload = parseJsonAfterTitle(entry.message) as Record<string, unknown>;
    expect(payload.summary).toMatchObject({ experiment_id: "exp_interrupted", status: "interrupted_unknown" });
    const timeline = payload.timeline as Array<Record<string, unknown>>;
    expect(timeline.map((step) => step.event_kind)).toEqual(["experiment_open", "tool_result"]);
    expect(timeline[1]).toMatchObject({ event_kind: "tool_result", outcome: "measured" });
  });

  it("show <id> surfaces ignored_tail when the experiment log has a partial trailing line", async () => {
    const { commands } = registerWithFakePi();
    const command = commands[0]!;
    const cwd = makeTempDir();
    const eventsRoot = join(cwd, ".quailbot-pi", "experiments", "2026", "06", "16", "exp_partial");
    mkdirSync(eventsRoot, { recursive: true });
    writeFileSync(
      join(eventsRoot, "events.jsonl"),
      [
        JSON.stringify(
          event({
            event_id: "evt-open",
            experiment_id: "exp_partial",
            sequence: 1,
            timestamp_utc: "2026-06-16T06:30:00.000Z",
            event_kind: "experiment_open",
          }),
        ),
        "{\"event_kind\":\"tool_result\"",
      ].join("\n"),
      "utf8",
    );

    const ctx = makeCtx(cwd);
    await command.handler("show exp_partial", ctx);

    expect(ctx.notifications).toHaveLength(1);
    const payload = parseJsonAfterTitle(ctx.notifications[0]!.message) as Record<string, unknown>;
    expect(payload.ignored_tail).toBe("{\"event_kind\":\"tool_result\"");
  });

  it("show without an id emits a usage warning and does not mutate logs", async () => {
    const { commands } = registerWithFakePi();
    const command = commands[0]!;
    const cwd = makeTempDir();
    const ctx = makeCtx(cwd);

    await command.handler("show", ctx);

    expect(ctx.notifications).toHaveLength(1);
    expect(ctx.notifications[0]!.type).toBe("warning");
    expect(ctx.notifications[0]!.message.toLowerCase()).toContain("usage");
  });

  it("show <unknown-id> emits a warning when no experiment matches", async () => {
    const { commands } = registerWithFakePi();
    const command = commands[0]!;
    const cwd = makeTempDir();
    const ctx = makeCtx(cwd);

    await command.handler("show exp_missing", ctx);

    expect(ctx.notifications).toHaveLength(1);
    expect(ctx.notifications[0]!.type).toBe("warning");
    expect(ctx.notifications[0]!.message).toContain("exp_missing");
  });

  it("an unknown subcommand emits a usage warning", async () => {
    const { commands } = registerWithFakePi();
    const command = commands[0]!;
    const ctx = makeCtx(makeTempDir());

    await command.handler("destroy", ctx);

    expect(ctx.notifications).toHaveLength(1);
    expect(ctx.notifications[0]!.type).toBe("warning");
    expect(ctx.notifications[0]!.message.toLowerCase()).toContain("usage");
  });
});

function registerWithFakePi(): { commands: RegisteredCommandRecord[] } {
  const commands: RegisteredCommandRecord[] = [];
  const pi = {
    registerCommand(name: string, options: Omit<RegisteredCommandRecord, "name">) {
      commands.push({ name, ...options });
    },
  } as unknown as Parameters<typeof registerExperimentCommands>[0];
  registerExperimentCommands(pi);
  return { commands };
}

function makeCtx(cwd: string): FakeCommandContext {
  const notifications: Notification[] = [];
  return {
    cwd,
    hasUI: true,
    notifications,
    ui: {
      notify(message: string, type: "info" | "warning" | "error" = "info") {
        notifications.push({ message, type });
      },
    },
  };
}

function seedExperiment(cwd: string, relativePath: string, events: ExperimentLogEvent[]): string {
  const eventsPath = join(cwd, ".quailbot-pi", "experiments", ...relativePath.split("/"), "events.jsonl");
  mkdirSync(dirname(eventsPath), { recursive: true });
  writeFileSync(eventsPath, `${events.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
  return eventsPath;
}

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "quailbot-experiment-cmd-"));
  tempDirs.push(dir);
  return dir;
}

function parseJsonAfterTitle(message: string): unknown {
  const newlineIndex = message.indexOf("\n");
  expect(newlineIndex).toBeGreaterThanOrEqual(0);
  return JSON.parse(message.slice(newlineIndex + 1));
}

function event(overrides: Partial<ExperimentLogEvent>): ExperimentLogEvent {
  return {
    schema_version: EXPERIMENT_LOG_SCHEMA_VERSION,
    event_id: "evt-default",
    experiment_id: "exp_default",
    sequence: 1,
    timestamp_utc: "2026-06-16T06:30:00.000Z",
    event_kind: "experiment_open",
    ...overrides,
  } as ExperimentLogEvent;
}
