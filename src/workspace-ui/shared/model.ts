import { normalizeSafetyMode, parseBool } from "./parse.js";

export interface RoiDraft {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  description: string;
  tags: string;
  active: boolean;
  group: string;
}

export interface AnchorDraft {
  name: string;
  x: number;
  y: number;
  description: string;
  tags: string;
  linked_rois: string[];
  active: boolean;
  group: string;
}

export interface GroupDraft {
  name: string;
  description: string;
  tags: string;
  active: boolean;
  group: string;
  collapsed: boolean;
}

export interface CliParamDraft {
  cli_name: string;
  name: string;
  label: string;
  description: string;
  tags: string;
  enabled: boolean;
  group: string;
  allow_get: boolean;
  allow_set: boolean;
  allow_ramp: boolean;
  readable: boolean;
  writable: boolean;
  has_ramp: boolean;
  safety: Record<string, unknown> | null;
  get_cmd: Record<string, unknown> | null;
  set_cmd: Record<string, unknown> | null;
  safety_mode: string;
  action_cmd: Record<string, unknown> | null;
  linked_observables: string[];
  raw_item: Record<string, unknown>;
}

function splitTags(tags: string): string[] {
  return (tags || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

function cleanLinked(values: string[]): string[] {
  return (values || [])
    .map((value) => String(value).trim())
    .filter((value) => value.length > 0);
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = item;
  }
  return out;
}

function cliName(value: string): string {
  return (value || "cli").trim() || "cli";
}

export function roiToJson(d: RoiDraft): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: d.name,
    x: Math.trunc(d.x),
    y: Math.trunc(d.y),
    w: Math.trunc(d.w),
    h: Math.trunc(d.h),
    description: d.description,
    active: Boolean(d.active),
  };
  const tags = splitTags(d.tags);
  if (tags.length > 0) {
    out.tags = tags;
  }
  if (d.group) {
    out.group = d.group;
  }
  return out;
}

export function anchorToJson(d: AnchorDraft): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: d.name,
    x: Math.trunc(d.x),
    y: Math.trunc(d.y),
    description: d.description,
    active: Boolean(d.active),
  };
  const tags = splitTags(d.tags);
  if (tags.length > 0) {
    out.tags = tags;
  }
  const linked = cleanLinked(d.linked_rois);
  if (linked.length > 0) {
    out.linked_observables = linked;
    out.linked_ROIs = linked;
  }
  if (d.group) {
    out.group = d.group;
  }
  return out;
}

export function groupToJson(d: GroupDraft): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: d.name,
    description: d.description,
    active: Boolean(d.active),
  };
  const tags = splitTags(d.tags);
  if (tags.length > 0) {
    out.tags = tags;
  }
  if (d.group) {
    out.group = d.group;
  }
  return out;
}

export function cliParamActive(d: CliParamDraft): boolean {
  return Boolean(d.enabled);
}

export function implicitSelfObservable(d: CliParamDraft): string | null {
  const key = d.name.trim();
  if (key && d.allow_get && (d.allow_set || d.allow_ramp)) {
    return key;
  }
  return null;
}

export function runtimeLinkedObservables(d: CliParamDraft): Array<{ name: string; editable: boolean }> {
  const values: Array<{ name: string; editable: boolean }> = [];
  const seen = new Set<string>();
  const implicit = implicitSelfObservable(d);
  if (implicit) {
    values.push({ name: implicit, editable: false });
    seen.add(implicit);
  }
  for (const item of d.linked_observables) {
    const key = String(item).trim();
    if (!key || seen.has(key)) {
      continue;
    }
    values.push({ name: key, editable: true });
    seen.add(key);
  }
  return values;
}

export function editableLinkedObservables(d: CliParamDraft): string[] {
  return runtimeLinkedObservables(d)
    .filter((item) => item.editable)
    .map((item) => item.name);
}

