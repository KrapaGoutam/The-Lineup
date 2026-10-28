# Security release review (2026-10-28)

Scope: the integrated surfaces added since `main` (Bar Inventory, Vendor Order Drafts, same-server repeat, Tasks V1.1). Method: reuse the recorded final-gate evidence, plus one **read-only** catalog pass on hosted DEV (whose schema equals the release candidate: 54 = 54 migrations). No new exploit testing was needed; no PROD data was read (only migration history).

## Catalog evidence (hosted DEV, read-only, 2026-10-28)

| Check                                              | Result                                                                                                                                                                                                                                                          |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Security-definer functions in `public` / `private` | 125; **0 without a pinned `search_path`**                                                                                                                                                                                                                       |
| `public` functions executable by `anon`            | **0**                                                                                                                                                                                                                                                           |
| `private` functions executable by `anon`           | 4, all **pre-existing payroll trigger / helper functions** (`forbid_confirmed_payment_*`, `forbid_payroll_period_snapshot_edit`, `owns_payroll_period`), not in this delta; `anon` has no `USAGE` on schema `private`, so none is reachable (non-blocking note) |
| Tables in `public` without RLS                     | **none**                                                                                                                                                                                                                                                        |
| Inventory tables (`inventory_*`)                   | 10 / 10 with RLS; **no INSERT / UPDATE / DELETE / TRUNCATE grant to `anon` or `authenticated`** (all writes are role-checked RPCs); no grant of any kind to `anon`                                                                                              |
| Policies referencing `user_metadata`               | **0**                                                                                                                                                                                                                                                           |
| Tasks reminder surface (T-6)                       | `private.tasks_opening_reminders_run` not executable by `anon` or `authenticated`; `public.task_opening_reminders_sweep` executable by `authenticated` only, signature (org, location)                                                                          |

## Surface review

| Surface                     | Evidence                                                                                                                                                                                                                   | Result                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| RLS changes                 | New tables are tenant + location scoped; pgTAP 0033–0040 (Bar Inventory / drafts) and 0026 / 0041 / 0042 (Tasks) in the 1297-assertion suite; hosted real-JWT suites for tenant, location, role and inactive-member denial | PASS                          |
| Security-definer functions  | Catalog pass above; each RPC checks `auth.uid()`, active membership and role/location inside; `revoke … from public, anon` on definition                                                                                   | PASS                          |
| Bar Inventory write paths   | Management-only RPCs; Staff cannot open the module or call mutations (hosted real DB + UI, BI-10 / BI-11); import actions validate before heavy work; append-only adjustments and change log (triggers + no `TRUNCATE`)    | PASS                          |
| Vendor Order Drafts         | One active draft per vendor + location, optimistic version (`PT409`), immutable Sent history, Mark Sent never mutates stock (hosted two-context proof, VOD-4)                                                              | PASS                          |
| Tasks reminder RPC          | Active member required; client cannot choose recipient, stage or time; advisory lock serialises overlapping sweeps (mutation-checked in T-4); idempotent via `unique (recipient, dedupe_key)`                              | PASS                          |
| Notification privacy        | Staff reminder rows hold a count only (no task or checklist id, no names); each person reads only their own rows; verified in pgTAP 0042, hosted suite and the real-mode browser spec (T-6)                                | PASS                          |
| Tenant / location isolation | Cross-org and cross-location rejected (`42501`) in pgTAP and hosted suites for every new RPC family                                                                                                                        | PASS                          |
| File import / export        | CSV/XLSX parsing bounded (5 MB, row and zip-expansion limits, hostile-workbook fix from BI-11); exports are plain files built client-side from RLS-scoped reads; formula-injection guarded in exports                      | PASS (see non-blocking items) |
| Realtime access             | `inventory_stock` / `inventory_adjustments` published; RLS applies to subscribers (pgTAP 0038, hosted Realtime test); DELETE events not RLS-filtered but only keys, only service-role teardown deletes                     | PASS (non-blocking note)      |
| Dependencies                | `next` 16.4.3 and `zod` 4.6.7 clear the advisories BI-11 reported (Server Actions DoS; zod memory exhaustion); three new exact-pinned MIT packages                                                                         | PASS                          |
| Secrets                     | None added; no `.env*` tracked except `.env.example`; no PROD or DEV project ref in application code                                                                                                                       | PASS                          |

## New unexplained security issue

**NONE.**

## Known, non-blocking follow-ups (carried, not new)

- **#106** `private.has_org_role` still ORs `organizations.created_by` (pre-existing in PROD, unchanged by this release; the board path is membership-only). Previous audit: release follow-up.
- Four pre-existing payroll trigger / helper functions carry default `PUBLIC` execute in `private` (unreachable without schema `USAGE`). Hardening can ride a later payroll change.
- `serverActions.bodySizeLimit: 8mb` is app-wide (needed for the 5 MB import); mitigated by the `next` fix, authentication before work, and input limits.
- BI-11 owner decisions (AC-EXP-4 export audit log, light-theme contrast): not security defects; tracked as condition C1.
- Assistant Manager has no browser persona (unit/database proven).

## Verdict

**PASS** — no security or data-isolation blocker.
