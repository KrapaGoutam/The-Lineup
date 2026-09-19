import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "coverage/**",
    "out/**",
    "playwright-report/**",
    "test-results/**",
    "build/**",
    "next-env.d.ts",
    // Table Rotation Multi-View: a Claude Design export copied verbatim
    // from its source repo (docs/design/table-rotation/README.md) --
    // reference material we don't own the authoring of, not linted for
    // the same reason .prettierignore excludes this same directory.
    "docs/design/table-rotation/approved-design-export/**",
  ]),
]);

export default eslintConfig;
