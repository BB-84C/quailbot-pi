export function closestWithin<T extends Element>(target: EventTarget | null, selector: string, root: HTMLElement): T | null {
  if (!(target instanceof Element)) return null;
  const found = target.closest<T>(selector);
  return found && root.contains(found) ? found : null;
}

export function attachScopedEvent<T extends Event>(
  root: HTMLElement,
  type: string,
  handler: (event: T) => void,
  options?: boolean | AddEventListenerOptions,
): () => void {
  const handled = new WeakSet<Event>();
  const runOnce = (event: Event): void => {
    if (handled.has(event)) return;
    handled.add(event);
    handler(event as T);
  };
  const onRoot = (event: Event): void => runOnce(event);
  const onDocument = (event: Event): void => {
    if (event.target instanceof Element && root.contains(event.target)) {
      runOnce(event);
    }
  };
  const documentOptions: AddEventListenerOptions = { capture: true, ...(typeof options === "object" ? options : {}) };

  root.addEventListener(type, onRoot, options);
  document.addEventListener(type, onDocument, documentOptions);

  return () => {
    root.removeEventListener(type, onRoot, options);
    document.removeEventListener(type, onDocument, documentOptions);
  };
}

export function attachScopedActivation(root: HTMLElement, handler: (event: MouseEvent) => void): () => void {
  let suppressedTarget: EventTarget | null = null;
  let suppressClickUntil = 0;

  const onPointerUp = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    suppressedTarget = event.target;
    suppressClickUntil = Date.now() + 750;
    handler(event as unknown as MouseEvent);
  };
  const onClick = (event: MouseEvent): void => {
    if (event.target === suppressedTarget && Date.now() < suppressClickUntil) {
      event.preventDefault();
      return;
    }
    handler(event);
  };

  const offPointerUp = attachScopedEvent<PointerEvent>(root, "pointerup", onPointerUp);
  const offClick = attachScopedEvent<MouseEvent>(root, "click", onClick);
  return () => {
    offPointerUp();
    offClick();
  };
}
