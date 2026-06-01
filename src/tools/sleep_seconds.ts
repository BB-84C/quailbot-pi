import type { QuailbotToolResult } from "./tool-result.js";

export type SleepSecondsInput = {
  seconds: number;
};

export async function executeSleepSeconds(input: SleepSecondsInput): Promise<QuailbotToolResult> {
  if (!Number.isFinite(input.seconds) || input.seconds < 0) {
    throw new Error("sleep_seconds requires a finite non-negative seconds value");
  }

  await new Promise((resolve) => setTimeout(resolve, input.seconds * 1000));

  return {
    ok: true,
    action: "sleep_seconds",
    action_input: input,
    primary_result: {
      slept_seconds: input.seconds,
    },
  };
}
