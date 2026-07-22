import type { AnchorDraft, CliParamDraft, GroupDraft, RoiDraft } from "./model.js";

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

function pyString(value: unknown): string {
  if (value === null || value === undefined) {
    return value === null ? "None" : "";
  }
  if (value === true) {
    return "True";
  }
  if (value === false) {
    return "False";
  }
  return String(value);
}

function toInt(value: unknown): number {
  if (typeof value === "number") {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    return Math.trunc(Number.parseInt(value, 10));
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  return 0;
}

function tagsFromRaw(value: unknown): string {
  if (Array.isArray(value)) {
    return value.filter((item) => ["string", "number"].includes(typeof item)).map((item) => String(item)).join(",");
  }
  if (typeof value === "string") {
    return Array.from(value).join(",");
  }
  return "";
}

function cliTagsFromRaw(value: unknown): string {
  if (Array.isArray(value)) {
    return value.filter((item) => ["string", "number"].includes(typeof item)).map((item) => String(item)).join(",");
  }
  if (value !== null && value !== undefined) {
    return String(value);
  }
  return "";
}

function defaultCliDraft(overrides: Partial<CliParamDraft>): CliParamDraft {
  return {
    cli_name: "cli",
    name: "",
    label: "",
    description: "",
    tags: "",
    enabled: true,
    group: "",
    allow_get: false,
    allow_set: false,
    allow_ramp: false,
    readable: true,
    writable: true,
    has_ramp: false,
    safety: null,
    get_cmd: null,
    set_cmd: null,
    safety_mode: "guarded",
    action_cmd: null,
    linked_observables: [],
    raw_item: {},
    ...overrides,
  };
}

export function parseActive(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Boolean(value);
  }
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(lowered)) {
      return true;
    }
    if (["false", "0", "no", "n"].includes(lowered)) {
      return false;
    }
  }
  return true;
}

export function parseBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value === "number") {
    return Boolean(value);
  }
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(lowered)) {
      return true;
    }
    if (["false", "0", "no", "n", "off"].includes(lowered)) {
      return false;
    }
  }
  return fallback;
}

export function parseLinkedValues(value: unknown): string[] {
  if (value === null || value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter((item) => item.length > 0);
  }
  const key = String(value).trim();
  return key ? [key] : [];
}

export function normalizeSafetyMode(value: unknown): "alwaysAllowed" | "blocked" | "guarded" {
  const lowered = String(value || "").trim().toLowerCase();
  if (lowered === "alwaysallowed") {
    return "alwaysAllowed";
  }
  if (lowered === "blocked") {
    return "blocked";
  }
  return "guarded";
}

export function safeFloat(text: string, fallback: number): number {
  const stripped = text.trim();
  if (!stripped) {
    return fallback;
  }
  const value = Number.parseFloat(stripped);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  if (Number.isInteger(fallback) && Number.isInteger(value)) {
    return Math.trunc(value);
  }
  return value;
}

export function deriveActionsFromItem(item: Record<string, unknown>): { readable: boolean; allowSet: boolean; allowRamp: boolean } {
  const actionsRaw = item.actions;
  if (isRecord(actionsRaw)) {
    return {
      readable: parseBool(actionsRaw.get, false),
      allowSet: parseBool(actionsRaw.set, false),
      allowRamp: parseBool(actionsRaw.ramp, false),
    };
  }
  const readable = parseBool(item.readable, false);
  const writable = parseBool(item.writable, false);
  const hasRamp = parseBool(item.has_ramp, false);
  const safetyRaw = item.safety;
  let rampEnabled = true;
  if (isRecord(safetyRaw)) {
    rampEnabled = parseBool(safetyRaw.ramp_enabled, true);
  }
  const allowSet = writable && item.set_cmd !== null && item.set_cmd !== undefined;
  const allowRamp = writable && item.set_cmd !== null && item.set_cmd !== undefined && hasRamp && rampEnabled;
  return { readable, allowSet, allowRamp };
}

