import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type {
  CliAction,
  CliActionPermissions,
  CliParameter,
  Workspace,
  WorkspaceAnchor,
  WorkspaceRoi,
} from "./types.js";

type JsonRecord = Record<string, unknown>;

export function loadWorkspace(path: string): Workspace {
  const sourcePath = resolve(path);
  if (!existsSync(sourcePath)) {
    throw new Error(`workspace file does not exist: ${sourcePath}`);
  }

  const parsed: unknown = JSON.parse(readFileSync(sourcePath, "utf8"));
  const root = unwrapGui(parsed);
  const cliSource = parseCliSource(root);
  const cliParamsRecord = cliSource?.config ?? {};
  const cliName = stringValue(cliParamsRecord.cli_name) ?? stringValue(cliParamsRecord.CLI_Name) ?? "default";
  const itemDefaultEnabled = cliSource?.kind === "tools.cli";

  return {
    sourcePath,
    rois: records(root.rois).map(parseRoi),
    anchors: records(root.anchors).map(parseAnchor),
    cli: {
      enabled: cliSource !== undefined ? booleanValue(cliParamsRecord.enabled, cliSource.kind === "cli_params") : false,
      defaultCliName: cliName,
      parameters: parseParameters(cliParamsRecord, cliName, itemDefaultEnabled),
      actions: parseActions(cliParamsRecord, cliName, itemDefaultEnabled),
    },
  };
}

function parseCliSource(root: JsonRecord): { kind: "cli_params" | "tools.cli"; config: JsonRecord } | undefined {
  if (root.cli_params !== undefined) {
    if (!isRecord(root.cli_params)) {
      throw new Error("workspace cli_params must be an object");
    }

    return { kind: "cli_params", config: root.cli_params };
  }

  if (root.tools === undefined) {
    return undefined;
  }

  if (!isRecord(root.tools)) {
    throw new Error("workspace tools must be an object");
  }

  const cli = root.tools.cli;
  if (cli === undefined) {
    return undefined;
  }

  if (!isRecord(cli)) {
    throw new Error("workspace tools.cli must be an object");
  }

  return { kind: "tools.cli", config: cli };
}

function unwrapGui(value: unknown): JsonRecord {
  const root = record(value);
  const gui = root.GUI;
  if (!isRecord(gui)) {
    return root;
  }

  return {
    ...root,
    ...gui,
    cli_params: gui.cli_params ?? root.cli_params,
    tools: gui.tools ?? root.tools,
  };
}

function parseRoi(roi: JsonRecord, index: number): WorkspaceRoi {
  const name = stringValue(roi.name);
  const ref = stringValue(roi.ref) ?? name ?? `roi:${index}`;
  validateRoiGeometry(roi, name ?? ref);

  return {
    ref,
    name,
    active: booleanValue(roi.active, true),
    linkedObservables: strings(roi.linked_observables),
    schema: roi,
  };
}

function validateRoiGeometry(roi: JsonRecord, label: string): void {
  const width = roi.w;
  const height = roi.h;
  if (
    (width !== undefined && (typeof width !== "number" || !Number.isFinite(width) || width <= 0)) ||
    (height !== undefined && (typeof height !== "number" || !Number.isFinite(height) || height <= 0))
  ) {
    throw new Error(`ROI ${label} width and height must be positive`);
  }
}

function parseAnchor(anchor: JsonRecord, index: number): WorkspaceAnchor {
  const name = stringValue(anchor.name);
  const ref = stringValue(anchor.ref) ?? name ?? `anchor:${index}`;
  const linkedRois = strings(anchor.linked_ROIs);

  return {
    ref,
    name,
    active: booleanValue(anchor.active, true),
    linkedObservables: strings(anchor.linked_observables ?? anchor.linked_ROIs),
    linkedRois,
    schema: anchor,
  };
}

