import { describe, expect, it } from "vitest";

import {
  buildQuailbotToolContent,
  DEFAULT_RECENT_FULL_CLI_RESULT_COUNT,
  projectQuailbotToolResult,
} from "../../src/tools/tool-result-projection.js";
import type { QuailbotToolResult } from "../../src/tools/tool-result.js";

describe("tool result projection", () => {
  it("summarizes parsed cli_get payload without duplicating raw stdout", () => {
    const projection = projectQuailbotToolResult(cliGetBiasResult());
    const content = buildQuailbotToolContent(cliGetBiasResult());

    expect(projection.status).toBe("ok");
    expect(projection.action).toBe("cli_get");
    expect(projection.target).toBe("nqctl:bias_v");
    expect(projection.parseStatus).toBe("parsed_payload");
    expect(content).toContain("cli_get nqctl:bias_v [ok, parsed_payload]");
    expect(content).toContain("value: 0.17");
    expect(content).toContain("fields: Bias value=0.17");
    expect(content).not.toContain("RAW_STDOUT_SHOULD_NOT_APPEAR_WHEN_PAYLOAD_EXISTS");
  });

  it("uses parsed cli_get payload in recent-full mode without duplicating raw stdout", () => {
    const content = buildQuailbotToolContent(cliGetBiasResult(), {
      mode: "recent-full",
      fullMaxChars: 1200,
    });

    expect(content).toContain("cli_get nqctl:bias_v [ok, parsed_payload]");
    expect(content).toContain("value: 0.17");
    expect(content).toContain("fields: Bias value=0.17");
    expect(content).not.toContain("RAW_STDOUT_SHOULD_NOT_APPEAR_WHEN_PAYLOAD_EXISTS");
  });

  it("surfaces unparsed successful stdout with a bounded preview", () => {
    const content = buildQuailbotToolContent(cliGetScanSpeedUnparsed(), { summaryMaxChars: 700 });
    const projection = projectQuailbotToolResult(cliGetScanSpeedUnparsed(), { summaryMaxChars: 700 });

    expect(projection.parseStatus).toBe("payload_parse_failed_nonstandard_json");
    expect(content).toContain("cli_get nqctl:scan_speed [ok, payload_parse_failed_nonstandard_json]");
    expect(content).toContain("stdout_preview:");
    expect(content).toContain("Infinity");
    expect(content).toContain("truncated");
    expect(content.length).toBeLessThanOrEqual(700);
  });

  it("uses recent-full mode for bounded raw diagnostic detail", () => {
    const content = buildQuailbotToolContent(cliActionUnparsedFailure("RECENT_ACTION_FAILURE_SENTINEL"), {
      mode: "recent-full",
      fullMaxChars: 1200,
    });

    expect(content).toContain("cli_action nqctl:Scan_Action [fail, exit=3, payload_parse_failed_non_json_prefix]");
    expect(content).toContain("RECENT_ACTION_FAILURE_SENTINEL");
    expect(content).toContain("full raw result retained in tool details");
    expect(content.length).toBeLessThanOrEqual(1200);
  });

  it("defaults recentFullCliResultCount to two", () => {
    expect(DEFAULT_RECENT_FULL_CLI_RESULT_COUNT).toBe(2);
  });
});

function cliGetBiasResult(): QuailbotToolResult {
  return {
    ok: true,
    action: "cli_get",
    action_input: { cli_name: "nqctl", parameter: "bias_v" },
    primary_result: {
      parameter: "bias_v",
      ok: true,
      exit_code: 0,
      stdout: "RAW_STDOUT_SHOULD_NOT_APPEAR_WHEN_PAYLOAD_EXISTS",
      stderr: "",
      payload: { value: 0.17, fields: { "Bias value": 0.17 } },
      argv: ["nqctl", "get", "bias_v"],
    },
  };
}

function cliGetScanSpeedUnparsed(): QuailbotToolResult {
  return {
    ok: true,
    action: "cli_get",
    action_input: { cli_name: "nqctl", parameter: "scan_speed" },
    primary_result: {
      parameter: "scan_speed",
      ok: true,
      exit_code: 0,
      stdout: `{"parameter":"scan_speed","value":{"Backward time per line": Infinity},"tail":"${"Y".repeat(5000)}"}`,
      stderr: "",
      payload: undefined,
      argv: ["nqctl", "get", "scan_speed"],
    },
  };
}

function cliActionUnparsedFailure(sentinel: string): QuailbotToolResult {
  return {
    ok: false,
    action: "cli_action",
    action_input: { cli_name: "nqctl", action_name: "Scan_Action", args: { action: "start" } },
    primary_result: {
      action_name: "Scan_Action",
      args: { action: "start" },
      ok: false,
      exit_code: 3,
      stdout: `${sentinel}\n{"error":"instrument rejected scan start"}`,
      stderr: "scan failed before motion started",
      payload: undefined,
      argv: ["nqctl", "act", "Scan_Action", "--arg", "action=start"],
    },
  };
}
