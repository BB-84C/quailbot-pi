#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");

const stateRoot = join(repoRoot, ".pi-state");
const agentDir = join(stateRoot, "agent");
const sessionDir = join(agentDir, "sessions");
const piCli = join(repoRoot, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "cli.js");

mkdirSync(agentDir, { recursive: true });
mkdirSync(sessionDir, { recursive: true });

const child = spawn(process.execPath, [piCli, ...process.argv.slice(2)], {
  cwd: repoRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    PI_CODING_AGENT_DIR: agentDir,
    PI_CODING_AGENT_SESSION_DIR: sessionDir,
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
