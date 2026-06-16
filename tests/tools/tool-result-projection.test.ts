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

  it("surfaces structured errors without stdout", () => {
    const content = buildQuailbotToolContent(roiBackendUnavailableResult());

    expect(content).toContain("observe [fail, payload_absent_empty_stdout]");
    expect(content).toContain("error_type: roi_backend_unavailable");
    expect(content).toContain("message: ROI screenshot/OCR backend is not configured in this plugin implementation round.");
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

  it("summarizes mutating linked-observable readback and unresolved refs", () => {
    const text = buildQuailbotToolContent(cliSetWithLinkedReadback());

    expect(text).toContain("cli_set nqctl:bias_v [ok, parsed_payload]");
    expect(text).toContain("set: Bias_value_V=0.18");
    expect(text).toContain("driver result: command=Bias_Set applied=true dry_run=false");
    expect(text).toContain("readback:");
    expect(text).toContain("nqctl:bias_v = 0.180000007 [parsed_payload]");
    expect(text).toContain("unresolved:");
    expect(text).toContain("nqctl:current_a");
    expect(text).not.toContain("LINKED_STDOUT_SHOULD_NOT_APPEAR");
  });

  it("summarizes ramp reports without dumping plan arrays", () => {
    const text = buildQuailbotToolContent(cliRampVerboseResult());

    expect(text).toContain("cli_ramp nqctl:bias_v [ok, parsed_payload]");
    expect(text).toContain("ramp: 0.18 -> 0.19 step=0.01 interval=0");
    expect(text).toContain("attempted_steps=2 applied_steps=2 final_value=0.19");
    expect(text).not.toContain("VERBOSE_PLAN_SENTINEL");
    expect(text).not.toContain("VERBOSE_REPORT_SENTINEL");
  });

  it("summarizes plan-and-execute as ordered steps without raw nested stdout", () => {
    const text = buildQuailbotToolContent(planAndExecuteResult());

    expect(text).toContain("quailbot_plan_and_execute plan [ok, aggregate_result]");
    expect(text).toContain("stopped_reason: completed");
    expect(text).toContain("#0 cli_set [ok] readback nqctl:bias_v=0.18");
    expect(text).toContain("#1 cli_get [ok] value=0.18");
    expect(text).not.toContain("NESTED_STDOUT_SHOULD_NOT_APPEAR");
  });

  it("surfaces nested plan cli parse failures without dumping full stdout", () => {
    const text = buildQuailbotToolContent(planWithNestedCliActionParseFailure());

    expect(text).toContain("quailbot_plan_and_execute plan [fail, aggregate_result]");
    expect(text).toContain("#0 cli_action [fail]");
    expect(text).toContain("payload_parse_failed_non_json_prefix");
    expect(text).toContain("Start action timeout");
    expect(text).not.toContain("NanonisProtocolError");
    expect(text).not.toContain('"exit_code": 3');
  });

  it("keeps failed plan primary diagnostics when linked readback exists", () => {
    const text = buildQuailbotToolContent(planWithFailedPrimaryAndLinkedReadback());

    expect(text).toContain("#0 cli_set [fail]");
    expect(text).toContain("readback nqctl:bias_v=0.18");
    expect(text).toContain("exit=3");
    expect(text).toContain("instrument_error");
    expect(text).toContain("set failed");
    expect(text).not.toContain("PRIMARY_FAILURE_STDOUT_SHOULD_NOT_APPEAR");
  });

  it("preserves failed plan linked readback diagnostics without raw stdout", () => {
    const text = buildQuailbotToolContent(planWithFailedLinkedReadbackStep());

    expect(text).toContain("#0 cli_set [ok] readback nqctl:current_a");
    expect(text).toContain("readback_exception");
    expect(text).toContain("readback blew up");
    expect(text).not.toContain("PLAN_LINKED_FAILURE_STDOUT_SHOULD_NOT_APPEAR");
  });

  it("surfaces plan validation errors", () => {
    const text = buildQuailbotToolContent(planValidationErrorResult());

    expect(text).toContain("stopped_reason: validation_failed");
    expect(text).toContain("validation_error: mutation policy disabled");
  });

  it("marks failed GUI plan steps as fail", () => {
    const text = buildQuailbotToolContent(planWithFailedGuiStepResult());

    expect(text).toContain("#0 observe [fail]");
    expect(text).toContain("error_type=roi_backend_unavailable");
    expect(text).toContain("ROI screenshot/OCR backend is not configured in this plugin implementation round.");
  });

  it("surfaces linked readback failures without raw stdout", () => {
    const text = buildQuailbotToolContent(cliSetWithLinkedFailureReadback());

    expect(text).toContain("nqctl:current_a");
    expect(text).toContain("readback_exception");
    expect(text).toContain("readback blew up");
    expect(text).not.toContain("LINKED_FAILURE_STDOUT_SHOULD_NOT_APPEAR");
  });

  it("preserves planwrite semantic text in model-visible projection", () => {
    const text = buildQuailbotToolContent(planwriteEphemeralResult());

    expect(text).toContain("quailbot_planwrite [ok, structured_result]");
    expect(text).toContain("mode: ephemeral");
    expect(text).toContain("cleaned: true");
    expect(text).toContain("persisted: false");
    expect(text).toContain("text: Keep bias ramp below 0.20 V before readback");
    expect(text).not.toContain("stdout_preview: <empty>");
  });

  it("defaults recentFullCliResultCount to two", () => {
    expect(DEFAULT_RECENT_FULL_CLI_RESULT_COUNT).toBe(2);
  });

  it("classifies actual nqctl stdout quirks observed on simulator runs", () => {
    const actionFailure = buildQuailbotToolContent(cliActionUnparsedFailure(NQCTL_SCAN_ACTION_TIMEOUT_STDOUT));
    const scanSpeed = buildQuailbotToolContent(cliGetScanSpeedUnparsed(NQCTL_SCAN_SPEED_INFINITY_STDOUT));

    expect(actionFailure).toContain("payload_parse_failed_non_json_prefix");
    expect(actionFailure).toContain("Start action timeout");
    expect(scanSpeed).toContain("payload_parse_failed_nonstandard_json");
    expect(scanSpeed).toContain("Infinity");
  });
});

