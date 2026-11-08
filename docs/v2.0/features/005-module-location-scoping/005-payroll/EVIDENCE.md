# Feature V2-005.005: Payroll Location Scoping — Evidence

## Execution State: VERIFIED & COMPLETE

### 1. Baseline Verification

- Verified HEAD on `development`: `896c8016c6edaa110943d55aa8848ea146abae14`
- Existing migration count: 79 migrations -> 80 migrations with `20261108021714_payroll_location_scoping.sql`
- Local Supabase database running on `127.0.0.1:54322`
- Existing pgTAP payroll test suites (`0010_payroll_schema_rls`, `0011_payroll_adjustments`, `0018_payroll_payment_unconfirm`): 86/86 assertions passing

---

### 2. Implementation Receipts

#### Database Migration (`20261108021714_payroll_location_scoping.sql`)

- Added nullable column `location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL` to `payroll_periods`.
- Added composite foreign key `CONSTRAINT payroll_periods_location_org_fk FOREIGN KEY (location_id, organization_id) REFERENCES public.locations(id, organization_id) ON DELETE RESTRICT`.
- Preserved strict natural key `UNIQUE(organization_id, neon_user_id, period_month)`.
- Re-pointed foreign keys on `payroll_settings`, `payroll_rates`, `payroll_periods`, `payroll_payments`, `payroll_adjustments` from `memberships(organization_id, profile_id)` to `profiles(id)` so Overall administrators without tenant memberships can act.
- Implemented actor verification triggers `payroll_settings_actor_guard`, `payroll_rates_actor_guard`, `payroll_periods_actor_guard`, `payroll_payments_actor_guard`, `payroll_adjustments_actor_guard`.
- Created SQL helper functions in `private` schema:
  - `private.payroll_profile_level(profile_id, org_id)`
  - `private.payroll_is_org_manager(profile_id, org_id)`
  - `private.payroll_can_manage_location(profile_id, org_id, loc_id)`
  - `private.payroll_can_manage_period(profile_id, period_row)`
  - `private.payroll_can_read_period(profile_id, period_row)`
- Implemented public RPC `public.payroll_location_authorized(p_organization_id, p_location_id) RETURNS boolean`.
- Hardened `public.unconfirm_payroll_payment(p_payment_id)` with manager authority and period location verification.
- Replaced RLS policies on `payroll_settings`, `payroll_rates`, `payroll_periods`, `payroll_payments`, `payroll_adjustments`.
- Added RESTRICTIVE module enforcement policy on `payroll_periods`.

#### Domain Actor & Provenance Engine

- `src/features/payroll/data/payroll-actor.ts`: `getPayrollActor(restaurantSlug: string)` resolves authenticated user, active organization context, active location context, and checks `payroll_location_authorized`.
- `src/features/payroll/data/payroll-provenance.ts`: `resolveEmployeeLocationProvenance(...)` maps attendance users to active `location_memberships`. Fails closed (`singleLocation: false`) for employees assigned to multiple active locations or unassigned employees, preventing branch managers from generating split-location periods.
- `src/features/payroll/actions/payroll-actions.ts`:
  - Enforced `getPayrollActor` and `checkWorkspace(expectedContext, actor)`.
  - Rate overrides and default rate restricted to Org Managers / Overall roles (`actor.isOrgManager`). Non-org managers fail with `NOT_ORG_MANAGER_ERROR`.
  - Generation verifies employee provenance: branch managers can only generate employees with exclusive assignment to their active branch.
  - Payment, unlock, and adjustment mutations check period location match for branch managers.
- `src/features/payroll/actions/statement-actions.ts`:
  - Location guard and workspace expectation checking integrated.
  - Roster statements restricted to active location for branch managers.

#### UI Integration

- `src/components/restaurant-operations-app.tsx`: threads `workspaceExpectation` to `PayrollWorkspace`.
- `src/features/payroll/components/payroll-workspace.tsx`:
  - Renders active location scope badge in header.
  - Passes `expectedContext` to batch generation dialog, combined statement dialog, and rate forms.
  - Disables rate default and override inputs when caller is not an organization manager.
  - Displays multi-location warning in generation modal for branch managers.

---

### 3. Verification Receipts

#### pgTAP Database Test Suite (`0021_payroll_location_scoping.test.sql`)

```
Connecting to local database...
All tests successful.
Files=1, Tests=65, Result: PASS
```

#### Complete Payroll pgTAP Test Suites (`0010`, `0011`, `0018`, `0021`)

```
/supabase/tests/database/0010_payroll_schema_rls.test.sql ......... ok
/supabase/tests/database/0011_payroll_adjustments.test.sql ........ ok
/supabase/tests/database/0018_payroll_payment_unconfirm.test.sql .. ok
/supabase/tests/database/0021_payroll_location_scoping.test.sql ... ok
All tests successful.
Files=4, Tests=151, Result: PASS
```

#### Migration Replay & Local Database Reset Rehearsal (`npx supabase db reset`)

