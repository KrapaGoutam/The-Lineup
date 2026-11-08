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
