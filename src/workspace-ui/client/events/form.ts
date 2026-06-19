import {
  formCommitField,
  formEditDescription,
  formEditField,
  formEditGroup,
  formRedoDescription,
  formRedoField,
  formUndoDescription,
  formUndoField,
  type Action,
} from "../actions.js";
import type { AppState, FormFieldKey } from "../state.js";

function isField(value: string | undefined): value is FormFieldKey {
  return value === "name" || value === "x" || value === "y" || value === "w" || value === "h" || value === "tags" || value === "description";
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
    const select = closestWithin<HTMLSelectElement>(event.target, 'select[data-field="group"]', rootEl);
    if (!select) return;
    dispatch(formEditGroup(select.value));
  };

  rootEl.addEventListener("input", onInput);
  rootEl.addEventListener("blur", onBlur, true);
  rootEl.addEventListener("keydown", onKeyDown);
  rootEl.addEventListener("change", onChange);
  return () => {
    rootEl.removeEventListener("input", onInput);
    rootEl.removeEventListener("blur", onBlur, true);
    rootEl.removeEventListener("keydown", onKeyDown);
    rootEl.removeEventListener("change", onChange);
  };
}
