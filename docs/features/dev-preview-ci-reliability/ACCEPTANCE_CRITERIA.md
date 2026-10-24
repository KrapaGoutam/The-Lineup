# Acceptance criteria — DEV Preview & CI Reliability

## INFRA-A

- [x] A-1 Preview env: DEV `NEXT_PUBLIC_SUPABASE_URL`/`_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `APP_PIN_PEPPER`, slug, `NEXT_PUBLIC_DEMO_MODE=false`; no `NEON_DATABASE_URL`.
- [x] A-2 Development env: same DEV values, no `NEON_DATABASE_URL`.
- [x] A-3 Production-scoped entries identical before/after (names, targets, created-at).
- [~] A-4 A feature-branch Preview build contains the DEV ref and not the PROD ref.
- [ ] A-5 (BLOCKED: deployed Preview behind Vercel Authentication — owner step) On the Preview: login reaches DEV, Table Allocation loads real DEV state, Schedule and Team load, no demo roster flash, no request to the PROD host.
- [x] A-6 No secret value appears in output, docs, commits, or GitHub text.

## INFRA-B

- [x] B-1 `supabase start` (same reduced service list) succeeds in CI.
- [x] B-2 `db:reset` applies all migrations from scratch; `db:test` passes (25 files / 387 assertions or more).
- [x] B-3 Registry/network pull failures are retried at most 3 attempts with backoff and registry fallback, logged as warnings with a classification.
- [x] B-4 Any other failure (SQL, migration, pgTAP, unknown) fails at once, unretried.
- [x] B-5 No `continue-on-error`, no skipped steps, the `Database` check remains required.
- [x] B-6 `deploy-migrations` runs only for pushes to `main`.

## INFRA-C

- [x] C-1 A guard rejects the PROD ref (and any non-DEV Supabase URL) in Preview/Development/local/CI configuration, unit-tested.
- [x] C-2 The guard can scan a built `.next` output.
- [x] C-3 Existing `tests/real` guards are unchanged and still pass.

## INFRA-D

- [x] D-1 `CI_CD.md`, `DEPLOYMENT.md`, `STATUS.md`, `ROADMAP.md`, `tasks/current-task.md`, issue #133 and Project #4 reflect final state.
- [ ] D-2 PR to `development` merged with a merge commit; `main` untouched.
