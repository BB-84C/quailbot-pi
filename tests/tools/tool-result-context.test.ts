import { describe, expect, it } from "vitest";

import { projectQuailbotContextMessages } from "../../src/tools/tool-result-context.js";
import type { QuailbotToolResult } from "../../src/tools/tool-result.js";

type TestToolResultMessage = {
  role: "tool";
  toolCallId: string;
  toolName: string;
  content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }>;
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

  it("preserves image blocks for the newest Quailbot image result only", () => {
    const messages: TestToolResultMessage[] = [
      toolMessage("old-observe", "observe", observeWithRoi("old_roi"), [imageBlock("OLD_IMAGE_DATA")]),
      toolMessage("new-observe", "observe", observeWithRoi("new_roi"), [imageBlock("NEW_IMAGE_DATA")]),
    ];

    const projected = projectQuailbotContextMessages(messages, {
      recentImageResultCount: 1,
    });

    expect(projected[0].content).toHaveLength(1);
    expect(projected[0].content.some((item) => item.type === "image")).toBe(false);
    expect(textOf(projected[0])).toContain("old_roi image_path=C:\\tmp\\old_roi.png");

    expect(projected[1].content).toHaveLength(2);
    expect(projected[1].content[1]).toEqual({ type: "image", data: "NEW_IMAGE_DATA", mimeType: "image/png" });
    expect(textOf(projected[1])).toContain("new_roi image_path=C:\\tmp\\new_roi.png");
  });

  it("keeps only the newest hidden quailbot context message", () => {
    const oldContext = {
      role: "custom",
      customType: "quailbot-context",
      content: "old workspace context",
      display: false,
    };
    const newContext = {
      role: "custom",
      customType: "quailbot-context",
      content: "new workspace context",
      display: false,
    };
    const userMessage = { role: "user", content: "continue" };

    const projected = projectQuailbotContextMessages([oldContext, userMessage, newContext]);

    expect(projected).toEqual([userMessage, newContext]);
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

function toolMessage(
  toolCallId: string,
  toolName: string,
  details: QuailbotToolResult,
  extraContent: TestToolResultMessage["content"] = [],
): TestToolResultMessage {
  return {
    role: "tool",
    toolCallId,
    toolName,
    content: [{ type: "text", text: "stale model-facing tool content" }, ...extraContent],
    details,
    createdAt: "2026-06-15T00:00:00.000Z",
  };
}

function textOf(message: TestToolResultMessage): string {
  return message.content.flatMap((item) => (item.type === "text" ? [item.text] : [])).join("\n");
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

function observeWithRoi(ref: string): QuailbotToolResult {
  return {
    ok: true,
    action: "observe",
    action_input: { rois: [ref] },
    primary_result: {
      requested_rois: [ref],
      channels: {
        roi: {
          results: {
            [ref]: {
              ok: true,
              ref,
              image_path: `C:\\tmp\\${ref}.png`,
              mime_type: "image/png",
              width: 10,
              height: 20,
              attached_image: true,
            },
          },
          warnings: [],
        },
      },
    },
  };
}

function imageBlock(data: string): { type: "image"; data: string; mimeType: string } {
  return { type: "image", data, mimeType: "image/png" };
}
