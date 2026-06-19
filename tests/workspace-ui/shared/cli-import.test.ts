import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { cliParamToJson, type CliParamDraft } from "../../../src/workspace-ui/shared/model.js";
import {
  applyCliConflictResolution,
  buildCliConflictReport,
  mergeCliParamDrafts,
} from "../../../src/workspace-ui/shared/cli-import.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures", "python-golden");

function readJsonFixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(fixturesDir, name), "utf8")) as Record<string, unknown>;
}

function readTextFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf8").replace(/\r\n/g, "\n");
}

function existingDraftsFromGoldenDefinitions(): CliParamDraft[] {
  return [
    draftFromGoldenDefinition({ name: "same", label: "Same", description: "identical", enabled: true, get: true, set: false }),
    draftFromGoldenDefinition({ name: "conflict", label: "Conflict", description: "existing", enabled: true, get: true, set: false }),
  ];
}

function draftFromGoldenDefinition(args: { name: string; label: string; description: string; enabled: boolean; get: boolean; set: boolean }): CliParamDraft {
  return {
    cli_name: "fixturectl",
    name: args.name,
    label: args.label,
    description: args.description,
    tags: "",
    enabled: args.enabled,
    group: "",
    allow_get: args.get,
    allow_set: args.set,
    allow_ramp: false,
    readable: true,
    writable: true,
    has_ramp: false,
    safety: null,
    get_cmd: { argv: ["fixturectl", "get", args.name] },
    set_cmd: args.set ? { argv: ["fixturectl", "set", args.name] } : null,
    safety_mode: "guarded",
    action_cmd: null,
    linked_observables: [],
    raw_item: {},
  };
}

function loadedDraftsFromGoldenDefinitions(): CliParamDraft[] {
  return [
    draftFromGoldenDefinition({ name: "conflict", label: "Conflict Loaded", description: "loaded", enabled: false, get: true, set: true }),
    draftFromGoldenDefinition({ name: "new-param", label: "New Param", description: "new", enabled: false, get: true, set: false }),
    draftFromGoldenDefinition({ name: "same", label: "Same", description: "identical", enabled: true, get: true, set: false }),
  ];
}

function serialized(drafts: CliParamDraft[]): Record<string, unknown>[] {
  return drafts.map((draft) => cliParamToJson(draft));
}

describe("shared CLI import merge/report parity", () => {
  it("matches the committed Python merge golden for merged shape, skips, and conflicts", () => {
    const golden = readJsonFixture("cli_import_merge.json");
    const existing = existingDraftsFromGoldenDefinitions();
    const loaded = loadedDraftsFromGoldenDefinitions();

    const result = mergeCliParamDrafts(existing, loaded);

    expect(result.identicalSkipCount).toBe(golden.identical_skip_count);
    expect(result.conflicts.map((conflict) => ({
      cli_name: conflict.cli_name,
      name: conflict.name,
      existing: cliParamToJson(conflict.existing),
      loaded: cliParamToJson(conflict.loaded),
    }))).toEqual(golden.conflicts);
    expect(serialized(result.merged)).toEqual(golden.merged_before_resolution);
  });

  it("matches the committed Python merge golden for both conflict resolutions", () => {
    const golden = readJsonFixture("cli_import_merge.json");
    const existing = existingDraftsFromGoldenDefinitions();
    const loaded = loadedDraftsFromGoldenDefinitions();
    const result = mergeCliParamDrafts(existing, loaded);

    const keepExisting = applyCliConflictResolution(result.merged, result.conflicts, false);
    const useLoaded = applyCliConflictResolution(result.merged, result.conflicts, true);

    expect(keepExisting).not.toBe(result.merged);
    expect(serialized(keepExisting)).toEqual(golden.keep_existing);
    expect(serialized(useLoaded)).toEqual(golden.use_loaded);
  });

  it("matches the committed Python conflict report byte-for-byte", () => {
    const existing = existingDraftsFromGoldenDefinitions();
    const loaded = loadedDraftsFromGoldenDefinitions();
    const result = mergeCliParamDrafts(existing, loaded);

    expect(buildCliConflictReport(result.conflicts)).toBe(readTextFixture("cli_import_conflict_report.md"));
  });
});
