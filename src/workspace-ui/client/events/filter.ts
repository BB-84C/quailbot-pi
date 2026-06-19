import { filterClear, filterKeywordChanged, filterToggleLogic, filterToggleTag, type Action } from "../actions.js";

function closestWithin<T extends Element>(target: EventTarget | null, selector: string, root: HTMLElement): T | null {
  if (!(target instanceof Element)) {
    return null;
  }
  const found = target.closest<T>(selector);
  return found && root.contains(found) ? found : null;
}

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

  rootEl.addEventListener("change", onChange);
  rootEl.addEventListener("input", onInput);
  rootEl.addEventListener("click", onClick);

  return () => {
    rootEl.removeEventListener("change", onChange);
    rootEl.removeEventListener("input", onInput);
    rootEl.removeEventListener("click", onClick);
  };
}
