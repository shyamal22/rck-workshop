/* A tiny observable value, so screens can follow session and sync state
   without a framework-specific store. */
import { useEffect, useState } from 'preact/hooks';

export interface Store<T> {
  get(): T;
  set(next: T): void;
  update(fn: (prev: T) => T): void;
  subscribe(fn: (value: T) => void): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<(v: T) => void>();
  return {
    get: () => value,
    set(next) {
      if (Object.is(next, value)) return;
      value = next;
      listeners.forEach(l => l(value));
    },
    update(fn) { this.set(fn(value)); },
    subscribe(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    }
  };
}

export function useStore<T>(store: Store<T>): T {
  const [value, setValue] = useState(store.get());
  useEffect(() => {
    const off = store.subscribe(setValue);
    // The store may have moved between the first render and this subscription.
    setValue(store.get());
    return off;
  }, [store]);
  return value;
}
