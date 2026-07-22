import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  loadSessionExperimentIndex,
  saveSessionExperimentIndex,
  sessionExperimentIndexPath,
} from "../../src/experiment-log/session-experiment-index.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("session experiment index", () => {
  it("round-trips live sessions and prunes entries whose event files disappeared", () => {
    const root = makeTempDir();
    const liveEventsPath = join(root, "2026-06-16", "exp_live", "events.jsonl");
    mkdirSync(join(root, "2026-06-16", "exp_live"), { recursive: true });
    writeFileSync(liveEventsPath, "{}\n", "utf8");

    saveSessionExperimentIndex(root, {
      live: { experiment_id: "exp_live", events_path: liveEventsPath, updated_at: "2026-06-16T06:30:00.000Z" },
      gone: { experiment_id: "exp_gone", events_path: join(root, "missing", "events.jsonl"), updated_at: "2026-06-16T06:30:00.000Z" },
    });

    expect(existsSync(sessionExperimentIndexPath(root))).toBe(true);
    expect(loadSessionExperimentIndex(root)).toEqual({
      live: { experiment_id: "exp_live", events_path: liveEventsPath, updated_at: "2026-06-16T06:30:00.000Z" },
    });
  });
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "quailbot-session-index-"));
  tempDirs.push(dir);
  return dir;
}
