import {
  formCommitField,
  formEditCliGetDesc,
  formEditCliRampEnabled,
  formEditCliSafetyField,
  formEditCliSafetyMode,
  formEditCliSetDesc,
  formEditCliWritable,
  formEditDescription,
  formEditField,
  formEditGroup,
  linkedAdd,
  linkedPickerChanged,
  linkedRemoveSelected,
  linkedSearchChanged,
  linkedSelect,
  formRedoDescription,
  formRedoField,
  formUndoDescription,
  formUndoField,
  type Action,
} from "../actions.js";
import type { AppState, CliSafetyField, FormFieldKey } from "../state.js";
import { cliSafetyFields } from "../selectors/form.js";
import { attachScopedActivation, attachScopedEvent, closestWithin } from "./delegation.js";

function isField(value: string | undefined): value is FormFieldKey {
  return value === "name" || value === "x" || value === "y" || value === "w" || value === "h" || value === "tags" || value === "description";
}

function isCliSafetyField(value: string | undefined): value is CliSafetyField {
  return cliSafetyFields.includes(value as CliSafetyField);
}

function isSafetyMode(value: string): value is "alwaysAllowed" | "guarded" | "blocked" {
  return value === "alwaysAllowed" || value === "guarded" || value === "blocked";
}

function restoreCursor(control: HTMLInputElement | HTMLTextAreaElement, state: AppState, field: FormFieldKey): void {
  const entry = state.form.history[field]?.entries[state.form.history[field]?.index ?? -1];
  const text = state.form.buffers[field] ?? entry?.text ?? "";
  control.value = text;
  const cursor = Math.max(0, Math.min(text.length, entry?.cursor ?? text.length));
  control.setSelectionRange(cursor, cursor);
}

