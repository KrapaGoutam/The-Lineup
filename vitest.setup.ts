import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement matchMedia at all. Any component that renders
// <ThemeToggle> (Feature 012) calls it via useTheme(), so every test needs
// a sane default rather than each test file mocking it individually.
// Defaults to "no light preference" (resolves to dark) — deterministic,
// and tests that care about a specific preference override it themselves.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
