import { execFileSync } from "node:child_process";

import { asString, cloneJson, isRecord, record, type JsonRecord } from "./json.js";

export type ConflictResolution = "existing" | "imported" | "skip";
export type ImportConflict = { ref: string; existing: JsonRecord; imported: JsonRecord };

type ParsedCapabilityPayload = { cliName: string; parameters: JsonRecord[]; actions: JsonRecord[] };

const DISCOVERY_TIMEOUT_MS = 90_000;

export function parseCapabilityPayload(cliName: string, payload: unknown): ParsedCapabilityPayload {
  const root = record(payload);
  const parameters = parseCapabilityItems(root.parameters, "parameters.items").map((item) =>
    normalizeImportedItem(cliName, item),
  );
  const actions = parseCapabilityItems(root.action_commands, "action_commands.items").map((item) =>
    normalizeImportedItem(cliName, item),
  );

  return { cliName, parameters, actions };
}

function parseCapabilityItems(section: unknown, path: string): JsonRecord[] {
  if (section === undefined) {
    return [];
  }

  if (!isRecord(section)) {
    throw new Error(`capability payload ${path.replace(/\.items$/, "")} must be an object`);
  }

  if (section.items === undefined) {
    return [];
  }

  if (!Array.isArray(section.items)) {
    throw new Error(`capability payload ${path} must be an array`);
  }

  return section.items.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`capability payload ${path}[${index}] must be an object`);
    }
    return cloneJson(item);
  });
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
  const parametersSection = prepareExistingSection(cliParams.parameters);
  const actionsSection = prepareExistingSection(cliParams.action_commands);
  const added: string[] = [];
  const skipped: string[] = [];
  const conflicts: ImportConflict[] = [];
  const defaultCliName = asString(cliParams.CLI_Name) ?? asString(cliParams.cli_name);

  if (parametersSection.canMerge) {
    mergeItems(parametersSection.items, payload.parameters, resolutions, { added, skipped, conflicts }, defaultCliName);
    cliParams.parameters = { ...parametersSection.container, items: parametersSection.items };
  }

  if (actionsSection.canMerge) {
    mergeItems(actionsSection.items, payload.actions, resolutions, { added, skipped, conflicts }, defaultCliName);
    cliParams.action_commands = { ...actionsSection.container, items: actionsSection.items };
  }

  return { cliParams, added, skipped, conflicts };
}

function prepareExistingSection(
  section: unknown,
): { canMerge: true; container: JsonRecord; items: unknown[] } | { canMerge: false } {
  if (section === undefined) {
    return { canMerge: true, container: {}, items: [] };
  }

  if (!isRecord(section)) {
    return { canMerge: false };
  }

  const container = cloneJson(section);
  if (container.items === undefined) {
    return { canMerge: true, container, items: [] };
  }

  if (!Array.isArray(container.items)) {
    return { canMerge: false };
  }

  return { canMerge: true, container, items: cloneJson(container.items) as unknown[] };
}

function mergeItems(
  target: unknown[],
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

    const existingIndex = target.findIndex(
      (candidate) => isRecord(candidate) && itemRef(candidate, defaultCliName) === ref,
    );
    if (existingIndex === -1) {
      target.push(cloneJson(imported));
      result.added.push(ref);
      continue;
    }

    const existing = target[existingIndex] as JsonRecord;
    if (recordsEqual(existing, imported, defaultCliName)) {
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

function recordsEqual(left: JsonRecord, right: JsonRecord, defaultCliName: string | undefined): boolean {
  return (
    JSON.stringify(sortJson(comparableCapability(left, defaultCliName))) ===
    JSON.stringify(sortJson(comparableCapability(right)))
  );
}

function comparableCapability(item: JsonRecord, defaultCliName?: string): { cliName?: string; schema: JsonRecord } {
  const schema = cloneJson(item);
  const cliName = asString(schema.CLI_Name) ?? asString(schema.cli_name) ?? defaultCliName;
  delete schema.enabled;
  delete schema.CLI_Name;
  delete schema.cli_name;
  return { cliName, schema };
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
