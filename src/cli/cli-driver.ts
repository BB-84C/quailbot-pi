import { spawn } from "node:child_process";

export type CliRunResult = {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  payload: unknown;
  argv: string[];
  error_type?: string;
  error_message?: string;
};

export type RunCliOptions = {
  timeoutMs?: number;
};

export type RunCli = (file: string, args: string[], options?: RunCliOptions) => Promise<CliRunResult>;

const DEFAULT_TIMEOUT_MS = 60_000;

export const runCli: RunCli = async (file, args, options = {}) => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const argv = [file, ...args];

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("timeoutMs must be a finite positive number");
  }

  return new Promise<CliRunResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let timeout: NodeJS.Timeout | undefined;

    const child = spawn(file, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });

    const finish = (result: CliRunResult): void => {
      if (settled) {
        return;
      }

      settled = true;
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
      resolve(result);
    };

    timeout = setTimeout(() => {
      timedOut = true;
      const message = `process timed out after ${timeoutMs}ms`;
      finish({
        ok: false,
        exitCode: -1,
        stdout,
        stderr: appendLine(stderr, message),
        payload: undefined,
        argv,
        error_type: "timeout",
        error_message: message,
      });
      child.kill();
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      finish({
        ok: false,
        exitCode: -1,
        stdout,
        stderr: stderr ? `${stderr}\n${error.message}` : error.message,
        payload: undefined,
        argv,
        error_type: "spawn_error",
        error_message: error.message,
      });
    });

    child.on("close", (code) => {
      const exitCode = code ?? -1;
      const timeoutMessage = timedOut ? `process timed out after ${timeoutMs}ms` : undefined;
      const finalStderr = timeoutMessage ? appendLine(stderr, timeoutMessage) : stderr;

      finish({
        ok: exitCode === 0 && !timedOut,
        exitCode,
        stdout,
        stderr: finalStderr,
        payload: parseJsonPayload(stdout),
        argv,
      });
    });
  });
};

function parseJsonPayload(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

function appendLine(value: string, line: string): string {
  return value ? `${value}\n${line}` : line;
}
