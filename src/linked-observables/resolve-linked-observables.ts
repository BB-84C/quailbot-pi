import type { Workspace } from "../workspace/types.js";

export type MutatingActionRef =
  | { kind: "cli_set" | "cli_ramp"; cli_name?: string; parameter: string; linked_observables?: string[] }
  | { kind: "cli_action"; cli_name?: string; action_name: string; linked_observables?: string[] }
  | { kind: "click_anchor" | "set_field"; anchor_ref?: string; anchor?: string; linked_observables?: string[] };

export type ResolvedLinkedObservables = {
  cli: string[];
  roi: string[];
  unresolved: string[];
};

export function resolveLinkedObservables(workspace: Workspace, actionRef: MutatingActionRef): ResolvedLinkedObservables {
  const resolved: ResolvedLinkedObservables = { cli: [], roi: [], unresolved: [] };
  const seen = {
    cli: new Set<string>(),
    roi: new Set<string>(),
    unresolved: new Set<string>(),
  };

  for (const name of sourceObservableNames(workspace, actionRef)) {
    const classification = classifyLinkedObservable(workspace, actionRef, name);
    if (classification.cli !== undefined) {
      addUnique(resolved.cli, seen.cli, classification.cli);
    }
    if (classification.roi !== undefined) {
      addUnique(resolved.roi, seen.roi, classification.roi);
    }
    if (classification.cli === undefined && classification.roi === undefined) {
      addUnique(resolved.unresolved, seen.unresolved, name);
    }
  }

  return resolved;
}

type Classification = {
  cli?: string;
  roi?: string;
};

function sourceObservableNames(workspace: Workspace, actionRef: MutatingActionRef): string[] {
  const names = [...(actionRef.linked_observables ?? [])];

  if (actionRef.kind === "cli_set" || actionRef.kind === "cli_ramp") {
    const parameter = cliParameter(workspace, actionRef.cli_name, actionRef.parameter);
    if (parameter) {
      if (parameter.actions.get) {
        names.push(parameter.ref);
      }
      names.push(...parameter.linkedObservables);
    }
  }

  if (actionRef.kind === "cli_action") {
    const action = cliAction(workspace, actionRef.cli_name, actionRef.action_name);
    if (action) {
      names.push(...action.linkedObservables);
    }
  }

  if (actionRef.kind === "click_anchor" || actionRef.kind === "set_field") {
    const anchorName = actionRef.anchor_ref ?? actionRef.anchor;
    const anchor = anchorName === undefined ? undefined : workspace.anchors.find((item) => item.ref === anchorName || item.name === anchorName);
    if (anchor?.active) {
      names.push(...anchor.linkedObservables);
    }
  }

  return names;
}

function classifyLinkedObservable(workspace: Workspace, actionRef: MutatingActionRef, name: string): Classification {
  const classification: Classification = {};
  const roi = workspace.rois.find((item) => item.active && (item.ref === name || item.name === name));
  if (roi) {
    classification.roi = roi.ref;
  }

  const [cliName, parameterName] = splitCliRef(name, defaultCliName(workspace, actionRef));
  const parameter = workspace.cli.parameters.get(`${cliName}:${parameterName}`);
  if (parameter?.enabled && parameter.actions.get) {
    classification.cli = parameter.ref;
  }

  return classification;
}

function cliParameter(workspace: Workspace, cliName: string | undefined, parameterName: string) {
  const [targetCliName, targetParameterName] = splitCliRef(parameterName, cliName ?? workspace.cli.defaultCliName);
  return workspace.cli.parameters.get(`${targetCliName}:${targetParameterName}`);
}

function cliAction(workspace: Workspace, cliName: string | undefined, actionName: string) {
  const [targetCliName, targetActionName] = splitCliRef(actionName, cliName ?? workspace.cli.defaultCliName);
  return workspace.cli.actions.get(`${targetCliName}:${targetActionName}`);
}

function defaultCliName(workspace: Workspace, actionRef: MutatingActionRef): string {
  return "cli_name" in actionRef && actionRef.cli_name !== undefined ? actionRef.cli_name : workspace.cli.defaultCliName;
}

function splitCliRef(name: string, defaultCliName: string): [string, string] {
  const separator = name.indexOf(":");
  if (separator === -1) {
    return [defaultCliName, name];
  }

  return [name.slice(0, separator), name.slice(separator + 1)];
}

function addUnique(target: string[], seen: Set<string>, value: string): void {
  if (!seen.has(value)) {
    seen.add(value);
    target.push(value);
  }
}
