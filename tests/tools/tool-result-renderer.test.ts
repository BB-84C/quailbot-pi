import { describe, expect, it } from "vitest";

import { makeQuailbotRenderCall, renderQuailbotToolResult } from "../../src/tools/tool-result-renderer.js";
import type { QuailbotToolResult } from "../../src/tools/tool-result.js";

describe("tool result renderer", () => {
  it("renders compact tool calls", () => {
    const component = makeQuailbotRenderCall("cli_set")(
      { parameter: "bias_v", cli_name: "nqctl", args: { Bias_value_V: 0.18 } },
      {},
      {},
    );

    const text = component.render(120).join("\n");

    expect(text).toContain("cli_set");
    expect(text).toContain("nqctl:bias_v");
    expect(text).toContain("Bias_value_V=0.18");
  });

  it("renders tool summaries without tui padding", () => {
    const callLines = makeQuailbotRenderCall("cli_get")(
      { parameter: "bias_v", cli_name: "nqctl" },
      {},
      {},
    ).render(120);
    const partialLines = renderQuailbotToolResult(
      { content: [{ type: "text" as const, text: "running" }], details: undefined },
      { expanded: false, isPartial: true },
      {},
      {},
    ).render(120);

    expect(callLines).toHaveLength(1);
    expect(callLines[0]).toMatch(/^cli_get nqctl:bias_v/);
    expect(partialLines).toHaveLength(1);
    expect(partialLines[0]).toMatch(/^Quailbot tool running\.\.\./);
  });

  it("renders compact and expanded results from details", () => {
    const details: QuailbotToolResult = {
      ok: true,
      action: "cli_get",
      action_input: { cli_name: "nqctl", parameter: "bias_v" },
      primary_result: {
        parameter: "bias_v",
        ok: true,
        exit_code: 0,
        stdout: "hidden",
        stderr: "",
        payload: { parameter: "bias_v", value: 0.17, fields: { "Bias value": 0.17 } },
        argv: ["nqctl", "get", "bias_v"],
      },
    };
    const result = {
      content: [{ type: "text" as const, text: "model-facing summary" }],
      details,
    };

    const compact = renderQuailbotToolResult(result, { expanded: false, isPartial: false }, {}, {})
      .render(120)
      .join("\n");
    const expanded = renderQuailbotToolResult(result, { expanded: true, isPartial: false }, {}, {})
      .render(120)
      .join("\n");

    expect(compact).toContain("cli_get nqctl:bias_v [ok, parsed_payload]");
    expect(compact).not.toContain("fields: Bias value=0.17");
    expect(expanded).toContain("fields: Bias value=0.17");
    expect(expanded).not.toContain("hidden");
  });
});
