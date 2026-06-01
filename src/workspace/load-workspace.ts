import { existsSync, readFileSync } from "node:fs";

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
  if (!existsSync(path)) {
    throw new Error(`workspace file does not exist: ${path}`);
  }

  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  const root = unwrapGui(parsed);
  const cliParams = record(root.cli_params);
  const cliName = stringValue(cliParams.cli_name) ?? stringValue(cliParams.CLI_Name) ?? "default";

  return {
    sourcePath: path,
    rois: records(root.rois).map(parseRoi),
    anchors: records(root.anchors).map(parseAnchor),
    cli: {
      enabled: booleanValue(cliParams.enabled, true),
      defaultCliName: cliName,
      parameters: parseParameters(cliParams, cliName),
      actions: parseActions(cliParams, cliName),
    },
  };
}

function unwrapGui(value: unknown): JsonRecord {
  const root = record(value);
  const gui = root.GUI;
  return isRecord(gui) ? gui : root;
}

function parseRoi(roi: JsonRecord, index: number): WorkspaceRoi {
  const name = stringValue(roi.name);
  const ref = stringValue(roi.ref) ?? name ?? `roi:${index}`;

  return {
    ref,
    name,
    active: booleanValue(roi.active, true),
    linkedObservables: strings(roi.linked_observables),
    schema: roi,
  };
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

function parseParameters(cliParams: JsonRecord, cliName: string): Map<string, CliParameter> {
  const parameters = new Map<string, CliParameter>();
  const container = record(cliParams.parameters);

  for (const [index, parameter] of itemRecords(container.items, "cli_params.parameters.items").entries()) {
    const name = stringValue(parameter.name);
    if (!name) {
      throw new Error(`workspace parameter at cli_params.parameters.items[${index}] is missing name`);
    }

    const parameterCliName = itemCliName(parameter, cliName);
    const ref = `${parameterCliName}:${name}`;
    parameters.set(ref, {
      ref,
      cliName: parameterCliName,
      name,
      label: stringValue(parameter.label),
      description: stringValue(parameter.description),
      enabled: booleanValue(parameter.enabled, true),
      actions: deriveActions(parameter),
      linkedObservables: linkedObservables(parameter),
      schema: parameter,
    });
  }

  return parameters;
}

function parseActions(cliParams: JsonRecord, cliName: string): Map<string, CliAction> {
  const actions = new Map<string, CliAction>();
  const container = record(cliParams.action_commands);

  for (const [index, action] of itemRecords(container.items, "cli_params.action_commands.items").entries()) {
    const name = stringValue(action.name);
    if (!name) {
      throw new Error(`workspace action at cli_params.action_commands.items[${index}] is missing name`);
    }

    const actionCliName = itemCliName(action, cliName);
    const ref = `${actionCliName}:${name}`;
    actions.set(ref, {
      ref,
      cliName: actionCliName,
      name,
      description: stringValue(action.description),
      enabled: booleanValue(action.enabled, true),
      safetyMode: stringValue(action.safety_mode),
      actions: deriveActions(action),
      linkedObservables: linkedObservables(action),
      actionCmd: action.action_cmd,
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