function parseParameters(cliParams: JsonRecord, cliName: string, defaultEnabled: boolean): Map<string, CliParameter> {
  const parameters = new Map<string, CliParameter>();
  const container = record(cliParams.parameters);

  for (const { item: parameter, nameHint, index, context } of sectionEntries(container, "cli_params.parameters")) {
    if (isRecord(parameter.action_cmd)) {
      continue;
    }
    const name = stringValue(parameter.name) ?? nameHint;
    if (!name) {
      throw new Error(`workspace parameter at ${context}[${index}] is missing name`);
    }

    const parameterCliName = itemCliName(parameter, cliName);
    const ref = `${parameterCliName}:${name}`;
    parameters.set(ref, {
      ref,
      cliName: parameterCliName,
      name,
      label: stringValue(parameter.label),
      description: stringValue(parameter.description),
      enabled: booleanValue(parameter.enabled, defaultEnabled),
      actions: deriveActions(parameter),
      linkedObservables: linkedObservables(parameter),
      schema: parameter,
    });
  }

  return parameters;
}

function parseActions(cliParams: JsonRecord, cliName: string, defaultEnabled: boolean): Map<string, CliAction> {
  const actions = new Map<string, CliAction>();

  for (const { item: action, nameHint, index, context } of [
    ...sectionEntries(record(cliParams.parameters), "cli_params.parameters"),
    ...sectionEntries(record(cliParams.action_commands), "cli_params.action_commands"),
    ...sectionEntries(record(cliParams.actions), "cli_params.actions"),
  ]) {
    if (context === "cli_params.parameters" && !isRecord(action.action_cmd)) {
      continue;
    }
    const name = stringValue(action.name) ?? nameHint;
    if (!name) {
      throw new Error(`workspace action at ${context}[${index}] is missing name`);
    }

    const actionCliName = itemCliName(action, cliName);
    const ref = `${actionCliName}:${name}`;
    actions.set(ref, {
      ref,
      cliName: actionCliName,
      name,
      description: stringValue(action.description),
      enabled: booleanValue(action.enabled, defaultEnabled),
      safetyMode: stringValue(action.safety_mode),
      actions: deriveActions(action),
      linkedObservables: linkedObservables(action),
      actionCmd: parseActionCmd(action, index, context),
      schema: action,
    });
  }

  return actions;
}

function deriveActions(schema: JsonRecord): CliActionPermissions {
  const explicitActions = record(schema.actions);
  const safety = record(schema.safety);
  const derived: CliActionPermissions = {
    get: booleanValue(schema.readable, false),
    set: booleanValue(schema.writable, false) && isRecord(schema.set_cmd),
    ramp:
      booleanValue(schema.writable, false) &&
      booleanValue(schema.has_ramp, false) &&
      booleanValue(safety.ramp_enabled, false),
  };

  return {
    get: booleanValue(explicitActions.get, derived.get),
    set: booleanValue(explicitActions.set, derived.set),
    ramp: booleanValue(explicitActions.ramp, derived.ramp),
  };
}

function itemCliName(item: JsonRecord, defaultCliName: string): string {
  return stringValue(item.cli_name) ?? stringValue(item.CLI_Name) ?? defaultCliName;
}

function linkedObservables(item: JsonRecord): string[] {
  return strings(item.linked_observables ?? item.linked_ROIs);
}

function parseActionCmd(action: JsonRecord, index: number, context: string): JsonRecord | undefined {
  if (action.action_cmd === undefined) {
    return undefined;
  }

  if (!isRecord(action.action_cmd)) {
    throw new Error(`workspace action at ${context}[${index}] action_cmd must be an object`);
  }

  return action.action_cmd;
}

function sectionEntries(container: JsonRecord, context: string): Array<{ item: JsonRecord; nameHint: string | undefined; index: number; context: string }> {
  if (Array.isArray(container.items)) {
    return itemRecords(container.items, `${context}.items`).map((item, index) => ({
      item,
      nameHint: undefined,
      index,
      context: `${context}.items`,
    }));
  }

  const entries: Array<{ item: JsonRecord; nameHint: string | undefined; index: number; context: string }> = [];
  for (const [key, value] of Object.entries(container)) {
    if (key === "items" || key === "count") {
      continue;
    }
    if (!isRecord(value)) {
      throw new Error(`workspace ${context}.${key} must be an object`);
    }
    entries.push({ item: value, nameHint: key, index: entries.length, context });
  }
  return entries;
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function records(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord);
}

function itemRecords(value: unknown, context: string): JsonRecord[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`workspace ${context} must be an array`);
  }

  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`workspace ${context}[${index}] must be an object`);
    }

    return item;
  });
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}