export function syncActionsFromMetadata(d: CliParamDraft): void {
  if (d.action_cmd !== null && typeof d.action_cmd === "object" && !Array.isArray(d.action_cmd)) {
    d.readable = false;
    d.writable = false;
    d.has_ramp = false;
    d.allow_get = false;
    d.allow_set = false;
    d.allow_ramp = false;
    d.safety = null;
    return;
  }
  let rampEnabled = true;
  if (d.safety !== null && typeof d.safety === "object" && !Array.isArray(d.safety)) {
    rampEnabled = parseBool(d.safety.ramp_enabled, true);
  }
  if (d.set_cmd === null) {
    d.writable = false;
  }
  d.allow_get = Boolean(d.readable);
  d.allow_set = Boolean(d.writable && d.set_cmd !== null);
  d.allow_ramp = Boolean(d.writable && d.set_cmd !== null && d.has_ramp && rampEnabled);
}

export function cliParamToJson(d: CliParamDraft): Record<string, unknown> {
  const merged = d.raw_item && typeof d.raw_item === "object" && !Array.isArray(d.raw_item) ? cloneRecord(d.raw_item) : {};
  const normalizedCliName = cliName(d.cli_name);

  if (d.action_cmd !== null && typeof d.action_cmd === "object" && !Array.isArray(d.action_cmd)) {
    merged.CLI_Name = normalizedCliName;
    merged.name = d.name;
    merged.enabled = Boolean(d.enabled);
    merged.description = d.description;
    merged.safety_mode = normalizeSafetyMode(d.safety_mode);
    merged.action_cmd = cloneRecord(d.action_cmd);

    const tags = splitTags(d.tags);
    if (tags.length > 0) {
      merged.tags = tags;
    } else {
      delete merged.tags;
    }
    if (d.group) {
      merged.group = d.group;
    } else {
      delete merged.group;
    }
    const linked = cleanLinked(d.linked_observables);
    if (linked.length > 0) {
      merged.linked_observables = linked;
    } else {
      delete merged.linked_observables;
    }
    delete merged.linked_ROIs;
    return merged;
  }

  merged.name = d.name;
  merged.CLI_Name = normalizedCliName;
  merged.label = d.label || d.name;
  merged.readable = Boolean(d.readable);
  merged.writable = Boolean(d.writable);
  merged.has_ramp = Boolean(d.has_ramp);
  merged.enabled = Boolean(d.enabled);
  merged.description = d.description;

  if (d.get_cmd !== null) {
    merged.get_cmd = cloneRecord(d.get_cmd);
  }
  if (d.set_cmd !== null) {
    const setCmd = cloneRecord(d.set_cmd);
    delete setCmd.value_arg;
    merged.set_cmd = setCmd;
  }

  delete merged.unit;
  delete merged.value_type;
  delete merged.snapshot_value;
  delete merged.vals;
  const mergedSetCmd = merged.set_cmd;
  if (mergedSetCmd !== null && typeof mergedSetCmd === "object" && !Array.isArray(mergedSetCmd)) {
    delete (mergedSetCmd as Record<string, unknown>).value_arg;
  }
  merged.safety = d.safety === null ? null : cloneRecord(d.safety);
  merged.actions = {
    get: Boolean(d.allow_get),
    set: Boolean(d.allow_set),
    ramp: Boolean(d.allow_ramp),
  };

  const tags = splitTags(d.tags);
  if (tags.length > 0) {
    merged.tags = tags;
  } else {
    delete merged.tags;
  }
  if (d.group) {
    merged.group = d.group;
  } else {
    delete merged.group;
  }
  const linked = cleanLinked(d.linked_observables);
  if (linked.length > 0) {
    merged.linked_observables = linked;
  } else {
    delete merged.linked_observables;
  }
  delete merged.linked_ROIs;

  const labelValue = String(merged.label ?? (d.label || d.name));
  delete merged.label;
  const out: Record<string, unknown> = { label: labelValue };
  for (const [key, value] of Object.entries(merged)) {
    out[key] = value;
  }
  return out;
}
