# Implementation report — Canonical Table Input Resolution (#157)

Branch `fix/table-input-canonical-resolution` → `development` (merge commit). `main` and PROD untouched.

## What shipped

- **One resolver in the database** — `private.resolve_table_input(location, text)` returns `(input_text, canonical_label, dining_table_id, registered)`; plus `private.canonical_label_parts` / `private.canonical_table_label` for combined labels. Precedence: exact registered label → digits-only `T` + digits → trimmed free text. Leading zeros never collapse (`01` → `T01` or free text). Same location only.
- **Used everywhere a label is interpreted** (no second implementation): `board_assign` and `board_end_and_assign` (canonicalize first, then conflict / same-server / displacement / insert / event / occupancy), `displace_conflicting_entries`, and the `sync_table_occupancy` trigger (the ledger claim points at T1's `dining_table_id`).
- **Canonical comparison on both sides** — held entries are resolved too, so a legacy active free-text `1` and a new `T1` can never both hold the table. Conflict details (`label`, `assignment_label`) are canonical, so a stale client typing `1` receives the same PT409 as one typing `T1`.
- **Client mirror** (`domain/table-input.ts`) used by the workspace `execute` and the shared claim hook, for demo mode and instant, correct dialog/optimistic state. The database stays authoritative.
- **No** alias table, **no** history rewrite, **no** RLS/grant widening. Realtime unchanged (database truth → invalidate → refetch).

## Security review (trusted DB functions)

| Check                              | Result                                                                                                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search_path`                      | `''` on all three new helpers and all replaced functions; every reference schema-qualified                                                                                                              |
| Ownership / execution              | helpers private, `SECURITY DEFINER`; `REVOKE ALL … FROM public, anon, authenticated` — asserted in pgTAP 0031                                                                                           |
| Authentication / tenant / location | unchanged: `auth.uid()`, `begin_board_write` (active membership, org + session validation); resolution uses the SESSION's location, never a client-supplied one; an outsider still gets `42501` (pgTAP) |
| Cross-location / cross-org         | resolver filters `d.location_id = p_location_id`; another org's `T99` does not resolve (pgTAP)                                                                                                          |
| NULL / empty / ambiguous           | NULL → no label; empty → "Enter a table."; inactive tables are not registered; `5` beside `T5` → `5` (exact wins)                                                                                       |
| Grants on public RPCs              | `board_assign` still `authenticated` only; `board_end_and_assign` ACL preserved by `CREATE OR REPLACE`                                                                                                  |
| Known edge                         | the 80-char `table_label` check applies to the expanded canonical label (`1+2+…` expands slightly); the database rejects, nothing partial is written                                                    |

## Existing data

History is untouched. DEV probe before applying (read-only release-readiness query, see PLAN.md): 2 active synthetic numeric free-text labels (`1`, `2`, today's DEV board, leftovers of earlier test runs) that now resolve to T1/T2. They were not mutated by the migration; the hosted suites reset the DEV board. **PROD: no query or mutation was run** — the same query must be run per real location before the PROD release.

## Safety

|                    |                                                                                                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| development merged | NO until the PR merge (R7)                                                                                                                                             |
| main merged        | NO                                                                                                                                                                     |
| DEV touched        | YES — migration `20261026120000` applied (Management API, ref `opmujepkemwcdxxorhfd` hard-checked, recorded in `schema_migrations`); hosted suites with synthetic data |
| PROD touched       | NO                                                                                                                                                                     |
| PROD migrations    | NO                                                                                                                                                                     |

## Evidence (final gate, 2026-10-26)

| Gate                                                                           | Result                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pgTAP (local Supabase, full suite)                                             | 31 files / 646 assertions PASS (0031 new: 58; 0030 §3 changed deliberately)                                                                                                                                                                                                |
| Vitest                                                                         | 74 files / 715 tests PASS                                                                                                                                                                                                                                                  |
| Domain scenario matrix                                                         | 51 scenarios (45 − 3 old-contract + 9 input-form); `cross-view-matrix.test.ts` 52 tests PASS                                                                                                                                                                               |
| Demo Playwright (`npx playwright test`, desktop + host-tablet + server-mobile) | 507 PASS (was 489; +18 = 6 net new scenarios × 3 projects)                                                                                                                                                                                                                 |
| Production build (pinned to DEV values)                                        | PASS; PROD ref found in 0 build files                                                                                                                                                                                                                                      |
| Hosted DEV DB (`test:real`)                                                    | 78 PASS (4 files: tasks-v1 12, table-input-canonical 16 new, table-allocation-conflicts 10, table-rotation-v2 40) after fixing two stored-spacing assertions (`4+5` → `4 + 5`)                                                                                             |
| Hosted DEV UI on the production build                                          | 30 PASS (incl. rewritten XM-011 and the new stale-browser shorthand test). XM-024 failed once in the first of three full runs (transient / non-reproduced observation; no product defect found). It passed in the next two full runs, an isolated rerun and exact-head CI. |
| lint / typecheck / format                                                      | PASS                                                                                                                                                                                                                                                                       |
| CI                                                                             | PASS on exact head `caef5aa` (application, browser-smoke, Database, Vercel; deploy-migrations skipped). PR #158 merged, merge commit `f8fa191`; R0-R7 done                                                                                                                 |