- Replayed 80 migrations cleanly from initial schema to `20261108021714_payroll_location_scoping.sql`.
- Seed data applied cleanly.
- Re-ran all 151 pgTAP assertions against fresh database: 151/151 PASS.

#### Payroll Unit & Component Tests (`npx vitest run src/features/payroll/`)

- 9 test files, 121 tests: **121 passed (121)**.
  - `src/features/payroll/actions/payroll-actions.test.ts` (38 tests) PASS
  - `src/features/payroll/actions/statement-actions.test.ts` (7 tests) PASS
  - `src/features/payroll/data/payroll-actor.test.ts` (5 tests) PASS
  - `src/features/payroll/data/payroll-provenance.test.ts` (4 tests) PASS
  - `src/features/payroll/components/payroll-workspace.test.tsx` (8 tests) PASS
  - `src/features/payroll/components/combined-statement-dialog.test.tsx` (6 tests) PASS
  - `src/features/payroll/domain/payroll-balance-metrics.test.ts` (32 tests) PASS
  - `src/features/payroll/domain/payroll-statement.test.ts` (14 tests) PASS
  - `src/features/payroll/domain/payroll-engine.test.ts` (7 tests) PASS

#### Full Repository Vitest Suite (`npm run test`)

```
Test Files  247 passed (247)
     Tests  3336 passed | 7 skipped (3343)
```

#### Code Quality & Type Check (`npm run check`)

```
> prettier --check .
All matched files use Prettier code style!
> eslint . --max-warnings=0
> next typegen && tsc --noEmit
Generating route types...
✓ Types generated successfully
```

#### Production Build Verification (`npx next build --webpack`)

```
✓ Compiled successfully in 25.0s
  Running TypeScript ...
  Finished TypeScript in 22.8s ...
✓ Generating static pages using 15 workers (13/13) in 1277ms
  Finalizing page optimization ...
```

---

## 4. Independent Financial & Security Review (Stage 2) — Claude Code

Reviewed the full PR diff (`origin/development...feature`) at `115dc852` independently of the
implementation session. The migration had not been applied to any hosted database (DEV ledger 79),
so it was corrected in place; no second migration was created.

### Confirmed findings and corrections

| #   | Sev    | Finding (reproduced against the `115dc852` migration)                                                                                                                                                                                                                                                        | Correction                                                                                                                                              | Regression                                  |
| --- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 1   | **P0** | `payroll_periods_insert_manager` let any Location Manager / Assistant Manager insert a period for their own branch straight through PostgREST with arbitrary `neon_user_id`, hours, rate and gross (reproduced: gross `999999999` accepted). Server actions refused branch generation; the database did not. | INSERT policy now requires organization-wide authority (`payroll_is_org_manager`). Branch authority remains for lock, payments, adjustments, unconfirm. | real-JWT x2, pgTAP 35/63/64                 |
| 2   | P1     | A Location Manager could `UPDATE` hours/rate/gross of an unpaid, unlocked period, and move/detach `location_id` (no payment or lock yet).                                                                                                                                                                    | `payroll_periods_actor_guard`: only org-wide authority may change a snapshot or `location_id`.                                                          | real-JWT x2, pgTAP R2/R3                    |
| 3   | P1     | A _locked_ period with no payments had a mutable snapshot (the old trigger only froze snapshots once a payment existed).                                                                                                                                                                                     | Guard rejects snapshot changes while `status = 'locked'` for everyone.                                                                                  | real-JWT, pgTAP R5                          |
| 4   | P1     | Actor forgery on INSERT: `payroll_payments.confirmed_by`, `payroll_periods.locked_by` / `regenerated_by` could be set to another profile (FKs now point at `profiles`).                                                                                                                                      | INSERT branch of the actor guards requires these to be NULL or the signed-in user.                                                                      | real-JWT, pgTAP R6/R7                       |
| 5   | P1     | Payroll helpers had no live-session check (Tips/Tasks/Schedule all do): a banned or signed-out manager's unexpired JWT kept full payroll write authority.                                                                                                                                                    | New `private.payroll_live_session()` (Schedule contract) gates `payroll_is_org_manager` and the branch path of `payroll_can_manage_location`.           | real-JWT (ban test failed on old migration) |
| 6   | P1     | Legacy permissive policy `payroll_payments_delete_privileged_draft` survived (the migration dropped a mis-named policy). Any org-level `shift_manager` could delete draft payments for any period, bypassing the new model and live-session gate.                                                            | Dropped by its real name.                                                                                                                               | pgTAP R12                                   |
| 7   | P1     | Module enforcement covered `payroll_periods` only. Once enforcement is ACTIVE and Payroll disabled for a location, payments/adjustments (and the unconfirm RPC) stayed writable.                                                                                                                             | `private.payroll_period_module_allows()` + RESTRICTIVE policies on `payroll_payments` and `payroll_adjustments`; `unconfirm_payroll_payment` checks it. | pgTAP R8-R10                                |
| 8   | P1     | Branch authority ignored location lifecycle: a manager of an inactive/archived location kept payroll authority (Tips/Schedule return level 0).                                                                                                                                                               | `payroll_can_manage_location` branch path requires an active, non-archived location of the same organization.                                           | pgTAP R11                                   |
| 9   | P2     | Server `regeneratePayrollPeriodAction` allowed a branch manager for their own location although it recomputes from Neon hours with no location provenance.                                                                                                                                                   | Action now requires org-wide authority (matches generate); unit test updated.                                                                           | unit                                        |

