import "@testing-library/jest-dom";

// ResizeObserver n'existe pas dans jsdom — mock no-op
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
