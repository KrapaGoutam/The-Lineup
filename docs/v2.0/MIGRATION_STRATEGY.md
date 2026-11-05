# The Lineup V2.0 — Migration & Compatibility Strategy

> **CRITICAL RULE:** This application already contains production and hosted development data. V2.0 is NOT a greenfield project. Applied migrations are NEVER edited. No migrations are created or applied during Phase 0 Planning.

---

## 1. Existing Data Inventory & Baseline State

### 1.1. Monks Pilot Baseline

- **Organization**: Monks (slug `monks`).
- **Primary Location**: Webster (UUID mapped in `locations` with `time_zone = 'America/Chicago'`).
- **Identity & Roles**: Staff have `profiles`, `memberships` with `roles public.app_role[]`, and `passcode_credentials`.
- **Operational Tables**:
  - `locations` already exists with hours and timezone.
  - `schedule_periods`, `shifts`, `shift_templates` already have `location_id`.
  - `dining_areas`, `dining_tables`, `service_sessions` already have `location_id`.
  - `tip_pools` already has `location_id`.
  - `tasks` tables already have `location_id`.
  - `bar_inventory_*` stock tables already have `location_id`.
  - `attendance_identity_links` maps Supabase members to Neon `users.id`.
- **The Core Single-Location Bottleneck**:
  - Frontend and Server Actions call `getPrimaryLocation(organizationId)` (`src/features/locations/data/primary-location.ts`), picking `limit 1 order by created_at asc`.
  - Memberships only bind a user to an organization, not explicit locations.
  - `private.has_org_role` grants organization-wide access and has the #106 creator bypass.

---

## 2. Backward Compatibility & Backfill Plan (Feature V2-008)

When V2-008 executes, the migration script will perform the following safe, idempotent backfills:

### 2.1. Location Assignment Backfill

For every active row in `public.memberships`:

```sql
insert into public.location_assignments (
  organization_id,
  location_id,
  profile_id,
  role,
  active
)
select
  m.organization_id,
  l.id as location_id,
  m.profile_id,
  m.roles[1] as role,
  m.active
from public.memberships m
join public.locations l on l.organization_id = m.organization_id
on conflict (location_id, profile_id) do nothing;
```

_Rationale:_ Every existing staff member at Monks automatically receives an assignment to the Webster location matching their existing operational role.

### 2.2. Attendance Mode Backfill

All existing locations default to `EXTERNAL`:

```sql
update public.locations
set attendance_mode = 'external'
where attendance_mode is null;
```

_Rationale:_ Monks' existing Neon attendance reporting and timesheets continue functioning without disruption.

### 2.3. Location Module Config Backfill (owned by V2-008.004)

V2-004.001 creates `location_module_configs` empty and **inserts nothing**: a location with no row is `missing` ("not configured"), which is **not usable** (fail-closed) once V2-004.004 enforcement is active. Legacy locations therefore need explicit rows _before_ that enforcement is activated anywhere with live data.

V2-008.004 reconciles them from an **owner-approved per-location module list** (never a guessed blanket default), using the canonical keys of `public.location_module_key` — the earlier draft's `allocation`, `schedules` and `inventory` are now `table_allocation`, `schedule` and `bar_inventory`; `team` is also a module; `settings` is system-required and is never inserted. Shape (illustrative — the module list per location comes from the owner):

```sql
insert into public.location_module_configs (location_id, module_key, is_enabled)
select l.id, m.key, true
from public.locations l
cross join (
  values
    ('table_allocation'::public.location_module_key),
    ('tasks'), ('schedule'), ('tips'), ('team'),
    ('attendance'), ('payroll'), ('bar_inventory'), ('recipes')
) as m(key)
where l.archived_at is null -- archived locations are frozen by the guard trigger
on conflict (location_id, module_key) do nothing; -- never overwrite an explicit decision
```

Run as a privileged maintenance session (the row guard lets it supply `created_at`). The `organization_id` column no longer exists: organization is derived from `locations`.

**Gate:** V2-004.004 must not be activated in an environment until every ACTIVE location there has explicit rows (see [001-module-configuration-contract/PLAN.md §6](features/004-location-module-configuration/001-module-configuration-contract/PLAN.md)).

---

## 3. Forward-Only Migration Lifecycle

```text
Feature Branch
  ↓
Write Forward Migration (SQL in supabase/migrations/)
  ↓
Validate Locally (Supabase CLI + pgTAP test suites)
  ↓
Create PR to development
  ↓
Exact-Head CI Passes
  ↓
Apply Migration to Hosted DEV Project (opmujepkemwcdxxorhfd)
  ↓
Verify Hosted DEV Parity & Test Suites
  ↓
Record Evidence in PR & Issue
  ↓
Merge Commit into development
```

### Invariants:

1. **Never edit an applied migration**: If a mistake is discovered, write an additive forward migration.
2. **Never apply migrations to Production during normal subfeature work**: Production migrations occur strictly at V2-009 with explicit owner sign-off.
3. **Hosted DEV is the rehearsal sandbox**: All migrations must be rehearsed on the hosted DEV database before declaring any subfeature complete.
4. **Forward-Fix over Rollback**: If unexpected migration behavior occurs on DEV, implement a forward-fixing migration rather than manual destructive resets.
