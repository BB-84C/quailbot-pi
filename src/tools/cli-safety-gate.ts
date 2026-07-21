import type { CliParameter } from "../workspace/types.js";

export function validateCliSetSafety(parameter: CliParameter, value: unknown): void {
  // cli_set has no current-value readback, so max_step and slew limits apply only to cli_ramp.
  const numericValue = finiteNumber(value);
  if (numericValue === undefined) {
    return;
  }

  const safety = safetyFor(parameter);
  validateRange("cli_set", parameter.ref, "value", numericValue, safety);
}

export function validateCliRampSafety(
  parameter: CliParameter,
  input: { start: number; end: number; step: number; interval_s: number },
): void {
  const safety = safetyFor(parameter);
  validateRange("cli_ramp", parameter.ref, "start", input.start, safety);
  validateRange("cli_ramp", parameter.ref, "end", input.end, safety);

  const maxStep = safetyLimit(safety.max_step);
  if (maxStep !== undefined) {
    const step = requireFinite("cli_ramp", parameter.ref, "step", input.step);
    if (Math.abs(step) > maxStep) {
      throw new Error(`cli_ramp rejected: |step| ${Math.abs(step)} exceeds max_step ${maxStep} for ${parameter.ref} (safety gate)`);
    }
  }

  const maxSlew = safetyLimit(safety.max_slew_per_s);
  if (maxSlew !== undefined) {
    const step = requireFinite("cli_ramp", parameter.ref, "step", input.step);
    const interval = requireFinite("cli_ramp", parameter.ref, "interval_s", input.interval_s);
    if (interval <= 0) {
      throw new Error(`cli_ramp rejected: interval_s ${interval} must be > 0 for ${parameter.ref} (safety gate)`);
    }

    const slewRate = Math.abs(step) / interval;
    const tolerance = Math.abs(maxSlew) * 1e-9;
    if (slewRate > maxSlew + tolerance) {
      throw new Error(
        `cli_ramp rejected: slew rate ${slewRate} exceeds max_slew_per_s ${maxSlew} for ${parameter.ref} (safety gate)`,
      );
    }
  }
}

function validateRange(
  action: "cli_set" | "cli_ramp",
  parameterRef: string,
  valueName: string,
  value: unknown,
  safety: Record<string, unknown>,
): void {
  const min = safetyLimit(safety.min_value);
  const max = safetyLimit(safety.max_value);
  if (min === undefined && max === undefined) {
    return;
  }

  const numericValue = requireFinite(action, parameterRef, valueName, value);
  if (min !== undefined && numericValue < min) {
    throw new Error(`${action} rejected: ${valueName} ${numericValue} is below min_value ${min} for ${parameterRef} (safety gate)`);
  }
  if (max !== undefined && numericValue > max) {
    throw new Error(`${action} rejected: ${valueName} ${numericValue} exceeds max_value ${max} for ${parameterRef} (safety gate)`);
  }
}

function requireFinite(action: "cli_set" | "cli_ramp", parameterRef: string, valueName: string, value: unknown): number {
  const numericValue = finiteNumber(value);
  if (numericValue === undefined) {
    throw new Error(`${action} rejected: ${valueName} must be finite for ${parameterRef} (safety gate)`);
  }
  return numericValue;
}

function safetyFor(parameter: CliParameter): Record<string, unknown> {
  return record(parameter.schema.safety);
}

function safetyLimit(value: unknown): number | undefined {
  return finiteNumber(value);
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") {
    return undefined;
  }
  if (typeof value === "string" && value.trim().length === 0) {
    return undefined;
  }
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : undefined;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
