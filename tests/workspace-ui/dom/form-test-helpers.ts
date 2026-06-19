import { createStore } from "../../../src/workspace-ui/client/store.js";
import { initialState, type AppState } from "../../../src/workspace-ui/client/state.js";
import { formSelectionChanged, type Action } from "../../../src/workspace-ui/client/actions.js";
import { attachFormEvents } from "../../../src/workspace-ui/client/events/form.js";
import { renderForm } from "../../../src/workspace-ui/client/render/form.js";
import { selectionSummary } from "../../../src/workspace-ui/client/selectors/form.js";

export function fixtureState(): AppState {
  return {
    ...initialState(),
    workspace: {
      cliName: "nqctl",
      cliEnabled: true,
      groups: [
        { name: "A", description: "group A", tags: "ga", active: true, group: "", collapsed: false },
        { name: "B", description: "group B", tags: "gb", active: true, group: "A", collapsed: false },
        { name: "C", description: "group C", tags: "gc", active: true, group: "B", collapsed: false },
      ],
      rois: [
        { name: "roi-1", x: 1, y: 2, w: 30, h: 40, description: "roi desc", tags: "r1", active: true, group: "" },
        { name: "roi-2", x: 5, y: 6, w: 7, h: 8, description: "roi two", tags: "r2", active: true, group: "A" },
      ],
      anchors: [{ name: "anchor-1", x: 9, y: 10, description: "anchor desc", tags: "a1", linked_rois: [], active: true, group: "A" }],
      cliParams: [
        { cli_name: "nqctl", name: "bias", label: "Bias", description: "cli desc", tags: "c1", enabled: true, group: "B", allow_get: true, allow_set: true, allow_ramp: false, readable: true, writable: true, has_ramp: false, safety: null, get_cmd: {}, set_cmd: {}, safety_mode: "guarded", action_cmd: null, linked_observables: [], raw_item: {} },
      ],
    },
  };
}

export function selectedState(kind: "roi" | "anchor" | "group" | "cli", name: string): AppState {
  const state = fixtureState();
  state.tree = { ...state.tree, selected: [{ kind, name }], activeAnchor: { kind, name } };
  return state;
}

export function mountForm(state: AppState) {
  const root = document.createElement("div");
  const store = createStore(state);
  const dispatch = (action: Action): void => {
    store.dispatch(action);
    renderForm(root, store.getState());
  };
  dispatch(formSelectionChanged(selectionSummary(store.getState())));
  const off = attachFormEvents(root, dispatch, store.getState);
  return { root, store, dispatch, off };
}

export function input(root: HTMLElement, field: string): HTMLInputElement {
  const el = root.querySelector<HTMLInputElement>(`input[data-field="${field}"]`);
  if (!el) throw new Error(`missing input ${field}`);
  return el;
}

export function textarea(root: HTMLElement): HTMLTextAreaElement {
  const el = root.querySelector<HTMLTextAreaElement>('textarea[data-field="description"]');
  if (!el) throw new Error("missing description textarea");
  return el;
}

export function select(root: HTMLElement): HTMLSelectElement {
  const el = root.querySelector<HTMLSelectElement>('select[data-field="group"]');
  if (!el) throw new Error("missing group select");
  return el;
}

export function typeInto(el: HTMLInputElement | HTMLTextAreaElement, value: string, cursor = value.length): void {
  el.value = value;
  el.setSelectionRange(cursor, cursor);
  el.dispatchEvent(new InputEvent("input", { bubbles: true }));
}

export function blur(el: HTMLElement): void {
  el.dispatchEvent(new Event("blur", { bubbles: true }));
}

export function ctrlKey(el: HTMLElement, key: "z" | "y"): void {
  el.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true }));
}