export function draftFromParameterItem(args: {
  nameHint: string;
  value: unknown;
  defaultEnabled: boolean;
  defaultCliName: string;
}): CliParamDraft | null {
  const { nameHint, value, defaultEnabled, defaultCliName } = args;
  if (!isRecord(value)) {
    return null;
  }
  const name = (pyString(value.name ?? nameHint).trim() || pyString(nameHint).trim());
  if (!name) {
    return null;
  }
  const cliName = pyString(value.CLI_Name ?? defaultCliName).trim() || pyString(defaultCliName).trim() || "cli";

  let linked = parseLinkedValues(value.linked_observables);
  if (linked.length === 0) {
    linked = parseLinkedValues(value.linked_ROIs);
  }
  const tags = cliTagsFromRaw(value.tags);
  const actionCmdRaw = value.action_cmd;
  const actionCmd = isRecord(actionCmdRaw) ? cloneRecord(actionCmdRaw) : null;
  if (actionCmd !== null) {
    let description = pyString(value.description ?? "").trim();
    if (!description) {
      description = pyString(actionCmd.description ?? "").trim();
    }
    return defaultCliDraft({
      cli_name: cliName,
      name,
      label: pyString(value.label ?? ""),
      enabled: parseBool(value.enabled, defaultEnabled),
      description,
      tags,
      group: pyString(value.group ?? ""),
      safety_mode: normalizeSafetyMode(value.safety_mode),
      action_cmd: actionCmd,
      linked_observables: linked,
      raw_item: cloneRecord(value),
    });
  }

  const actions = deriveActionsFromItem(value);
  const actionsOverridden = isRecord(value.actions);
  const safetyRaw = value.safety;
  const safety = isRecord(safetyRaw) ? cloneRecord(safetyRaw) : null;
  const getCmd = isRecord(value.get_cmd) ? cloneRecord(value.get_cmd) : null;
  const setCmd = isRecord(value.set_cmd) ? cloneRecord(value.set_cmd) : null;
  let writable = parseBool(value.writable, actions.allowSet || actions.allowRamp);
  if (setCmd === null) {
    writable = false;
  }

  return defaultCliDraft({
    cli_name: cliName,
    name,
    label: pyString(value.label ?? ""),
    enabled: parseBool(value.enabled, defaultEnabled),
    description: pyString(value.description ?? ""),
    tags,
    group: pyString(value.group ?? ""),
    allow_get: actions.readable,
    allow_set: actions.allowSet,
    allow_ramp: actions.allowRamp,
    actions_overridden: actionsOverridden,
    readable: parseBool(value.readable, actions.readable),
    writable,
    has_ramp: parseBool(value.has_ramp, actions.allowRamp),
    safety,
    get_cmd: getCmd,
    set_cmd: setCmd,
    linked_observables: linked,
    raw_item: cloneRecord(value),
  });
}

export function parseCliParameterDrafts(toolsRaw: unknown): { enabled: boolean; params: CliParamDraft[] } {
  if (!isRecord(toolsRaw)) {
    return { enabled: false, params: [] };
  }
  const cliRaw = toolsRaw.cli;
  if (!isRecord(cliRaw)) {
    return { enabled: false, params: [] };
  }
  const enabled = parseBool(cliRaw.enabled, false);
  const defaultCliName = pyString(cliRaw.cli_name ?? "cli").trim() || "cli";
  const parametersRaw = isRecord(cliRaw.parameters) ? cliRaw.parameters : {};
  const actionsRaw = isRecord(cliRaw.actions) ? cliRaw.actions : {};
  const actionCommandsRaw = isRecord(cliRaw.action_commands) ? cliRaw.action_commands : {};
  const params: CliParamDraft[] = [];

  for (const [key, value] of Object.entries(parametersRaw)) {
    const draft = draftFromParameterItem({ nameHint: key.trim(), value, defaultEnabled: true, defaultCliName });
    if (draft !== null) params.push(draft);
  }
  for (const [key, value] of Object.entries(actionsRaw)) {
    const draft = draftFromParameterItem({ nameHint: key.trim(), value, defaultEnabled: true, defaultCliName });
    if (draft !== null) params.push(draft);
  }
  for (const [key, value] of Object.entries(actionCommandsRaw)) {
    if (["count", "items"].includes(String(key))) continue;
    const draft = draftFromParameterItem({ nameHint: key.trim(), value, defaultEnabled: true, defaultCliName });
    if (draft !== null) params.push(draft);
  }
  params.sort((a, b) => (a.label || a.name).toLowerCase().localeCompare((b.label || b.name).toLowerCase()));
  return { enabled, params };
}

