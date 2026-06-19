import type { CliParamDraft } from "../../../src/workspace-ui/shared/model.js";
import type { AppState } from "../../../src/workspace-ui/client/state.js";
import { selectedState } from "./form-test-helpers.js";

export const safetyFields = ["cooldown_s", "max_slew_per_s", "max_step", "max_value", "min_value", "ramp_interval_s"] as const;

export function cliDraft(overrides: Partial<CliParamDraft>): CliParamDraft {
  return {
    cli_name: "nqctl",
    name: "base",
    label: "Base",
    description: "base desc",
    tags: "",
    enabled: true,
    group: "",
    allow_get: true,
    allow_set: false,
    allow_ramp: false,
    readable: true,
    writable: false,
    has_ramp: false,
    safety: null,
    get_cmd: { description: "read base" },
    set_cmd: null,
    safety_mode: "guarded",
    action_cmd: null,
    linked_observables: [],
    raw_item: {},
    ...overrides,
  };
}

export function stateWithCli(cli: CliParamDraft): AppState {
  const state = selectedState("cli", cli.name);
  state.workspace.cliParams = [cli];
  state.tree = { ...state.tree, selected: [{ kind: "cli", name: cli.name }], activeAnchor: { kind: "cli", name: cli.name } };
  return state;
}

export function readableOnly(): CliParamDraft {
  return cliDraft({ name: "read-only", label: "Read Only", writable: false, set_cmd: null, get_cmd: { description: "read only" } });
}

export function writableParam(): CliParamDraft {
  return cliDraft({
    name: "writable",
    label: "Writable",
    writable: true,
    allow_set: true,
    set_cmd: { description: "write value", value_arg: "value" },
    get_cmd: { description: "read value" },
  });
}

export function rampParam(): CliParamDraft {
  return cliDraft({
    name: "ramp",
    label: "Ramp",
    writable: true,
    allow_set: true,
    allow_ramp: true,
    has_ramp: true,
    set_cmd: { description: "write ramp", value_arg: "value" },
    get_cmd: { description: "read ramp" },
    safety: {
      cooldown_s: 1,
      max_slew_per_s: 2,
      max_step: 3,
      max_value: 10,
      min_value: -10,
      ramp_interval_s: 0.5,
      ramp_enabled: true,
    },
  });
}

export function actionParam(mode: "alwaysAllowed" | "blocked" | "guarded"): CliParamDraft {
  return cliDraft({
    name: `action-${mode}`,
    label: `Action ${mode}`,
    readable: false,
    writable: false,
    allow_get: false,
    allow_set: false,
    allow_ramp: false,
    get_cmd: null,
    set_cmd: null,
    safety: null,
    safety_mode: mode,
    action_cmd: { description: "do action" },
  });
}

export function control(root: HTMLElement, selector: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(selector);
}

export function checkbox(root: HTMLElement, field: string): HTMLInputElement {
  const el = root.querySelector<HTMLInputElement>(`input[data-cli-meta="${field}"]`);
  if (!el) throw new Error(`missing cli checkbox ${field}`);
  return el;
}

export function cliTextarea(root: HTMLElement, field: string): HTMLTextAreaElement {
  const el = root.querySelector<HTMLTextAreaElement>(`textarea[data-cli-meta="${field}"]`);
  if (!el) throw new Error(`missing cli textarea ${field}`);
  return el;
}

export function safetyInput(root: HTMLElement, field: string): HTMLInputElement {
  const el = root.querySelector<HTMLInputElement>(`input[data-cli-safety-field="${field}"]`);
  if (!el) throw new Error(`missing cli safety input ${field}`);
  return el;
}