// Observed in A5 grounded nqctl simulator recon on 2026-06-15: scan-speed get
// returned JSON-shaped stdout containing the JavaScript token Infinity, which is
// not valid JSON and must stay classified as nonstandard JSON diagnostics.
const NQCTL_SCAN_SPEED_INFINITY_STDOUT = `{
  "parameter": "scan_speed",
  "value": { "Backward time per line": Infinity },
  "fields": { "Backward time per line": Infinity },
  "timestamp_utc": "2026-06-15T17:46:03.394799Z"
}`;

// Observed in A5 grounded nqctl simulator recon on 2026-06-15: scan action
// timeout stdout began with a human diagnostic before any JSON-shaped payload.
const NQCTL_SCAN_ACTION_TIMEOUT_STDOUT = `The following error appeared:
 Start action timeout
{
  "error": {
    "message": "Controller returned error for command 'Scan_Action' (Scan_Action): Start action timeout",
    "type": "NanonisProtocolError"
  },
  "exit_code": 3,
  "ok": false
}`;

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

function planwriteEphemeralResult(): QuailbotToolResult {
  return {
    ok: true,
    action: "quailbot_planwrite",
    action_input: { mode: "ephemeral", text: "Keep bias ramp below 0.20 V before readback", clean: true },
    primary_result: {
      mode: "ephemeral",
      cleaned: true,
      persisted: false,
      text: "Keep bias ramp below 0.20 V before readback",
    },
  };
}

function cliGetScanSpeedUnparsed(
  stdout = `{"parameter":"scan_speed","value":{"Backward time per line": Infinity},"tail":"${"Y".repeat(5000)}"}`,
): QuailbotToolResult {
  return {
    ok: true,
    action: "cli_get",
    action_input: { cli_name: "nqctl", parameter: "scan_speed" },
    primary_result: {
      parameter: "scan_speed",
      ok: true,
      exit_code: 0,
      stdout,
      stderr: "",
      payload: undefined,
      argv: ["nqctl", "get", "scan_speed"],
    },
  };
}

