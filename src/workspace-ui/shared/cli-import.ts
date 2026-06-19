import { cliParamToJson, type CliParamDraft } from "./model.js";
import { draftFromParameterItem } from "./parse.js";

export interface CliImportConflict {
  cli_name: string;
  name: string;
  existing: CliParamDraft;
  loaded: CliParamDraft;
}

export interface MergeResult {
  merged: CliParamDraft[];
  conflicts: CliImportConflict[];
  identicalSkipCount: number;
}

export type CliFieldDiff = { field: string; existing: unknown | undefined; loaded: unknown | undefined };

const missing = Symbol("cli-import-missing");
type DiffValue = unknown | typeof missing;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = item;
  }
  return out;
}

function identity(draft: CliParamDraft): [string, string] {
  return [((draft.cli_name || "cli").trim() || "cli"), (draft.name || "").trim()];
}

function identityKey(cliName: string, name: string): string {
  return `${cliName}\u0000${name}`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function payloadKey(draft: CliParamDraft): string {
  return stableJson(cliParamToJson(draft));
}

export function extractCapabilitiesItems(payload: unknown): { parameterItems: Array<Record<string, unknown>>; actionItems: Array<Record<string, unknown>> } {
  const parameterItems: Array<Record<string, unknown>> = [];
  const actionItems: Array<Record<string, unknown>> = [];
  if (!isRecord(payload)) {
    return { parameterItems, actionItems };
  }

  const parameters = payload.parameters;
  if (isRecord(parameters) && Array.isArray(parameters.items)) {
    for (const item of parameters.items) {
      if (isRecord(item)) parameterItems.push(cloneRecord(item));
    }
  }

  const actions = payload.action_commands;
  if (isRecord(actions) && Array.isArray(actions.items)) {
    for (const item of actions.items) {
      if (isRecord(item)) actionItems.push(cloneRecord(item));
    }
  }

  return { parameterItems, actionItems };
}

export function loadedDraftsFromCapabilities(payload: unknown, cliName: string): CliParamDraft[] {
  const { parameterItems, actionItems } = extractCapabilitiesItems(payload);
  const drafts: CliParamDraft[] = [];
  for (const item of [...parameterItems, ...actionItems]) {
    const draft = draftFromParameterItem({ nameHint: "", value: item, defaultEnabled: false, defaultCliName: cliName });
    if (draft !== null) drafts.push(draft);
  }
  drafts.sort((a, b) => (a.label || a.name).toLowerCase().localeCompare((b.label || b.name).toLowerCase()));
  return drafts;
}

export function mergeCliParamDrafts(existing: CliParamDraft[], loaded: CliParamDraft[]): MergeResult {
  const merged = [...existing];
  const existingByIdentity = new Map<string, number>();
  for (const [idx, item] of merged.entries()) {
    const [cliName, name] = identity(item);
    const key = identityKey(cliName, name);
    if (name && !existingByIdentity.has(key)) existingByIdentity.set(key, idx);
  }

  const conflicts: CliImportConflict[] = [];
  let identicalSkipCount = 0;
  for (const item of loaded) {
    const [cliName, name] = identity(item);
    if (!name) continue;
    const key = identityKey(cliName, name);
    const existingIdx = existingByIdentity.get(key);
    if (existingIdx === undefined) {
      existingByIdentity.set(key, merged.length);
      merged.push(item);
      continue;
    }
    const existingItem = merged[existingIdx];
    if (existingItem && payloadKey(existingItem) === payloadKey(item)) {
      identicalSkipCount += 1;
      continue;
    }
    if (existingItem) {
      conflicts.push({ cli_name: cliName, name, existing: existingItem, loaded: item });
    }
  }
  return { merged, conflicts, identicalSkipCount };
}

export function applyCliConflictResolution(merged: CliParamDraft[], conflicts: CliImportConflict[], preferLoaded: boolean): CliParamDraft[] {
  const resolved = [...merged];
  if (!preferLoaded || conflicts.length === 0) {
    return resolved;
  }
  const indexByIdentity = new Map<string, number>();
  for (const [idx, item] of resolved.entries()) {
    const [cliName, name] = identity(item);
    const key = identityKey(cliName, name);
    if (name && !indexByIdentity.has(key)) indexByIdentity.set(key, idx);
  }
  for (const conflict of conflicts) {
    const idx = indexByIdentity.get(identityKey(conflict.cli_name, conflict.name));
    if (idx !== undefined) resolved[idx] = conflict.loaded;
  }
  return resolved;
}

function collectInternal(existing: DiffValue, loaded: DiffValue, prefix = ""): Array<{ field: string; existing: DiffValue; loaded: DiffValue }> {
  if (isRecord(existing) && isRecord(loaded)) {
    const diffs: Array<{ field: string; existing: DiffValue; loaded: DiffValue }> = [];
    const keys = [...new Set([...Object.keys(existing), ...Object.keys(loaded)])].sort();
    for (const key of keys) {
      const left = Object.prototype.hasOwnProperty.call(existing, key) ? existing[key] : missing;
      const right = Object.prototype.hasOwnProperty.call(loaded, key) ? loaded[key] : missing;
      diffs.push(...collectInternal(left, right, prefix ? `${prefix}.${key}` : key));
    }
    return diffs;
  }
  if (stableJson(existing) !== stableJson(loaded)) {
    return [{ field: prefix || "<root>", existing, loaded }];
  }
  return [];
}

export function collectFieldDiffs(existingPayload: Record<string, unknown>, loadedPayload: Record<string, unknown>, prefix = ""): CliFieldDiff[] {
  return collectInternal(existingPayload, loadedPayload, prefix).map((diff) => ({
    field: diff.field,
    existing: diff.existing === missing ? undefined : diff.existing,
    loaded: diff.loaded === missing ? undefined : diff.loaded,
  }));
}

function pythonJsonDumps(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => pythonJsonDumps(item)).join(", ")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}: ${pythonJsonDumps(value[key])}`).join(", ")}}`;
  }
  return JSON.stringify(value);
}

