import { describe, expect, it } from "vitest";

import type { QuailbotToolResult } from "../../src/tools/tool-result.js";
import { projectQuailbotContextMessages } from "../../src/tools/tool-result-context.js";

function skillMessage(name: string, warning?: string): { details: QuailbotToolResult; content: unknown } {
  return {
    details: {
      ok: true,
      action: "quailbot_skill",
      action_input: { name },
      primary_result: { name, required: ["nqctl"], missing: warning ? ["awg"] : [], warning, body: `BODY-${name}` },
    },
    content: [{ type: "text", text: "" }],
  };
}
function textOf(message: unknown): string {
  const content = (message as { content: Array<{ text: string }> }).content;
  return content.map((part) => part.text).join("\n");
}

describe("skill-body projection", () => {
  it("keeps the newest N=2 skill bodies full and stubs older ones", () => {
    const messages = [skillMessage("a"), skillMessage("b"), skillMessage("c")];
    const projected = projectQuailbotContextMessages(messages, { recentFullSkillResultCount: 2 });
    expect(textOf(projected[2])).toContain("BODY-c");
    expect(textOf(projected[1])).toContain("BODY-b");
    expect(textOf(projected[0])).toContain("re-invoke quailbot_skill");
    expect(textOf(projected[0])).not.toContain("BODY-a");
  });

  it("renders the missing-driver warning in full mode", () => {
    const messages = [skillMessage("x", "[QUAILBOT WORKSPACE WARNING] ...")];
    const projected = projectQuailbotContextMessages(messages, { recentFullSkillResultCount: 3 });
    expect(textOf(projected[0])).toContain("[QUAILBOT WORKSPACE WARNING]");
    expect(textOf(projected[0])).toContain("BODY-x");
  });

  it("keeps the missing-driver warning in summary mode", () => {
    const messages = [skillMessage("x", "[QUAILBOT WORKSPACE WARNING] missing awg")];
    const projected = projectQuailbotContextMessages(messages, { recentFullSkillResultCount: 0 });
    expect(textOf(projected[0])).toContain("[QUAILBOT WORKSPACE WARNING]");
    expect(textOf(projected[0])).toContain("re-invoke quailbot_skill");
    expect(textOf(projected[0])).not.toContain("BODY-x");
  });
});
