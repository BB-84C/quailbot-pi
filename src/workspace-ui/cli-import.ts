import { execFileSync } from "node:child_process";

import { arrayOfRecords, asString, cloneJson, isRecord, record, type JsonRecord } from "./json.js";

export type ConflictResolution = "existing" | "imported" | "skip";
export type ImportConflict = { ref: string; existing: JsonRecord; imported: JsonRecord };

type ParsedCapabilityPayload = { cliName: string; parameters: JsonRecord[]; actions: JsonRecord[] };

const DISCOVERY_TIMEOUT_MS = 90_000;

export function parseCapabilityPayload(cliName: string, payload: unknown): ParsedCapabilityPayload {
  const root = record(payload);
  const parameters = arrayOfRecords(record(root.parameters).items).map((item) => normalizeImportedItem(cliName, item));
  const actions = arrayOfRecords(record(root.action_commands).items).map((item) => normalizeImportedItem(cliName, item));

  return { cliName, parameters, actions };
}

export function loadCliCapabilityPayload(cliName: string): ParsedCapabilityPayload {
  const attempts = ["capabilities", "capacities"];
  const failures: string[] = [];

  for (const subcommand of attempts) {
    const commandLabel = `${cliName} ${subcommand}`;
    try {
      const stdout = execFileSync(cliName, [subcommand], {
        encoding: "utf8",
        timeout: DISCOVERY_TIMEOUT_MS,
        windowsHide: true,
      });
      return parseCapabilityPayload(cliName, JSON.parse(stdout) as unknown);
    } catch (error) {
      failures.push(`${commandLabel}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Failed to load CLI capability payload; attempted ${attempts.map((cmd) => `${cliName} ${cmd}`).join(" and ")}. ${failures.join("; ")}`);
}

export function mergeCliCapabilities(
  existingCliParams: unknown,
  payload: ReturnType<typeof parseCapabilityPayload>,
  resolutions: Record<string, ConflictResolution>,
): { cliParams: JsonRecord; added: string[]; skipped: string[]; conflicts: ImportConflict[] } {
  const cliParams = cloneJson(record(existingCliParams));
  const parametersContainer = cloneJson(record(cliParams.parameters));
  const actionsContainer = cloneJson(record(cliParams.action_commands));
  const parameters = arrayOfRecords(parametersContainer.items);
  const actions = arrayOfRecords(actionsContainer.items);
  const added: string[] = [];
  const skipped: string[] = [];
  const conflicts: ImportConflict[] = [];
  const defaultCliName = asString(cliParams.CLI_Name) ?? asString(cliParams.cli_name);

  mergeItems(parameters, payload.parameters, resolutions, { added, skipped, conflicts }, defaultCliName);
  mergeItems(actions, payload.actions, resolutions, { added, skipped, conflicts }, defaultCliName);

  cliParams.parameters = { ...parametersContainer, items: parameters };
  cliParams.action_commands = { ...actionsContainer, items: actions };

  return { cliParams, added, skipped, conflicts };
}

function mergeItems(
  target: JsonRecord[],
  importedItems: JsonRecord[],
  resolutions: Record<string, ConflictResolution>,
  result: { added: string[]; skipped: string[]; conflicts: ImportConflict[] },
  defaultCliName: string | undefined,
): void {
  for (const imported of importedItems) {
    const ref = itemRef(imported);
    if (ref === undefined) {
      continue;
    }

    const existingIndex = target.findIndex((candidate) => itemRef(candidate, defaultCliName) === ref);
    if (existingIndex === -1) {
      target.push(cloneJson(imported));
      result.added.push(ref);
      continue;
    }

    const existing = target[existingIndex];
    if (recordsEqual(existing, imported)) {
      result.skipped.push(ref);
      continue;
    }

    const resolution = resolutions[ref];
    if (resolution === "imported") {
      target[existingIndex] = { ...cloneJson(imported), enabled: false };
      continue;
    }

    if (resolution === "existing" || resolution === "skip") {
      result.skipped.push(ref);
      continue;
    }

    result.conflicts.push({ ref, existing: cloneJson(existing), imported: cloneJson(imported) });
  }
}

function normalizeImportedItem(cliName: string, item: JsonRecord): JsonRecord {
  const normalized = cloneJson(item);
  if (asString(normalized.CLI_Name) === undefined) {
    normalized.CLI_Name = cliName;
  }
  normalized.enabled = false;
  return normalized;
}

function itemRef(item: JsonRecord, defaultCliName?: string): string | undefined {
  const name = asString(item.name);
  const cliName = asString(item.CLI_Name) ?? asString(item.cli_name) ?? defaultCliName;
  return name !== undefined && cliName !== undefined ? `${cliName}:${name}` : undefined;
}

function recordsEqual(left: JsonRecord, right: JsonRecord): boolean {
  return JSON.stringify(sortJson(left)) === JSON.stringify(sortJson(right));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key])]));
}