function roiBackendUnavailableResult(): QuailbotToolResult {
  return {
    ok: false,
    action: "observe",
    action_input: { rois: ["scan"] },
    primary_result: {
      requested_rois: ["scan"],
      error_type: "roi_backend_unavailable",
      message: "ROI screenshot/OCR backend is not configured in this plugin implementation round.",
    },
  };
}

function cliSetWithLinkedReadback(): QuailbotToolResult {
  return {
    ok: true,
    action: "cli_set",
    action_input: { cli_name: "nqctl", parameter: "bias_v" },
    primary_result: {
      parameter: "bias_v",
      ok: true,
      exit_code: 0,
      stdout: "PRIMARY_STDOUT_SHOULD_NOT_APPEAR",
      stderr: "",
      payload: {
        parameter: "bias_v",
        plan_only: false,
        result: {
          name: "bias_v",
          command: "Bias_Set",
          args: { Bias_value_V: 0.18 },
          autofilled: {},
          dry_run: false,
          applied: true,
          response: { command: "Bias_Set" },
        },
        timestamp_utc: "2026-06-15T00:00:00.000Z",
      },
      argv: ["nqctl", "set", "bias_v", "--value", "0.18"],
    },
    linked_observation: {
      channels: {
        cli: {
          results: {
            "nqctl:bias_v": {
              ok: true,
              stdout: "LINKED_STDOUT_SHOULD_NOT_APPEAR",
              payload: {
                parameter: "bias_v",
                value: 0.180000007,
                fields: { "Bias value": 0.180000007 },
              },
            },
          },
        },
      },
      unresolved: ["nqctl:current_a"],
    },
  };
}

function cliRampVerboseResult(): QuailbotToolResult {
  return {
    ok: true,
    action: "cli_ramp",
    action_input: { cli_name: "nqctl", parameter: "bias_v" },
    primary_result: {
      parameter: "bias_v",
      ok: true,
      exit_code: 0,
      stdout: "",
      stderr: "",
      payload: {
        start_value: 0.18,
        end_value: 0.19,
        step_value: 0.01,
        interval_s: 0,
        plan: { targets: ["VERBOSE_PLAN_SENTINEL"] },
        applied: true,
        report: {
          attempted_steps: 2,
          applied_steps: 2,
          final_value: 0.19,
          reports: ["VERBOSE_REPORT_SENTINEL"],
        },
      },
      argv: ["nqctl", "ramp", "bias_v", "--to", "0.19"],
    },
  };
}

function planAndExecuteResult(): QuailbotToolResult {
  return {
    ok: true,
    action: "quailbot_plan_and_execute",
    action_input: {},
    primary_result: {
      ok: true,
      stopped_reason: "completed",
      steps: [
        {
          index: 0,
          kind: "cli_set",
          primary_result: {
            ok: true,
            stdout: "NESTED_STDOUT_SHOULD_NOT_APPEAR",
            payload: { parameter: "bias_v", result: { applied: true } },
          },
          linked_observation: {
            channels: {
              cli: {
                results: {
                  "nqctl:bias_v": { ok: true, payload: { value: 0.18 } },
                },
              },
              roi: { unavailable: [] },
            },
            unresolved: [],
          },
        },
        {
          index: 1,
          kind: "cli_get",
          primary_result: { ok: true, payload: { parameter: "bias_v", value: 0.18 } },
        },
      ],
    },
  };
}

function planWithNestedCliActionParseFailure(): QuailbotToolResult {
  return {
    ok: false,
    action: "quailbot_plan_and_execute",
    action_input: {},
    primary_result: {
      ok: false,
      stopped_reason: "step_failed",
      steps: [
        {
          index: 0,
          kind: "cli_action",
          primary_result: {
            action_name: "Scan_Action",
            ok: false,
            exit_code: 3,
            stdout: NQCTL_SCAN_ACTION_TIMEOUT_STDOUT,
            stderr: "",
            payload: undefined,
            argv: ["nqctl", "act", "Scan_Action"],
          },
        },
      ],
    },
  };
}