export function attachFormEvents(rootEl: HTMLElement, dispatch: (action: Action) => void, getState: () => AppState): () => void {
  const onInput = (event: Event): void => {
    const linkedSearch = closestWithin<HTMLInputElement>(event.target, 'input[data-region="linked-search"]', rootEl);
    if (linkedSearch) {
      dispatch(linkedSearchChanged(linkedSearch.value));
      return;
    }
    const cliDesc = closestWithin<HTMLTextAreaElement>(event.target, 'textarea[data-cli-meta="getCmdDescription"], textarea[data-cli-meta="setCmdDescription"]', rootEl);
    if (cliDesc?.dataset.cliMeta === "getCmdDescription") {
      dispatch(formEditCliGetDesc(cliDesc.value, true));
      return;
    }
    if (cliDesc?.dataset.cliMeta === "setCmdDescription") {
      dispatch(formEditCliSetDesc(cliDesc.value, true));
      return;
    }
    const safety = closestWithin<HTMLInputElement>(event.target, "input[data-cli-safety-field]", rootEl);
    if (safety && isCliSafetyField(safety.dataset.cliSafetyField)) {
      dispatch(formEditCliSafetyField(safety.dataset.cliSafetyField, safety.value, true));
      return;
    }
    const control = closestWithin<HTMLInputElement | HTMLTextAreaElement>(event.target, "input[data-field], textarea[data-field]", rootEl);
    if (!control || !isField(control.dataset.field)) return;
    const cursor = control.selectionStart ?? control.value.length;
    if (control.dataset.field === "description") {
      dispatch(formEditDescription(control.value, cursor));
      return;
    }
    dispatch(formEditField(control.dataset.field, control.value, cursor));
  };

  const onBlur = (event: FocusEvent): void => {
    const cliDesc = closestWithin<HTMLTextAreaElement>(event.target, 'textarea[data-cli-meta="getCmdDescription"], textarea[data-cli-meta="setCmdDescription"]', rootEl);
    if (cliDesc?.dataset.cliMeta === "getCmdDescription") {
      dispatch(formEditCliGetDesc(cliDesc.value, true));
      return;
    }
    if (cliDesc?.dataset.cliMeta === "setCmdDescription") {
      dispatch(formEditCliSetDesc(cliDesc.value, true));
      return;
    }
    const safety = closestWithin<HTMLInputElement>(event.target, "input[data-cli-safety-field]", rootEl);
    if (safety && isCliSafetyField(safety.dataset.cliSafetyField)) {
      dispatch(formEditCliSafetyField(safety.dataset.cliSafetyField, safety.value, true));
      return;
    }
    const control = closestWithin<HTMLInputElement | HTMLTextAreaElement>(event.target, "input[data-field], textarea[data-field]", rootEl);
    if (!control || !isField(control.dataset.field)) return;
    dispatch(formCommitField(control.dataset.field));
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!(event.ctrlKey || event.metaKey) || (event.key.toLowerCase() !== "z" && event.key.toLowerCase() !== "y")) return;
    const control = closestWithin<HTMLInputElement | HTMLTextAreaElement>(event.target, "input[data-field], textarea[data-field]", rootEl);
    if (!control || !isField(control.dataset.field)) return;
    event.preventDefault();
    const field = control.dataset.field;
    if (field === "description") {
      dispatch(event.key.toLowerCase() === "z" ? formUndoDescription() : formRedoDescription());
    } else {
      dispatch(event.key.toLowerCase() === "z" ? formUndoField(field) : formRedoField(field));
    }
    restoreCursor(control, getState(), field);
  };

  const onChange = (event: Event): void => {
    const linkedPicker = closestWithin<HTMLSelectElement>(event.target, 'select[data-region="linked-picker"]', rootEl);
    if (linkedPicker) {
      dispatch(linkedPickerChanged(linkedPicker.value));
      return;
    }
    const cliCheckbox = closestWithin<HTMLInputElement>(event.target, 'input[data-cli-meta="writable"], input[data-cli-meta="rampEnabled"]', rootEl);
    if (cliCheckbox?.dataset.cliMeta === "writable") {
      dispatch(formEditCliWritable(cliCheckbox.checked));
      return;
    }
    if (cliCheckbox?.dataset.cliMeta === "rampEnabled") {
      dispatch(formEditCliRampEnabled(cliCheckbox.checked));
      return;
    }
    const safetyMode = closestWithin<HTMLSelectElement>(event.target, 'select[data-cli-meta="safetyMode"]', rootEl);
    if (safetyMode && isSafetyMode(safetyMode.value)) {
      dispatch(formEditCliSafetyMode(safetyMode.value));
      return;
    }
    const select = closestWithin<HTMLSelectElement>(event.target, 'select[data-field="group"]', rootEl);
    if (!select) return;
    dispatch(formEditGroup(select.value));
  };

  const onClick = (event: MouseEvent): boolean => {
    const cliCheckbox =
      event.target instanceof Element
        ? (event.target.closest<HTMLInputElement>('input[data-cli-meta="writable"], input[data-cli-meta="rampEnabled"]') ??
            event.target.closest<HTMLLabelElement>("label.form-row")?.querySelector<HTMLInputElement>('input[data-cli-meta="writable"], input[data-cli-meta="rampEnabled"]'))
        : null;
    if (cliCheckbox && rootEl.contains(cliCheckbox)) {
      event.preventDefault();
      if (cliCheckbox.dataset.cliMeta === "writable") {
        dispatch(formEditCliWritable(!cliCheckbox.checked));
        return true;
      }
      if (cliCheckbox.dataset.cliMeta === "rampEnabled") {
        dispatch(formEditCliRampEnabled(!cliCheckbox.checked));
        return true;
      }
    }

    const add = closestWithin<HTMLButtonElement>(event.target, 'button[data-action="linked-add"]', rootEl);
    if (add) {
      event.preventDefault();
      dispatch(linkedAdd());
      return true;
    }
    const linkedItem = closestWithin<HTMLElement>(event.target, '[data-action="linked-select"][data-name]', rootEl);
    if (linkedItem) {
      event.preventDefault();
      dispatch(linkedSelect(linkedItem.dataset.name ?? "", { ctrl: event.ctrlKey || event.metaKey }));
      return true;
    }
    const removeSelected = closestWithin<HTMLButtonElement>(event.target, 'button[data-action="linked-remove-selected"]', rootEl);
    if (removeSelected) {
      event.preventDefault();
      dispatch(linkedRemoveSelected());
      return true;
    }
    return false;
  };

  const offInput = attachScopedEvent<Event>(rootEl, "input", onInput);
  const offBlur = attachScopedEvent<FocusEvent>(rootEl, "blur", onBlur, true);
  const offKeyDown = attachScopedEvent<KeyboardEvent>(rootEl, "keydown", onKeyDown);
  const offChange = attachScopedEvent<Event>(rootEl, "change", onChange);
  const offClick = attachScopedActivation(rootEl, onClick);
  return () => {
    offInput();
    offBlur();
    offKeyDown();
    offChange();
    offClick();
  };
}
