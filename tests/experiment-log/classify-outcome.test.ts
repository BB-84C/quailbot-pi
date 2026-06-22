import { describe, expect, it } from "vitest";

import { classifyPlanStepOutcome, classifyToolOutcome } from "../../src/experiment-log/classify-outcome.js";
import {
  EXPERIMENT_LOG_SCHEMA_VERSION,
  mutationPolicySnapshot,
  workspaceSnapshot,
  type PlanStepResultPayload,
} from "../../src/experiment-log/experiment-log-types.js";
import { disabledMutationPolicy } from "../../src/tools/mutation-policy.js";
import type { QuailbotToolResult } from "../../src/tools/tool-result.js";
import type { LoadedWorkspace } from "../../src/workspace/workspace-service.js";

describe("experiment log event model", () => {
  it("exports schema version and runtime snapshots for experiment log events", () => {
    const loadedWorkspace = {
      selection: { path: "D:/vault/workspace.json", source: "explicit" },
      hash: "sha256:workspace",
      summary: { path: "D:/vault/workspace.json", source: "explicit", hash: "sha256:workspace" },
    } as LoadedWorkspace;

    expect(EXPERIMENT_LOG_SCHEMA_VERSION).toBe(1);
    expect(workspaceSnapshot(loadedWorkspace)).toEqual({
      path: "D:/vault/workspace.json",
      hash: "sha256:workspace",
      source: "explicit",
    });
    expect(workspaceSnapshot(undefined)).toBeUndefined();
    expect(mutationPolicySnapshot(disabledMutationPolicy())).toEqual({
      mutating_tools_enabled: false,
      enable_env_var: "QUAILBOT_ALLOW_MUTATING_TOOLS",
    });
    expect(mutationPolicySnapshot(undefined)).toBeUndefined();
  });
});

describe("classifyToolOutcome", () => {
  it("classifies successful direct read-only results as measured and mutating results as applied", () => {
    expect(classifyToolOutcome(toolResult("cli_get"))).toBe("measured");
    expect(classifyToolOutcome(toolResult("observe"))).toBe("measured");
    expect(classifyToolOutcome(toolResult("cli_set"))).toBe("applied");
  });

  it("classifies successful plan-and-execute results from completed step kinds", () => {
    expect(
      classifyToolOutcome(
        planResult([
          planStep({ kind: "cli_get" }),
          planStep({ kind: "observe" }),
          planStep({ kind: "cli_get" }),
        ]),
      ),
    ).toBe("measured");

    expect(classifyToolOutcome(planResult([planStep({ kind: "cli_get" }), planStep({ kind: "cli_set" })]))).toBe(
      "applied",
    );
  });

  it("classifies policy, validation, step, exception, and driver failures from primary result evidence", () => {
    expect(classifyToolOutcome(toolResult("cli_set", { ok: false, error_type: "mutation_policy_disabled" }, false))).toBe(
      "mutation_denied",
    );
    expect(classifyToolOutcome(planResult([], { ok: false, stopped_reason: "validation_failed" }, false))).toBe(
      "validation_failed",
    );
    expect(classifyToolOutcome(planResult([planStep({ primary_result: { ok: false } })], { ok: false, stopped_reason: "step_failed" }, false))).toBe(
      "step_failed",
    );
    expect(classifyToolOutcome(toolResult("cli_get", { ok: false, error_type: "tool_exception" }, false))).toBe(
      "exception",
    );
    expect(classifyToolOutcome(toolResult("cli_get", { ok: false }, false))).toBe("driver_failure");
    expect(classifyToolOutcome(toolResult("cli_get", { ok: true, exit_code: 7 }, true))).toBe("driver_failure");
  });

  it("classifies readback failures and lets GUI backend unavailability outrank generic readback failure", () => {
    expect(classifyToolOutcome(toolResult("cli_set", { ok: true }, true, { unresolved: ["nqctl:current_a"] }))).toBe(
      "readback_failure",
    );
    expect(
      classifyToolOutcome(
        toolResult("cli_set", { ok: true }, true, {
          channels: { cli: { results: { "nqctl:current_a": { ok: false } } } },
          unresolved: [],
        }),
      ),
    ).toBe("readback_failure");
    expect(classifyToolOutcome(toolResult("observe", { error_type: "roi_backend_unavailable" }, false))).toBe(
      "gui_backend_unavailable",
    );
    expect(
      classifyToolOutcome(
        toolResult("cli_set", { ok: true }, true, {
          channels: { roi: { unavailable: ["scope"], results: { scope: { ok: false, error_type: "roi_backend_unavailable" } } } },
          unresolved: [],
        }),
      ),
    ).toBe("gui_backend_unavailable");
  });

  it("classifies failed primary mutating commands as driver failures before linked readback failures", () => {
    expect(
      classifyToolOutcome(
        toolResult("cli_set", { ok: false, exit_code: 1 }, false, {
          channels: { cli: { results: { "nqctl:current_a": { ok: false } } } },
          unresolved: [],
        }),
      ),
    ).toBe("driver_failure");
  });

  it("classifies nested plan step readback failures before successful plan measured/applied labels", () => {
    expect(
      classifyToolOutcome(
        planResult([
          planStep({
            kind: "cli_set",
            linked_observation: { unresolved: ["nqctl:current_a"] },
          }),
        ]),
      ),
    ).toBe("readback_failure");

    expect(
      classifyToolOutcome(
        planResult([
          planStep({
            kind: "cli_set",
            linked_observation: {
              channels: { roi: { unavailable: ["scope"], results: { scope: { ok: false, error_type: "roi_backend_unavailable" } } } },
              unresolved: [],
            },
          }),
        ]),
      ),
    ).toBe("gui_backend_unavailable");
  });
});

