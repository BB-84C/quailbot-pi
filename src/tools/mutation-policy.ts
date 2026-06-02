import type { QuailbotToolResult } from "./tool-result.js";

export const MUTATION_POLICY_ENV_VAR = "QUAILBOT_ALLOW_MUTATING_TOOLS";
export const MUTATION_POLICY_DISABLED_ERROR_TYPE = "mutation_policy_disabled";
export const MUTATION_POLICY_DISABLED_MESSAGE =
  "Mutating quantum-instrument tools require QUAILBOT_ALLOW_MUTATING_TOOLS=1.";

export type MutationPolicy = {
  mutatingToolsEnabled: boolean;
  enableEnvVar: typeof MUTATION_POLICY_ENV_VAR;
};

export const MUTATING_TOOL_KINDS = ["cli_set", "cli_ramp", "cli_action", "click_anchor", "set_field"] as const;
export const READ_ONLY_WITHOUT_MUTATION_ENABLE = [
  "cli_get",
  "observe",
  "sleep_seconds",
  "quailbot_planwrite",
  "quailbot_plan_and_execute_read_only",
] as const;

export type MutatingToolKind = (typeof MUTATING_TOOL_KINDS)[number];

export function mutationPolicyFromEnvironment(env: NodeJS.ProcessEnv = process.env): MutationPolicy {
  return env[MUTATION_POLICY_ENV_VAR] === "1" ? enabledMutationPolicy() : disabledMutationPolicy();
}

export function enabledMutationPolicy(): MutationPolicy {
  return { mutatingToolsEnabled: true, enableEnvVar: MUTATION_POLICY_ENV_VAR };
}

export function disabledMutationPolicy(): MutationPolicy {
  return { mutatingToolsEnabled: false, enableEnvVar: MUTATION_POLICY_ENV_VAR };
}

export function isMutatingToolKind(kind: unknown): kind is MutatingToolKind {
  return typeof kind === "string" && (MUTATING_TOOL_KINDS as readonly string[]).includes(kind);
}

export function mutationPolicyDisabledResult(action: string, actionInput: unknown): QuailbotToolResult {
  return {
    ok: false,
    action,
    action_input: actionInput,
    primary_result: {
      ok: false,
      error_type: MUTATION_POLICY_DISABLED_ERROR_TYPE,
      message: MUTATION_POLICY_DISABLED_MESSAGE,
      mutation_policy: disabledMutationPolicy(),
    },
  };
}

export function mutationPolicyValidationError(): string {
  return `mutation policy disabled: ${MUTATION_POLICY_DISABLED_MESSAGE}`;
}
