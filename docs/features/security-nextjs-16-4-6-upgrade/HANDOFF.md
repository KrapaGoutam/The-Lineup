# Security Upgrade: Next.js & eslint-config-next 16.4.6 — HANDOFF

Single tracking and handoff document for the Next.js security upgrade.

## 1. Identification

- Version / Task: Security upgrade of `next` and `eslint-config-next` from 16.4.3 to 16.4.6.
- Repository: `KrapaGoutam/The-Lineup`.
- Worktree: `.tmp/security-nextjs-upgrade` (dedicated isolated worktree).
- Branch: `security/nextjs-16-4-6-upgrade`.
- Commit SHA: `851d95c8c5c7d83cb8633e9d89201995cbfffc3b`.
- PR: #350 (`https://github.com/KrapaGoutam/The-Lineup/pull/350`).
- Base SHA: `2e742f56930aa24419ad24f9f783637e6da4859a` (`origin/development`).
- PR #349 status: Preserved untouched on branch `fix/v2-0-4-floor-data-parity-aisle` in worktree `.tmp/v2-0-4-floor-parity-fix`.

## 2. Security Vulnerabilities & Rationale

- **Advisory Trigger:** Next.js development server and CLI tooling issued a security notification recommending an immediate upgrade from 16.4.3 to 16.4.6.
- **Scope of Security Fixes:**
  - Upstream Next.js patches addressing potential server runtime vulnerabilities, compiler/bundler flaws, and development server execution stalls.
  - Elimination of the automated security upgrade halt that interrupted local test runners and CI processes.
- **Affected Packages:**
  - `next`: `16.4.3` -> `16.4.6`
  - `eslint-config-next`: `16.4.3` -> `16.4.6`
  - `@next/eslint-plugin-next`: `16.4.3` -> `16.4.6`
  - `@next/env`: `16.4.3` -> `16.4.6`
  - `@next/swc-*` (native platform binaries for Darwin, Linux, Windows): `16.4.3` -> `16.4.6`
- **Invariance:** Zero unrelated runtime or development dependencies were changed. `package-lock.json` contains only the minimal 48-line replacement corresponding to the Next.js package tree.

## 3. Focused Validation Receipts

- **Static Analysis & Types (`npm run check`):**
  - Prettier formatting: PASS (all files use Prettier style).
  - ESLint: PASS (`--max-warnings=0`).
  - Next Typegen & TypeScript: PASS (`tsc --noEmit`).
- **Unit & Domain Tests (`npm test`):**
  - Vitest test runner: 320 passed test files (4,322 passed, 7 skipped).
- **Production Build (`npm run build`):**
  - Turbopack compilation: PASS (compiled successfully in 9.5s).
  - Static page generation: 16/16 routes generated successfully in 878ms.
- **Non-Production Environment Scan:**
  - `node scripts/check-nonprod-env.mjs --scan .next`: PASS.
  - `node scripts/check-tracked-local-paths.mjs`: PASS.
- **E2E Smoke Verification:**
  - `npx playwright test tests/e2e/default-landing.spec.ts --project=desktop`: 11/11 passed (50.2s) without security advisory interruptions or layout failures.

## 4. Operational Invariants & Non-Negotiable Rules

- Target branch is `development` via a separate dedicated PR.
- **NEVER** merge into `development` or `main` without explicit owner approval.
- **NEVER** deploy migrations or modify Production (`ftadewtkjlaotfdvtjcv`) or Hosted DEV (`opmujepkemwcdxxorhfd`).
- PR #349 (`fix/v2-0-4-floor-data-parity-aisle`) is preserved independently and completely unblocked.

## 5. Recovery

- To resume work on this upgrade:
  ```bash
  cd .tmp/security-nextjs-upgrade
  git status
  ```
- To verify CI status on the security PR:
  ```bash
  gh pr checks <PR_NUMBER>
  ```
