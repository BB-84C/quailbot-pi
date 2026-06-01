export type WorkspaceSchema = Record<string, unknown>;

export type CliActionPermissions = {
  get: boolean;
  set: boolean;
  ramp: boolean;
};

export type WorkspaceRoi = {
  ref: string;
  name?: string;
  active: boolean;
  linkedObservables: string[];
  schema: WorkspaceSchema;
};

export type WorkspaceAnchor = {
  ref: string;
  name?: string;
  active: boolean;
  linkedObservables: string[];
  linkedRois: string[];
  schema: WorkspaceSchema;
};

export type CliParameter = {
  ref: string;
  cliName: string;
  name: string;
  label?: string;
  description?: string;
  enabled: boolean;
  actions: CliActionPermissions;
  linkedObservables: string[];
  schema: WorkspaceSchema;
};

export type CliAction = {
  ref: string;
  cliName: string;
  name: string;
  description?: string;
  enabled: boolean;
  actions: CliActionPermissions;
  linkedObservables: string[];
  actionCmd: unknown;
  schema: WorkspaceSchema;
};

export type Workspace = {
  sourcePath: string;
  rois: WorkspaceRoi[];
  anchors: WorkspaceAnchor[];
  cli: {
    enabled: boolean;
    defaultCliName: string;
    parameters: Map<string, CliParameter>;
    actions: Map<string, CliAction>;
  };
};
