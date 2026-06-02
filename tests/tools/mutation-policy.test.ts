import { describe, expect, it } from "vitest";

import {
  MUTATING_TOOL_KINDS,
  MUTATION_POLICY_DISABLED_ERROR_TYPE,
  MUTATION_POLICY_DISABLED_MESSAGE,
  MUTATION_POLICY_ENV_VAR,
  READ_ONLY_WITHOUT_MUTATION_ENABLE,
  disabledMutationPolicy,
  enabledMutationPolicy,
  isMutatingToolKind,
  mutationPolicyDisabledResult,
  mutationPolicyFromEnvironment,
  mutationPolicyValidationError,
} from "../../src/tools/mutation-policy.js";

describe("mutation policy", () => {
  it("is disabled by default and exposes the enable environment variable", () => {
    expect(mutationPolicyFromEnvironment({})).toEqual(disabledMutationPolicy());
    expect(disabledMutationPolicy()).toEqual({
      mutatingToolsEnabled: false,
      enableEnvVar: MUTATION_POLICY_ENV_VAR,
    });
  });

  it("enables mutating tools only when the environment variable is exactly 1", () => {
    expect(mutationPolicyFromEnvironment({ [MUTATION_POLICY_ENV_VAR]: "1" })).toEqual(enabledMutationPolicy());

    for (const value of ["0", "true", "yes", " 1", "1 ", ""]) {
      expect(mutationPolicyFromEnvironment({ [MUTATION_POLICY_ENV_VAR]: value })).toEqual(disabledMutationPolicy());
    }
  });

  it("classifies mutating and read-only tool kinds", () => {
    expect(MUTATING_TOOL_KINDS).toEqual(["cli_set", "cli_ramp", "cli_action", "click_anchor", "set_field"]);
    expect(READ_ONLY_WITHOUT_MUTATION_ENABLE).toEqual([
      "cli_get",
      "observe",
      "sleep_seconds",
      "quailbot_planwrite",
      "quailbot_plan_and_execute_read_only",
    ]);

    for (const kind of MUTATING_TOOL_KINDS) {
      expect(isMutatingToolKind(kind)).toBe(true);
    }
    for (const kind of READ_ONLY_WITHOUT_MUTATION_ENABLE) {
      expect(isMutatingToolKind(kind)).toBe(false);
    }
    expect(isMutatingToolKind("quailbot_plan_and_execute")).toBe(false);
    expect(isMutatingToolKind(undefined)).toBe(false);
  });

  it("returns a structured disabled result for blocked mutating actions", () => {
    const actionInput = { parameter: "zctrl_setpnt", value: 1.5 };

    expect(mutationPolicyDisabledResult("cli_set", actionInput)).toEqual({
      ok: false,
      action: "cli_set",
      action_input: actionInput,
      primary_result: {
        ok: false,
        error_type: MUTATION_POLICY_DISABLED_ERROR_TYPE,
        message: MUTATION_POLICY_DISABLED_MESSAGE,
        mutation_policy: disabledMutationPolicy(),
      },
    });
  });

  it("describes validation failures with the disabled policy message", () => {
    const validationError = mutationPolicyValidationError();

    expect(validationError).toContain("mutation policy disabled");
    expect(validationError).toContain(MUTATION_POLICY_DISABLED_MESSAGE);
  });
});
