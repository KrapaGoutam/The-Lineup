// Next.js provides the real "server-only" module via its own bundler alias
// (it isn't an npm package Vite can resolve), so any test that imports a
// data-layer module marked `import "server-only"` -- directly, not through
// a mocked boundary -- needs a stand-in. Feature 016's rotatePasscodeCredential
// is the first such module exercised directly rather than mocked away, hence
// this file. Importing it has no effect; it exists purely so Vite has
// something to resolve "server-only" to (aliased in vitest.config.ts).
export {};
