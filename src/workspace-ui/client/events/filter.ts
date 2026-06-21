import { filterClear, filterKeywordChanged, filterToggleLogic, filterToggleTag, type Action } from "../actions.js";
import { attachScopedActivation, attachScopedEvent, closestWithin } from "./delegation.js";

export function attachFilterEvents(rootEl: HTMLElement, dispatch: (action: Action) => void): () => void {
  const onChange = (event: Event): void => {
    const checkbox = closestWithin<HTMLInputElement>(event.target, 'input[data-action="toggle-tag"][data-tag]', rootEl);
    const tag = checkbox?.dataset.tag;
    if (!tag) {
      return;
    }
    dispatch(filterToggleTag(tag));
  };

  const onInput = (event: Event): void => {
    const input = closestWithin<HTMLInputElement>(event.target, '[data-region="filter-keyword"]', rootEl);
    if (!input) {
      return;
    }
    dispatch(filterKeywordChanged(input.value));
  };

  const onClick = (event: MouseEvent): void => {
    const logic = closestWithin<HTMLButtonElement>(event.target, '[data-action="toggle-logic"]', rootEl);
    if (logic) {
      dispatch(filterToggleLogic());
      return;
    }

    const clear = closestWithin<HTMLButtonElement>(event.target, '[data-action="filter-clear"]', rootEl);
    if (clear) {
      dispatch(filterClear());
    }
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
