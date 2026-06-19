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
  linkedRemove,
  linkedSearchChanged,
  formRedoDescription,
  formRedoField,
  formUndoDescription,
  formUndoField,
  type Action,
} from "../actions.js";
import type { AppState, CliSafetyField, FormFieldKey } from "../state.js";
import { cliSafetyFields } from "../selectors/form.js";

function isField(value: string | undefined): value is FormFieldKey {
  return value === "name" || value === "x" || value === "y" || value === "w" || value === "h" || value === "tags" || value === "description";
}

function isCliSafetyField(value: string | undefined): value is CliSafetyField {
  return cliSafetyFields.includes(value as CliSafetyField);
}

function isSafetyMode(value: string): value is "alwaysAllowed" | "guarded" | "blocked" {
  return value === "alwaysAllowed" || value === "guarded" || value === "blocked";
}

function closestWithin<T extends Element>(target: EventTarget | null, selector: string, root: HTMLElement): T | null {
  if (!(target instanceof Element)) return null;
  const found = target.closest<T>(selector);
  return found && root.contains(found) ? found : null;
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
      dispatch(formEditCliGetDesc(cliDesc.value));
      return;
    }
    if (cliDesc?.dataset.cliMeta === "setCmdDescription") {
      dispatch(formEditCliSetDesc(cliDesc.value));
      return;
    }
    const safety = closestWithin<HTMLInputElement>(event.target, "input[data-cli-safety-field]", rootEl);
    if (safety && isCliSafetyField(safety.dataset.cliSafetyField)) {
      dispatch(formEditCliSafetyField(safety.dataset.cliSafetyField, safety.value));
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

  const onClick = (event: MouseEvent): void => {
    const add = closestWithin<HTMLButtonElement>(event.target, 'button[data-action="linked-add"]', rootEl);
    if (add) {
      event.preventDefault();
      dispatch(linkedAdd());
      return;
    }
    const remove = closestWithin<HTMLButtonElement>(event.target, 'button[data-action="linked-remove"]', rootEl);
    if (remove) {
      event.preventDefault();
      dispatch(linkedRemove(remove.dataset.name ?? ""));
    }
  };

  rootEl.addEventListener("input", onInput);
  rootEl.addEventListener("blur", onBlur, true);
  rootEl.addEventListener("keydown", onKeyDown);
  rootEl.addEventListener("change", onChange);
  rootEl.addEventListener("click", onClick);
  return () => {
    rootEl.removeEventListener("input", onInput);
    rootEl.removeEventListener("blur", onBlur, true);
    rootEl.removeEventListener("keydown", onKeyDown);
    rootEl.removeEventListener("change", onChange);
    rootEl.removeEventListener("click", onClick);
  };
}