export function parseCliParamsBlock(raw: Record<string, unknown>): { cliName: string; enabled: boolean; params: CliParamDraft[] } {
  const cliRaw = raw.cli_params;
  if (isRecord(cliRaw)) {
    const cliName = pyString(cliRaw.cli_name ?? "cli").trim() || "cli";
    const enabled = parseBool(cliRaw.enabled, true);
    const params: CliParamDraft[] = [];
    const paramsRaw = cliRaw.parameters;
    if (isRecord(paramsRaw)) {
      const itemsRaw = paramsRaw.items;
      if (Array.isArray(itemsRaw)) {
        for (const item of itemsRaw) {
          const draft = draftFromParameterItem({ nameHint: "", value: item, defaultEnabled: false, defaultCliName: cliName });
          if (draft !== null) params.push(draft);
        }
      } else {
        for (const [key, value] of Object.entries(paramsRaw)) {
          if (["count", "items"].includes(String(key))) continue;
          const draft = draftFromParameterItem({ nameHint: key, value, defaultEnabled: false, defaultCliName: cliName });
          if (draft !== null) params.push(draft);
        }
      }
    }

    const actionsRaw = cliRaw.action_commands;
    if (isRecord(actionsRaw)) {
      const actionItems = actionsRaw.items;
      if (Array.isArray(actionItems)) {
        for (const item of actionItems) {
          const draft = draftFromParameterItem({ nameHint: "", value: item, defaultEnabled: false, defaultCliName: cliName });
          if (draft !== null) params.push(draft);
        }
      } else {
        for (const [key, value] of Object.entries(actionsRaw)) {
          if (["count", "items"].includes(String(key))) continue;
          const draft = draftFromParameterItem({ nameHint: key, value, defaultEnabled: false, defaultCliName: cliName });
          if (draft !== null) params.push(draft);
        }
      }
    }

    const cliActionsRaw = cliRaw.actions;
    if (isRecord(cliActionsRaw)) {
      for (const [key, value] of Object.entries(cliActionsRaw)) {
        const draft = draftFromParameterItem({ nameHint: key, value, defaultEnabled: false, defaultCliName: cliName });
        if (draft !== null) params.push(draft);
      }
    }
    params.sort((a, b) => (a.label || a.name).toLowerCase().localeCompare((b.label || b.name).toLowerCase()));
    return { cliName, enabled, params };
  }
  const parsed = parseCliParameterDrafts(raw.tools ?? {});
  return { cliName: "cli", enabled: parsed.enabled, params: parsed.params };
}

export function loadWorkspaceRaw(text: string | null): Record<string, unknown> {
  if (text === null) {
    return { rois: [], anchors: [], tools: {} };
  }
  const raw = JSON.parse(text) as unknown;
  if (!isRecord(raw)) {
    throw new ValueError("workspace must be a JSON object");
  }
  if (!("rois" in raw)) raw.rois = [];
  if (!("anchors" in raw)) raw.anchors = [];
  if (!("groups" in raw)) raw.groups = [];
  if (!("tools" in raw)) raw.tools = {};
  if (!Array.isArray(raw.rois) || !Array.isArray(raw.anchors) || !Array.isArray(raw.groups) || !isRecord(raw.tools)) {
    throw new ValueError("workspace fields must be {rois:list, anchors:list, groups:list, tools:object}");
  }
  return raw;
}

class ValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValueError";
  }
}

export function loadWorkspaceData(raw: Record<string, unknown>): {
  rois: RoiDraft[];
  anchors: AnchorDraft[];
  groups: GroupDraft[];
  cliName: string;
  cliEnabled: boolean;
  cliParams: CliParamDraft[];
} {
  const guiRaw = raw.GUI;
  const body = isRecord(guiRaw) ? guiRaw : raw;

  const rois: RoiDraft[] = [];
  const roisRaw = body.rois;
  if (Array.isArray(roisRaw)) {
    for (const item of roisRaw) {
      if (!isRecord(item)) continue;
      rois.push({
        name: pyString(item.name ?? ""),
        x: toInt(item.x ?? 0),
        y: toInt(item.y ?? 0),
        w: toInt(item.w ?? 0),
        h: toInt(item.h ?? 0),
        description: pyString(item.description ?? ""),
        tags: tagsFromRaw(item.tags ?? []),
        active: parseActive(item.active ?? true),
        group: pyString(item.group ?? ""),
      });
    }
  }

  const anchors: AnchorDraft[] = [];
  const anchorsRaw = body.anchors;
  if (Array.isArray(anchorsRaw)) {
    for (const item of anchorsRaw) {
      if (!isRecord(item)) continue;
      let linked = item.linked_observables;
      if (linked === null || linked === undefined) {
        linked = item.linked_ROIs ?? [];
      }
      const linkedList = Array.isArray(linked)
        ? linked.filter((value) => ["string", "number"].includes(typeof value) && String(value).trim()).map((value) => String(value))
        : [];
      anchors.push({
        name: pyString(item.name ?? ""),
        x: toInt(item.x ?? 0),
        y: toInt(item.y ?? 0),
        description: pyString(item.description ?? ""),
        tags: tagsFromRaw(item.tags ?? []),
        linked_rois: linkedList,
        active: parseActive(item.active ?? true),
        group: pyString(item.group ?? ""),
      });
    }
  }

  const groups: GroupDraft[] = [];
  const groupsRaw = body.groups;
  if (Array.isArray(groupsRaw)) {
    for (const item of groupsRaw) {
      if (!isRecord(item)) continue;
      groups.push({
        name: pyString(item.name ?? ""),
        description: pyString(item.description ?? ""),
        tags: tagsFromRaw(item.tags ?? []),
        active: parseActive(item.active ?? true),
        group: pyString(item.group ?? ""),
        collapsed: false,
      });
    }
  }

  const cli = parseCliParamsBlock(raw);
  return { rois, anchors, groups, cliName: cli.cliName, cliEnabled: cli.enabled, cliParams: cli.params };
}