describe("classifyPlanStepOutcome", () => {
  it("classifies successful read-only plan steps as measured and mutating steps as applied", () => {
    expect(classifyPlanStepOutcome(planStep({ kind: "cli_get" }))).toBe("measured");
    expect(classifyPlanStepOutcome(planStep({ kind: "observe" }))).toBe("measured");
    expect(classifyPlanStepOutcome(planStep({ kind: "cli_set" }))).toBe("applied");
  });

  it("classifies plan step failures using the same primary and readback evidence rules", () => {
    expect(classifyPlanStepOutcome(planStep({ kind: "cli_set", primary_result: { ok: false, error_type: "mutation_policy_disabled" } }))).toBe(
      "mutation_denied",
    );
    expect(classifyPlanStepOutcome(planStep({ primary_result: { ok: false, exit_code: 2 } }))).toBe(
      "driver_failure",
    );
    expect(classifyPlanStepOutcome(planStep({ linked_observation: { unresolved: ["missing:ref"] } }))).toBe(
      "readback_failure",
    );
    expect(
      classifyPlanStepOutcome(
        planStep({
          kind: "observe",
          primary_result: { ok: false, error_type: "roi_backend_unavailable" },
          linked_observation: { unresolved: ["roi:scope"] },
        }),
      ),
    ).toBe("gui_backend_unavailable");
  });

  it("classifies failed plan step primaries as driver failures before linked ROI unavailability", () => {
    const roiUnavailableLinkedObservation = {
      channels: { roi: { unavailable: ["scope"], results: { scope: { ok: false, error_type: "roi_backend_unavailable" } } } },
      unresolved: [],
    };

    expect(
      classifyPlanStepOutcome(
        planStep({
          kind: "cli_set",
          primary_result: { ok: false, exit_code: 1 },
          linked_observation: roiUnavailableLinkedObservation,
        }),
      ),
    ).toBe("driver_failure");

    expect(
      classifyPlanStepOutcome(
        planStep({
          kind: "observe",
          primary_result: { ok: false, error_type: "roi_backend_unavailable" },
          linked_observation: roiUnavailableLinkedObservation,
        }),
      ),
    ).toBe("gui_backend_unavailable");
  });
});

function toolResult(
  action: string,
  primary_result: Record<string, unknown> = { ok: true, exit_code: 0 },
  ok = true,
  linked_observation?: unknown,
): QuailbotToolResult {
  return {
    ok,
    action,
    action_input: {},
    primary_result,
    ...(linked_observation === undefined ? {} : { linked_observation }),
  };
}

function planResult(
  steps: PlanStepResultPayload[],
  primary: Record<string, unknown> = { ok: true, stopped_reason: "completed" },
  ok = true,
): QuailbotToolResult {
  return toolResult("quailbot_plan_and_execute", { ...primary, steps }, ok);
}

function planStep(overrides: Partial<PlanStepResultPayload> = {}): PlanStepResultPayload {
  return {
    index: 0,
    kind: "cli_get",
    args: {},
    primary_result: { ok: true, exit_code: 0 },
    ...overrides,
  };
}
