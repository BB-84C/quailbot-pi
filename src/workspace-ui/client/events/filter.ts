import { filterClear, filterKeywordChanged, filterToggleLogic, filterToggleTag, type Action } from "../actions.js";
import { attachScopedActivation, attachScopedEvent, closestWithin } from "./delegation.js";

export function attachFilterEvents(rootEl: HTMLElement, dispatch: (action: Action) => void): () => void {
  const onChange = (event: Event): void => {
    const checkbox = closestWithin<HTMLInputElement>(event.target, 'input[data-action="toggle-tag"][data-tag]', rootEl);
    const tag = checkbox?.dataset.tag;
    if (!tag) {
      return;
    }
    dispatch(filterToggleTag(tag, checkbox.checked));
  };

  const onInput = (event: Event): void => {
    const input = closestWithin<HTMLInputElement>(event.target, '[data-region="filter-keyword"]', rootEl);
    if (!input) {
      return;
    }
    dispatch(filterKeywordChanged(input.value));
  };

  const onClick = (event: MouseEvent): boolean => {
    const checkbox =
      closestWithin<HTMLInputElement>(event.target, 'input[data-action="toggle-tag"][data-tag]', rootEl) ??
      closestWithin<HTMLLabelElement>(event.target, "label.filter-tag", rootEl)?.querySelector<HTMLInputElement>('input[data-action="toggle-tag"][data-tag]');
    const tag = checkbox?.dataset.tag;
    if (checkbox && tag) {
      event.preventDefault();
      dispatch(filterToggleTag(tag, !checkbox.checked));
      return true;
    }

    const logic = closestWithin<HTMLButtonElement>(event.target, '[data-action="toggle-logic"]', rootEl);
    if (logic) {
      event.preventDefault();
      dispatch(filterToggleLogic());
      return true;
    }

    const clear = closestWithin<HTMLButtonElement>(event.target, '[data-action="filter-clear"]', rootEl);
    if (clear) {
      event.preventDefault();
      dispatch(filterClear());
      return true;
    }
    return false;
  };

  const offChange = attachScopedEvent<Event>(rootEl, "change", onChange);
  const offInput = attachScopedEvent<Event>(rootEl, "input", onInput);
  const offClick = attachScopedActivation(rootEl, onClick);

  return () => {
    offChange();
    offInput();
    offClick();
  };
}