function formatDiffValue(value: DiffValue): string {
  if (value === missing || value === undefined) {
    return "`<missing>`";
  }
  let text = pythonJsonDumps(value);
  if (text.length > 160) {
    text = `${text.slice(0, 157)}...`;
  }
  text = text.replaceAll("|", "\\|").replaceAll("\n", "\\n");
  return `\`${text}\``;
}

export function buildCliConflictReport(conflicts: CliImportConflict[]): string {
  const lines = ["# CLI Import Conflict Report", "", `Conflicts: ${conflicts.length}`, ""];
  for (const conflict of conflicts) {
    lines.push(`## \`${conflict.cli_name}:${conflict.name}\``);
    const diffs = collectInternal(cliParamToJson(conflict.existing), cliParamToJson(conflict.loaded));
    if (diffs.length === 0) {
      lines.push("No field-level diffs detected.", "");
      continue;
    }
    lines.push("| Field | Existing | Loaded |", "| --- | --- | --- |");
    for (const diff of diffs) {
      lines.push(`| ${diff.field} | ${formatDiffValue(diff.existing)} | ${formatDiffValue(diff.loaded)} |`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

export function declaredCliNamesForWorkspace(workspace: { cliName?: string; cliParams?: CliParamDraft[]; cli_params?: unknown; tools?: unknown }): Set<string> {
  const names = new Set<string>();
  const add = (value: unknown): void => {
    const name = String(value ?? "").trim();
    if (name) names.add(name);
  };
  add(workspace.cliName);
  for (const draft of workspace.cliParams ?? []) {
    add(draft.cli_name);
    add(cliParamToJson(draft).CLI_Name);
  }

  const cliParams = workspace.cli_params;
  if (isRecord(cliParams)) {
    add(cliParams.cli_name);
    for (const blockName of ["parameters", "action_commands", "actions"] as const) {
      const block = cliParams[blockName];
      if (!isRecord(block)) continue;
      if (Array.isArray(block.items)) {
        for (const item of block.items) if (isRecord(item)) add(item.CLI_Name);
      } else {
        for (const item of Object.values(block)) if (isRecord(item)) add(item.CLI_Name);
      }
    }
  }
  return names;
}
