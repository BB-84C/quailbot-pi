import { spawnSync, type SpawnSyncReturns } from "node:child_process";

export interface CliCapabilityProbeResult {
  ok: boolean;
  payload?: Record<string, unknown>;
  usedSubcommand: "capabilities" | "capacities" | "";
  error: string;
}

export interface ProbeOptions {
  cliName: string;
  declaredCliNames: ReadonlySet<string>;
  timeoutMs?: number;
}

export type ProbeRunner = (command: string, args: string[], options: { shell: false; timeout: number; windowsHide: true; encoding: "utf8" }) => Pick<SpawnSyncReturns<string>, "status" | "stdout" | "stderr" | "error">;

const cliNamePattern = /^[A-Za-z0-9_.-]+$/;
let runner: ProbeRunner = (command, args, options) => spawnSync(command, args, options);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function setProbeRunner(fn: ProbeRunner | null): void {
  runner = fn ?? ((command, args, options) => spawnSync(command, args, options));
}

function spawnErrorText(cliName: string, subcommand: "capabilities" | "capacities", error: Error): string {
  const errorWithCode = error as Error & { code?: unknown };
  const code = typeof errorWithCode.code === "string" ? errorWithCode.code : "";
  if (code === "ETIMEDOUT" || /timed?\s*out|ETIMEDOUT/i.test(error.message)) {
    return `${cliName} ${subcommand} timed out`;
  }
  return error.message || `${cliName} ${subcommand} failed`;
}

function failedProcessText(cliName: string, subcommand: "capabilities" | "capacities", result: Pick<SpawnSyncReturns<string>, "status" | "stdout" | "stderr" | "error">): string {
  if (result.error) {
    return spawnErrorText(cliName, subcommand, result.error);
  }
  const stderr = (result.stderr || "").trim();
  const stdout = (result.stdout || "").trim();
  return stderr || stdout || `exit code ${result.status ?? "unknown"}`;
}

function parseSuccessfulStdout(cliName: string, subcommand: "capabilities" | "capacities", stdout: string): CliCapabilityProbeResult {
  let payload: unknown;
  try {
    payload = JSON.parse(stdout || "");
  } catch (exc) {
    const message = exc instanceof Error ? exc.message : String(exc);
    return { ok: false, usedSubcommand: subcommand, error: `Invalid JSON from ${cliName}: ${message}` };
  }
  if (!isRecord(payload)) {
    return { ok: false, usedSubcommand: subcommand, error: `Invalid JSON from ${cliName}: root is not an object` };
  }
  return { ok: true, payload, usedSubcommand: subcommand, error: "" };
}

export function probeCliCapabilities(opts: ProbeOptions): CliCapabilityProbeResult {
  const cliName = opts.cliName.trim();
  if (!cliNamePattern.test(cliName)) {
    return { ok: false, usedSubcommand: "", error: "invalid CLI name" };
  }
  if (!opts.declaredCliNames.has(cliName)) {
    return { ok: false, usedSubcommand: "", error: "CLI name not declared by workspace" };
  }

  const timeout = opts.timeoutMs ?? 90_000;
  let lastError = "";
  let lastSubcommand: "capabilities" | "capacities" | "" = "";
  for (const subcommand of ["capabilities", "capacities"] as const) {
    lastSubcommand = subcommand;
    const result = runner(cliName, [subcommand], { shell: false, timeout, windowsHide: true, encoding: "utf8" });
    if (!result.error && result.status === 0) {
      return parseSuccessfulStdout(cliName, subcommand, result.stdout || "");
    }
    lastError = failedProcessText(cliName, subcommand, result);
  }
  return { ok: false, usedSubcommand: lastSubcommand, error: lastError };
}