### Investigated and accepted / rejected

- **Org-wide direct creation (accepted, trusted):** Owner / General Manager / Overall Owner / Overall Manager can still insert a period directly. Hours originate in an external Neon DB the database cannot verify; these roles already control rates and can post signed adjustments. `generated_by` is trigger-pinned to the caller. Residual: a direct org-authority insert writes no `audit_events` row (the app path does).
- **Composite FKs / cascade (safe):** child rows carry `(payroll_period_id, organization_id)` FKs; `authenticated` has no DELETE grant on `payroll_periods` or `payroll_adjustments`; `ON DELETE CASCADE` is reachable only through an organization delete (service role). Location FK is `ON DELETE RESTRICT`.
- **audit_events (safe):** Batch A policy preserved verbatim plus payroll entity types; actor pinned to `auth.uid()`; payroll types are visible only to org-wide authority or the branch manager of that `location_id`.
- **Rates visible to branch managers (accepted):** `payroll_rates_select_manager` lets any branch manager read org rates; legacy policy allowed org `shift_manager` the same read, so no regression.
- **Pre-existing, not introduced, left as-is (P2 follow-ups):** staff `*_select_self` for payments/adjustments (`owns_payroll_period`) does not require `status = 'locked'`; the generate rollback `delete` has no grant (silent no-op if the audit write fails); org-role `host`/`shift_manager` can insert arbitrary-type `audit_events`; the Regenerate button is not hidden from branch managers (server returns an accurate refusal).

### Verification after corrections (local stack, ledger 80)

- Real-JWT PostgREST suite: **44/44** (37 original − 1 inverted + 8 new). Six of the new tests were run against the original migration and failed there, then pass on the corrected one.
- pgTAP `0021`: **78/78**; `0010`, `0011`, `0018`: pass; shared regression `0060`, `0066`, `0067`, `0068`: pass.
- Populated-data migration rehearsal: **3/3**.
- Payroll + modules unit tests: pass (regenerate refusal test updated).

## 5. Controlled DEV Rollout (Stage 3)

- **Reviewed head:** `faa7bfe8e813305141fc12d14d469539f5ad2b6c`; exact-head CI green (application, browser-smoke, migrations-and-policies, Vercel; deploy job skipped on the PR as designed).
- **Migration:** `20261108021714_payroll_location_scoping.sql`, sha256 `ed2101947429d793c2bca335259d7cec57419517b4243e42cc5ff2fdae3dd395` (the reviewed PR file, applied byte-for-byte).
- **Preflight (read-only):** project `the-lineup-dev`, ledger 79 (digest `598f888f824399351e07575c75ca46db`, max `20261107224300`), enforcement STAGED, 0 module configs, all Payroll tables empty. The deploy bundle's first 79 files were byte-identical to `origin/development`; the dry run listed exactly one migration.
- **Backup:** fresh encrypted (Windows DPAPI) ledger-79 backup in `%LOCALAPPDATA%\TheLineup-DEV-Backups`; six components hash-verified; counts reconcile with live DEV. Older backups preserved.
- **Isolated restore:** restored into a no-network, no-port, tmpfs-backed PostgreSQL 17 container: 107 table-count checks, 0 mismatches, FK anti-joins pass.
- **Populated rehearsal:** DEV's Payroll tables are empty, so a representative financial dataset (unpaid, partially paid, fully paid, adjusted, locked, confirmed/unconfirmed history, multi-month) was seeded into the disposable restore only, on DEV's real pre-migration schema, then the exact migration applied. Payments, adjustments, rates, settings, identity links and audit rows: digests identical before/after; `payroll_periods` old-shape digest identical (cents, hours, ids unchanged; every row `location_id IS NULL`); only change besides the new column is the ledger (79 -> 80). Catalog delta limited to Payroll objects and the two `audit_events` policies; all legacy `*_privileged` policies replaced; no grant, RLS flag, trigger or index lost.
- **Hosted result:** ledger 79 -> 80; functions, triggers, indexes, grants and RLS flags identical to the migrated rehearsal; policy names/commands identical (text differs only by `uid()`/`auth.uid()` deparse).
- **Hosted authorization probe:** 73/73 in one transaction ending in a forced rollback (nothing persisted; post-state counts identical). Uses SQL role simulation with synthetic JWT claims, not live GoTrue tokens; real GoTrue JWT coverage is the local 44/44 suite.
- **Not exercised on hosted DEV:** ACTIVE module enforcement (policy exercised in pgTAP only) and authenticated browser UI (DEV has 0 module configs, so module UIs stay hidden; DEFERRED, no seeding).
- **Preview:** Vercel Preview for `faa7bfe` READY; client bundle contains the DEV project ref and no Production ref.
