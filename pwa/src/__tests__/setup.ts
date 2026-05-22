// Vitest global setup. Add @testing-library/jest-dom matchers + any
// jsdom polyfills here as tests get written.

import "@testing-library/jest-dom/vitest";

// localStorage polyfill — jsdom under vitest+bun sometimes exposes a
// stripped object that lacks setItem/getItem/clear. Replace with a
// minimal in-memory Storage that satisfies the spec interface so the
// zustand `persist` middleware works in unit tests.
if (typeof localStorage === "undefined" || typeof localStorage.setItem !== "function") {
  const store: Map<string, string> = new Map();
  const stub: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => (store.has(key) ? store.get(key)! : null),
    key: (i) => Array.from(store.keys())[i] ?? null,
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: stub,
    writable: true,
    configurable: true,
  });
}
