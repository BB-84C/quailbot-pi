import { describe, expect, it } from "vitest";

import { projectQuailbotContextMessages } from "../../src/tools/tool-result-context.js";
import type { QuailbotToolResult } from "../../src/tools/tool-result.js";

type TestToolResultMessage = {
  role: "tool";
  toolCallId: string;
  toolName: string;
  content: Array<{ type: "text"; text: string }>;
  details?: unknown;
  createdAt?: string;
};

describe("tool result context projection", () => {
  it("keeps only the newest two direct CLI results in recent-full mode", () => {
    const messages: TestToolResultMessage[] = [
      toolMessage("old-unparsed", "cli_get", cliGetUnparsed("old_unparsed", `${"X".repeat(500)}OLD_UNPARSED_RAW_MARKER`)),
      toolMessage("old-parsed", "cli_get", cliGetParsed("old_parsed", "OLD_PARSED_RAW_MARKER")),
      toolMessage("newer-action", "cli_action", cliActionUnparsed("NEWER_ACTION_RAW_MARKER")),
      toolMessage("newest-get", "cli_get", cliGetUnparsed("newest_get", "NEWEST_GET_RAW_MARKER")),
    ];

    const projected = projectQuailbotContextMessages(messages, {
      recentFullCliResultCount: 2,
      summaryMaxChars: 220,
      fullMaxChars: 1200,
    });

    expect(projected.map((message) => message.toolCallId)).toEqual([
      "old-unparsed",
      "old-parsed",
      "newer-action",
      "newest-get",
    ]);
    expect(textOf(projected[0])).toContain("cli_get nqctl:old_unparsed");
    expect(textOf(projected[0])).toContain("stdout_preview:");
    expect(textOf(projected[0])).not.toContain("full raw result retained in tool details");
    expect(textOf(projected[0])).not.toContain("OLD_UNPARSED_RAW_MARKER");
    expect(textOf(projected[1])).toContain("value: 0.17");
    expect(textOf(projected[1])).not.toContain("OLD_PARSED_RAW_MARKER");
    expect(textOf(projected[2])).toContain("full raw result retained in tool details");
    expect(textOf(projected[2])).toContain("NEWER_ACTION_RAW_MARKER");
    expect(textOf(projected[3])).toContain("full raw result retained in tool details");
    expect(textOf(projected[3])).toContain("NEWEST_GET_RAW_MARKER");
  });

  it("never treats plan-and-execute as a direct CLI result", () => {
    const messages: TestToolResultMessage[] = [
      toolMessage("plan", "quailbot_plan_and_execute", planAndExecuteWithNestedRaw()),
      toolMessage("direct", "cli_get", cliGetUnparsed("bias_v", "DIRECT_RAW_MARKER")),
    ];

    const projected = projectQuailbotContextMessages(messages, {
      recentFullCliResultCount: 2,
      fullMaxChars: 1200,
    });

    expect(textOf(projected[0])).toContain("quailbot_plan_and_execute plan [ok, aggregate_result]");
    expect(textOf(projected[0])).toContain("#0 cli_get [ok] value=0.18");
    expect(textOf(projected[0])).not.toContain("full raw result retained in tool details");
    expect(textOf(projected[0])).not.toContain("PLAN_NESTED_RAW_MARKER");
    expect(textOf(projected[1])).toContain("full raw result retained in tool details");
    expect(textOf(projected[1])).toContain("DIRECT_RAW_MARKER");
  });

  it("leaves malformed and non-Quailbot tool messages unchanged", () => {
    const malformed: TestToolResultMessage = {
      role: "tool",
      toolCallId: "malformed",
      toolName: "cli_get",
      content: [{ type: "text", text: "original malformed content" }],
      details: { ok: true, action: "cli_get" },
      createdAt: "2026-06-15T00:00:00.000Z",
    };
    const nonQuailbot: TestToolResultMessage = {
      role: "tool",
      toolCallId: "other",
      toolName: "foreign_tool",
      content: [{ type: "text", text: "foreign content" }],
      details: undefined,
    };

    const projected = projectQuailbotContextMessages([malformed, nonQuailbot]);

    expect(projected[0]).toBe(malformed);
    expect(projected[1]).toBe(nonQuailbot);
  });
});

function toolMessage(toolCallId: string, toolName: string, details: QuailbotToolResult): TestToolResultMessage {
  return {
    role: "tool",
    toolCallId,
    toolName,
    content: [{ type: "text", text: "stale model-facing tool content" }],
    details,
    createdAt: "2026-06-15T00:00:00.000Z",
  };
}

function textOf(message: TestToolResultMessage): string {
  return message.content.map((item) => item.text).join("\n");
}

function cliGetUnparsed(parameter: string, stdout: string): QuailbotToolResult {
  return {
    ok: true,
    action: "cli_get",
    action_input: { cli_name: "nqctl", parameter },
    primary_result: {
      parameter,
      ok: true,
      exit_code: 0,
      stdout,
      stderr: "",
      argv: ["nqctl", "get", parameter],
    },
  };
}

function cliGetParsed(parameter: string, stdout: string): QuailbotToolResult {
  return {
    ok: true,
    action: "cli_get",
    action_input: { cli_name: "nqctl", parameter },
    primary_result: {
      parameter,
      ok: true,
      exit_code: 0,
      stdout,
      stderr: "",
      payload: { value: 0.17 },
      argv: ["nqctl", "get", parameter],
    },
  };
}

function cliActionUnparsed(stdout: string): QuailbotToolResult {
  return {
    ok: false,
    action: "cli_action",
    action_input: { cli_name: "nqctl", action_name: "Scan_Action" },
    primary_result: {
      action_name: "Scan_Action",
      ok: false,
      exit_code: 3,
      stdout,
      stderr: "instrument failed",
      argv: ["nqctl", "action", "Scan_Action"],
    },
  };
}

function planAndExecuteWithNestedRaw(): QuailbotToolResult {
  return {
    ok: true,
    action: "quailbot_plan_and_execute",
    action_input: { steps: [{ tool: "cli_get", args: { parameter: "bias_v" } }] },
    primary_result: {
      stopped_reason: "completed",
      steps: [
        {
          index: 0,
          kind: "cli_get",
          primary_result: {
            ok: true,
            stdout: "PLAN_NESTED_RAW_MARKER",
            payload: { value: 0.18 },
          },
        },
      ],
    },
  };
}
