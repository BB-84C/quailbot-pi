import type { PlanContextStore } from "../prompt/plan-context.js";
import type { QuailbotToolResult } from "./tool-result.js";

export type QuailbotPlanwriteInput = { text: string; mode: "system" | "ephemeral"; clean?: boolean };

export async function executeQuailbotPlanwrite(
  store: PlanContextStore,
  input: QuailbotPlanwriteInput,
): Promise<QuailbotToolResult> {
  if (input.clean) {
    store.clear();
  }

  if (input.mode === "system" && input.text.trim()) {
    store.set(input.text);
  }

  const persisted = input.mode === "system" && Boolean(input.text.trim());
  return {
    ok: true,
    action: "quailbot_planwrite",
    action_input: { ...input },
    primary_result: {
      mode: input.mode,
      cleaned: Boolean(input.clean),
      persisted,
      text: input.text,
    },
  };
}
