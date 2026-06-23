import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach } from "vitest";

/**
 * Per-test isolation for Quailbot Pi state.
 *
 * Every test runs in a fresh, ephemeral state directory selected via the
 * `QUAILBOT_PI_STATE_DIR` env var that the production resolver honors.
 * This guarantees that:
 *   - No test ever writes to the real `~/.quailbot-pi/` on the developer's
 *     machine (avoiding pollution across runs and across users).
 *   - Tests run in parallel without contention on a shared state path.
 *   - A test that wants to assert state contents can use the production
 *     resolver `quailbotStateRoot()` directly; the assertion lands in the
 *     same tmpdir that the production code wrote to.
 *
 * Tests that need a specific path can override `process.env.QUAILBOT_PI_STATE_DIR`
 * within their own scope -- vitest restores environment variables between
 * tests when the test mutates them directly, but the safer pattern is to
 * save the prior value, set the new one, and restore in a `finally`.
 */

let currentStateDir: string | undefined;
let priorEnvValue: string | undefined;

beforeEach(() => {
  priorEnvValue = process.env.QUAILBOT_PI_STATE_DIR;
  currentStateDir = mkdtempSync(join(tmpdir(), "qb-state-"));
  process.env.QUAILBOT_PI_STATE_DIR = currentStateDir;
});

afterEach(() => {
  if (priorEnvValue === undefined) {
    delete process.env.QUAILBOT_PI_STATE_DIR;
  } else {
    process.env.QUAILBOT_PI_STATE_DIR = priorEnvValue;
  }
  priorEnvValue = undefined;
  if (currentStateDir !== undefined) {
    try {
      rmSync(currentStateDir, { force: true, recursive: true });
    } catch {
      // Best-effort cleanup; a leaked tmpdir is not worth failing a test over.
    }
    currentStateDir = undefined;
  }
});
