import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import quailbotExtension from "../src/extension.js";
import { experimentLogRoot } from "../src/experiment-log/experiment-log-service.js";

type Handler = (event: unknown, ctx: unknown) => unknown | Promise<unknown>;

describe("experiment lifecycle", () => {
  it("defers creation until a real prompt and resumes the same indexed experiment", async () => {
    const cwd = process.cwd();
    const handlers = new Map<string, Handler>();
    quailbotExtension({
      on: (event: string, handler: Handler) => handlers.set(event, handler),
      registerTool: () => undefined,
      registerCommand: () => undefined,
    } as never);
    const ctx = { cwd, hasUI: false, sessionManager: { getSessionId: () => "session-a" } };

    await handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, ctx);
    expect(existsSync(experimentLogRoot(cwd))).toBe(false);

    await handlers.get("before_agent_start")?.(
      { type: "before_agent_start", prompt: "measure", systemPrompt: "", systemPromptOptions: { cwd } },
      ctx,
    );
    const initialPath = onlyEventsPath(experimentLogRoot(cwd));

    await handlers.get("session_start")?.({ type: "session_start", reason: "resume" }, ctx);
    await handlers.get("before_agent_start")?.(
      { type: "before_agent_start", prompt: "measure again", systemPrompt: "", systemPromptOptions: { cwd } },
      ctx,
    );

    expect(onlyEventsPath(experimentLogRoot(cwd))).toBe(initialPath);
    expect(readFileSync(initialPath, "utf8")).toContain('"resumed":true');
    expect(readFileSync(initialPath, "utf8")).toContain('"session_start_reason":"resume"');
  });
});

function onlyEventsPath(root: string): string {
  const dateDir = readdirSync(root, { withFileTypes: true }).find((entry) => entry.isDirectory());
  if (dateDir === undefined) throw new Error("missing experiment date directory");
  const experimentDir = readdirSync(join(root, dateDir.name), { withFileTypes: true }).find((entry) => entry.isDirectory());
  if (experimentDir === undefined) throw new Error("missing experiment directory");
  return join(root, dateDir.name, experimentDir.name, "events.jsonl");
}
