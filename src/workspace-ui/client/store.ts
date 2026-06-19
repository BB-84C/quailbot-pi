import type { Action } from "./actions.js";
import { initialState, reduceAppState, type AppState } from "./state.js";

export type Store = {
  getState: () => AppState;
  subscribe: (listener: () => void) => () => void;
  dispatch: (action: Action) => void;
};

export function createStore(initial: AppState = initialState(), reducer = reduceAppState): Store {
  let state = initial;
  const listeners = new Set<() => void>();

  const store: Store = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispatch(action) {
      state = reducer(state, action);
      for (const listener of [...listeners]) {
        listener();
      }
    },
  };

  return store;
}