function planWithFailedLinkedReadbackStep(): QuailbotToolResult {
  return {
    ok: false,
    action: "quailbot_plan_and_execute",
    action_input: {},
    primary_result: {
      ok: false,
      stopped_reason: "step_failed",
      steps: [
        {
          index: 0,
          kind: "cli_set",
          primary_result: {
            ok: true,
            payload: { parameter: "bias_v", result: { applied: true } },
          },
          linked_observation: {
            channels: {
              cli: {
                results: {
                  "nqctl:current_a": {
                    ok: false,
                    exit_code: -1,
                    stdout: "PLAN_LINKED_FAILURE_STDOUT_SHOULD_NOT_APPEAR",
                    stderr: "readback blew up",
                    payload: undefined,
                    argv: ["nqctl", "get", "current_a"],
                    error_type: "readback_exception",
                    error_message: "readback blew up",
                  },
                },
              },
              roi: { unavailable: [] },
            },
            unresolved: [],
          },
        },
      ],
    },
  };
}

function planWithFailedPrimaryAndLinkedReadback(): QuailbotToolResult {
  return {
    ok: false,
    action: "quailbot_plan_and_execute",
    action_input: {},
    primary_result: {
      ok: false,
      stopped_reason: "step_failed",
      steps: [
        {
          index: 0,
          kind: "cli_set",
          primary_result: {
            ok: false,
            exit_code: 3,
            stdout: "PRIMARY_FAILURE_STDOUT_SHOULD_NOT_APPEAR",
            stderr: "set failed",
            payload: undefined,
            error_type: "instrument_error",
            error_message: "set failed",
          },
          linked_observation: {
            channels: {
              cli: {
                results: {
                  "nqctl:bias_v": { ok: true, payload: { value: 0.18 } },
                },
              },
              roi: { unavailable: [] },
            },
            unresolved: [],
          },
        },
      ],
    },
  };
}

function planValidationErrorResult(): QuailbotToolResult {
  return {
    ok: false,
    action: "quailbot_plan_and_execute",
    action_input: {},
    primary_result: {
      ok: false,
      stopped_reason: "validation_failed",
      validation_error: "mutation policy disabled: Mutating quantum-instrument tools require QUAILBOT_ALLOW_MUTATING_TOOLS=1.",
      steps: [],
    },
  };
}

function planWithFailedGuiStepResult(): QuailbotToolResult {
  return {
    ok: false,
    action: "quailbot_plan_and_execute",
    action_input: {},
    primary_result: {
      ok: false,
      stopped_reason: "step_failed",
      steps: [
        {
          index: 0,
          kind: "observe",
          primary_result: {
            requested_rois: ["scan"],
            error_type: "roi_backend_unavailable",
            message: "ROI screenshot/OCR backend is not configured in this plugin implementation round.",
          },
        },
      ],
    },
  };
}

function cliSetWithLinkedFailureReadback(): QuailbotToolResult {
  return {
    ok: false,
    action: "cli_set",
    action_input: { cli_name: "nqctl", parameter: "bias_v" },
    primary_result: {
      parameter: "bias_v",
      ok: true,
      exit_code: 0,
      stdout: "PRIMARY_STDOUT_SHOULD_NOT_APPEAR",
      stderr: "",
      payload: { parameter: "bias_v", value: 0.18 },
      argv: ["nqctl", "set", "bias_v", "--value", "0.18"],
    },
    linked_observation: {
      channels: {
        cli: {
          results: {
            "nqctl:current_a": {
              ok: false,
              exit_code: -1,
              stdout: "LINKED_FAILURE_STDOUT_SHOULD_NOT_APPEAR",
              stderr: "readback blew up",
              payload: undefined,
              argv: ["nqctl", "get", "current_a"],
              error_type: "readback_exception",
              error_message: "readback blew up",
            },
          },
        },
      },
    },
  };
}

function cliActionUnparsedFailure(stdout: string): QuailbotToolResult {
  return {
    ok: false,
    action: "cli_action",
    action_input: { cli_name: "nqctl", action_name: "Scan_Action", args: { action: "start" } },
    primary_result: {
      action_name: "Scan_Action",
      args: { action: "start" },
      ok: false,
      exit_code: 3,
      stdout,
      stderr: "scan failed before motion started",
      payload: undefined,
      argv: ["nqctl", "act", "Scan_Action", "--arg", "action=start"],
    },
  };
}
