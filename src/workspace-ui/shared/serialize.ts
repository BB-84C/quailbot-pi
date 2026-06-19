import { anchorToJson, cliParamToJson, groupToJson, roiToJson, type AnchorDraft, type CliParamDraft, type GroupDraft, type RoiDraft } from "./model.js";

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

function normalizedCliName(value: string): string {
  return (value || "cli").trim() || "cli";
}

export function serializeCliTools(args: { existingTools: unknown; enabled: boolean; params: CliParamDraft[] }): Record<string, unknown> {
  const toolsOut = isRecord(args.existingTools) ? cloneRecord(args.existingTools) : {};
  const previousCli = toolsOut.cli;
  const cliOut = isRecord(previousCli) ? cloneRecord(previousCli) : {};
  const serializedParams: Record<string, unknown> = {};
  const serializedActions: Record<string, unknown> = {};
  for (const param of args.params) {
    const key = param.name.trim();
    if (!key) continue;
    if (isRecord(param.action_cmd)) {
      serializedActions[key] = cliParamToJson(param);
    } else {
      serializedParams[key] = cliParamToJson(param);
    }
  }
  cliOut.enabled = Boolean(args.enabled);
  cliOut.parameters = serializedParams;
  cliOut.actions = serializedActions;
  toolsOut.cli = cliOut;
  return toolsOut;
}

export function serializeCliParamsBlock(args: { existingRaw: unknown; cliName: string; enabled: boolean; params: CliParamDraft[] }): Record<string, unknown> {
  const out = isRecord(args.existingRaw) ? cloneRecord(args.existingRaw) : {};
  const previous = out.cli_params;
  const cliOut = isRecord(previous) ? cloneRecord(previous) : {};
  const sortedParams = args.params
    .filter((param) => param.name.trim())
    .slice()
    .sort((a, b) => (a.label.toLowerCase() || a.name.toLowerCase()).localeCompare(b.label.toLowerCase() || b.name.toLowerCase()));
  const paramItems = sortedParams.filter((param) => !isRecord(param.action_cmd)).map(cliParamToJson);
  const actionItems = sortedParams.filter((param) => isRecord(param.action_cmd)).map(cliParamToJson);

  cliOut.cli_name = normalizedCliName(args.cliName);
  cliOut.enabled = Boolean(args.enabled);
  cliOut.parameters = {
    count: paramItems.length,
    items: paramItems,
  };
  cliOut.action_commands = {
    count: actionItems.length,
    items: actionItems,
  };
  out.cli_params = cliOut;
  return out;
}

export function buildWorkspaceJson(args: {
  raw: Record<string, unknown>;
  rois: RoiDraft[];
  anchors: AnchorDraft[];
  groups: GroupDraft[];
  cliName: string;
  cliEnabled: boolean;
  cliParams: CliParamDraft[];
}): Record<string, unknown> {
  let out = cloneRecord(args.raw);
  out.rois = args.rois.map(roiToJson);
  out.anchors = args.anchors.map(anchorToJson);
  out.groups = args.groups.map(groupToJson);
  if (isRecord(out.GUI)) {
    out.GUI = { ...cloneRecord(out.GUI), rois: out.rois, anchors: out.anchors, groups: out.groups };
  }
  out.tools = serializeCliTools({ existingTools: out.tools ?? {}, enabled: Boolean(args.cliEnabled), params: args.cliParams });
  out = serializeCliParamsBlock({ existingRaw: out, cliName: normalizedCliName(args.cliName), enabled: Boolean(args.cliEnabled), params: args.cliParams });
  return out;
}

export function stringifyWorkspaceJson(obj: Record<string, unknown>): string {
  // Python parity: json.dumps(indent=2, sort_keys=False, ensure_ascii=False) + "\n" — LF, not CRLF.
  return `${JSON.stringify(obj, null, 2)}\n`;
}
