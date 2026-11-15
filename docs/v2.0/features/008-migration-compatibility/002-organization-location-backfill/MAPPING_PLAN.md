# V2-008.002 — Organization / Location Backfill: Mapping Plan

Status: **DISCOVERY COMPLETE — MAPPING PLAN ONLY.** Nothing here is approved for execution. No SQL was run that writes; the SQL below is illustrative design and must not be applied.

Evidence base: [INVENTORY.md](../001-existing-data-inventory/INVENTORY.md) (Hosted DEV `opmujepkemwcdxxorhfd`, ledger 88, 2026-11-12), repository `development` `790fd2db`. Production and Neon were **not** read.

## 1. Authoritative mappings

| #   | Legacy source                                                                                       | Target organization                      | Target location                                | Basis                                                                                                                                                                 | State                                                                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M-1 | **DEV:** org slug `the-monks` ("The Monk's DEV", `c5e8ad9c`)                                        | itself                                   | its only location, "DEV Location" (`a5d46f61`) | Observed. 5 active members, all already have an active `location_memberships` row (created 2026-11-05) matching V2-D019. Operational rows all point at this location. | **Already valid in DEV. No migration needed.**                                                                                                                        |
| M-2 | **Production:** the legacy Monks pilot ("Monks", strategy slug `monks`, location "Webster")         | the existing Production organization row | the existing Production Webster location row   | Docs only (`MIGRATION_STRATEGY.md`, `ACCESS_MODEL.md`). The strategy says slug `monks`; DEV's copy is `the-monks`; a Webster-named location does not exist in DEV.    | **UNVERIFIED.** Identity (id, slug, location id, active location count) must come from an owner-authorized read-only Production preflight. Never match by name alone. |
| M-3 | Org members with no location assignment in a **single-active-location** org                         | same org                                 | that org's single active location              | Safe only when exactly one active, non-archived location exists and the person has an active org membership; deterministic.                                           | **Design ready; requires per-org owner approval of the role mapping (ROLE_MAPPING_PLAN).**                                                                            |
| M-4 | Org members with no location assignment in a **multi-location** org                                 | same org                                 | **none inferred**                              | Assigning every location would grant access the person never had (ACCESS_MODEL §5.5, fail closed). The current model has no basis to pick a location.                 | **Owner decision per person; never guessed.** Not present in DEV data.                                                                                                |
| M-5 | Harness fixtures (28 orgs, 42 active locations) and V2-007 acceptance fixtures (3 orgs, 5 archived) | themselves                               | themselves                                     | Synthetic. No legacy operational meaning. Must **not** be rewritten, merged, reparented or backfilled.                                                                | **Exclude from every backfill.** Disposition (archive vs configure) is D-4.                                                                                           |
| M-6 | Manual Preview org (`640e508f`, "DEV Bar & Lounge")                                                 | itself                                   | its only location                              | 2 active members without location membership; holds 14 recipes / 28 products.                                                                                         | **Owner decision D-3** (real QA tenant vs disposable). Do not backfill until ruled.                                                                                   |

Hard rule restated: records are never reparented between organizations because a name resembles another ("Webster", "Monks"). Mapping is by verified IDs only.

## 2. Existing foreign-key relationships (DEV, verified)

- `locations.organization_id → organizations.id`; all 49 locations belong to exactly one org; no location is shared.
- Every table carrying both `organization_id` and `location_id` (41 tables) uses composite tenant keys; **0 rows** where the row's org differs from its location's org.
- Location-keyed tables have `location_id NOT NULL` everywhere except `audit_events` (1 legitimate org-level row), `inventory_change_log`, `payroll_periods`, `task_notifications` (nullable columns, **0 null rows in DEV**).
- Org-level by design (no `location_id`): `inventory_products/vendors/categories/subcategories`, `bar_recipe*`, `memberships`, `passcode_credentials`, `registrations`, `shift_assignments` (via shift), `attendance_identity_links`, `payroll_settings/rates/payments/adjustments`.
- `location_memberships` has `unique (location_id, profile_id)` → natural idempotency key.
- Two V2 migrations add `location_id` **with in-migration backfill that will execute on Production**: `20261107160548_tasks_location_scoping` (`task_notifications.location_id`, filled from task / checklist instance / opening-reminder payload) and `20261108021714_payroll_location_scoping` (`payroll_periods.location_id`, nullable, `on delete set null`; legacy org-wide periods intentionally stay NULL). Production rows that those updates cannot resolve stay NULL; their count is **UNVERIFIED** and is a rehearsal acceptance item (§6).

## 3. Outdated historical example and its modern equivalent

`MIGRATION_STRATEGY.md §2.1` is **superseded** (a pointer is added in that file; the original text is kept as history). Defects against the deployed schema:

| Historical text                                                                                   | Reality (deployed)                                                                                                                                                           | Modern equivalent                                                                                               |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Table `public.location_assignments (organization_id, location_id, profile_id, role, active)`      | Table is `public.location_memberships (location_id, profile_id, role, active, …)`; **no** `organization_id` column (org derived from `locations`).                           | Insert into `public.location_memberships`.                                                                      |
| `m.roles[1] as role`                                                                              | `memberships.roles` is `app_role[]`; `location_memberships.role` is `location_role` (`manager/assistant_manager/staff`). Types are unrelated; `[1]` is arbitrary for arrays. | Explicit per-role mapping (ROLE_MAPPING_PLAN §3); reject ambiguous arrays.                                      |
| `from memberships m join locations l on l.organization_id = m.organization_id`                    | Cross-joins **every** location of the org → in a multi-location org grants access to all (violates fail-closed).                                                             | Join to one **approved** location id, and only when the org has exactly one active location.                    |
| `m.active` copied for inactive members                                                            | Would create active rows for nothing, or inactive rows that still count against the legacy fallback (H-1).                                                                   | Insert only for **active** org members; never create rows for inactive members; never activate an inactive row. |
| `on conflict (location_id, profile_id) do nothing`                                                | Correct key. Keep it, but also assert pre-state (below) so a silent skip cannot hide a wrong existing row.                                                                   | Same key plus pre/post verification.                                                                            |
| `update locations set attendance_mode='external' where attendance_mode is null`                   | Conflicts with the shipped V2-006 contract (NULL = unconfigured, external-compatible for reads, fail-closed for native).                                                     | **Do not run.** See BATCH_B_C_DEPENDENCIES §V2-008.005.                                                         |
| `public.location_memberships` mention in `MODULE_SCOPE_MATRIX` "Introduce `location_assignments`" | Same renaming.                                                                                                                                                               | Read as `location_memberships`.                                                                                 |

Applied migrations are not edited. If the old SQL had been executed it would have failed on the missing table; no historical migration depends on it.

## 4. Records already valid vs needing future migration

| Area                                                                                            | DEV state                                            | Needs future migration?                                                                                                          |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Operational `location_id` (allocation, tasks, schedule, tips, bar inventory, attendance, kiosk) | Present, NOT NULL, tenant-consistent                 | **No in DEV.** Production: columns exist on `main` for most; verify counts of NULL on the 4 nullable tables after V2 migrations. |
| `location_memberships` for real org members                                                     | Monks complete; Manual Preview empty; fixtures empty | **Yes** for any real org without rows (Production Monks expected: all members). Not for fixtures.                                |
| `location_module_configs`                                                                       | Monks 9 rows (8 disabled); 43 active locations none  | Yes, owner-approved (V2-008.004) — separate from this mapping.                                                                   |
| `attendance_mode`                                                                               | 44 active `NULL`                                     | Only where owner explicitly decides (V2-008.005).                                                                                |
| `organizations.created_by` creator bypass                                                       | Removed in V2-001.007 (V2-D020)                      | No.                                                                                                                              |
| Timezone / business date                                                                        | All `America/Chicago`, no conflict                   | No in DEV; Production: confirm Webster `time_zone` is `America/Chicago` and `opening/closing_local` valid.                       |

## 5. Proposed idempotent backfill behavior (design, not for execution)

Scope: **one organization at a time**, only orgs the owner has approved, only when the org has **exactly one active, non-archived location** (M-3). Multi-location orgs are excluded (M-4).

Order and guards, all in **one transaction** per org (all-or-nothing; the H-1 cliff makes partial application dangerous):

1. Preflight (read-only, abort on any failure):
   - org and location ids match the approved manifest (ids, not names); location active, not archived, valid IANA tz.
   - `count(active non-archived locations in org) = 1`.
   - **zero** existing `location_memberships` rows for that org, **or** every existing row already equals the manifest (idempotent re-run). Any other existing row → abort and report (do not overwrite, do not extend).
   - every active org member has a role array of exactly one element and a manifest-approved target role; zero multi-role/empty arrays.
2. Write: insert one row per **active** org member with the manifest role, `active = true`, `on conflict (location_id, profile_id) do nothing`. Run as a privileged maintenance session; supply nothing that bypasses the immutability guards.
3. Postflight (same transaction, abort + roll back on failure): every active org member has exactly one active row; no row for an inactive member; no row for any location outside the manifest; role per member equals the manifest; org-wide row count equals active-member count.
4. Record evidence (counts and a per-role histogram, no names) in the migration receipt.

Illustrative shape only (NOT executable as written; role map comes from the approved manifest):

```sql
-- illustrative / not approved
insert into public.location_memberships (location_id, profile_id, role, active)
select :approved_location_id, m.profile_id,
       case when m.roles = array['owner']::public.app_role[]           then 'manager'
            when m.roles = array['general_manager']::public.app_role[] then 'manager'
            when m.roles = array['shift_manager']::public.app_role[]   then 'assistant_manager'
            when m.roles = array['host']::public.app_role[]            then 'staff'
            when m.roles = array['server']::public.app_role[]          then 'staff' end::public.location_role,
       true
from public.memberships m
where m.organization_id = :approved_org_id and m.active
  and array_length(m.roles,1) = 1                -- ambiguous arrays are rejected by preflight, not mapped
on conflict (location_id, profile_id) do nothing;
```

### 5.1 Conflict handling

| Conflict                                             | Rule                                                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Existing row, same role                              | No-op (idempotent).                                                                       |
| Existing row, different role (higher or lower)       | **Abort that org; report.** Never silently raise or lower. Owner resolves per row.        |
| Existing **inactive** row                            | Abort that org; report. Never reactivate (a deliberate deactivation must be honored).     |
| Org has >1 active location, or 0                     | Skip org; list under owner decisions.                                                     |
| Member with multi-role / empty array                 | Skip member; abort the org (partial application is unsafe); owner approves a single role. |
| Active member whose credential is missing / inactive | Not a mapping blocker; report only.                                                       |
| Member of two orgs                                   | Each org evaluated independently; nothing crosses orgs.                                   |
| Manifest id not found / wrong org / archived         | Abort; never fall back to name matching.                                                  |

### 5.2 Preservation rules

- Preserve existing `location_memberships` (any status), module configs, attendance modes, audit and financial history. The migration creates rows only; it never updates or deletes.
- Do not touch Overall roles (none exist; none may be created).
- Do not modify `memberships.roles` (legacy column stays the org-level source; V2-D019 resolver reads both).
- Do not touch Neon, `attendance_identity_links`, passcode credentials or PIN lockout state.
- Fixtures excluded by manifest membership, not by name pattern at run time.

## 6. Required owner decisions (see OWNER_DECISIONS_REQUIRED.md)

D-1 Production org/location identity and role manifest (blocks Batch C only) · D-2 role mapping approval (blocks Batch B manifest tooling) · D-3 Manual Preview disposition · D-4 harness fixture disposition.

## 7. Suggested post-migration verification (rehearsal and Hosted DEV)

1. For each approved org: active members = active location memberships; role histogram equals the manifest; no inactive-row changes.
2. Org-level effective-access equivalence: for each (member, module) compare the effective level **before** (legacy fallback) vs **after** using the actual `private.*_profile_level` functions as that member's JWT; expected diff is zero or an owner-approved increase. Record any reduction as a defect.
3. Resolver parity: every approved active member resolves `resolved` (not `no_access`) in `/r/<slug>`; org owner/GM now gain `location:access`.
4. Cross-org / cross-location negatives: a member of org A gets no access to org B; in a multi-location org no member gains an unassigned location.
5. Null-location counts on `task_notifications`, `payroll_periods`, `inventory_change_log`, `audit_events` are reported and explained.
6. Row counts of every operational table unchanged (backfill touches only `location_memberships`).
7. Enforcement still `staged`; finance `enabled=false`; Overall roles 0; ledger unchanged by the data step (the data step is not a schema migration unless the owner decides it ships as one — see BATCH_B_C_DEPENDENCIES).

## 8. Gate A2

Every proposed mapping is justified by an authoritative source (observed DEV data, deployed functions, V2-D019, ACCESS_MODEL) or marked awaiting owner decision / UNVERIFIED. **A2: PASS (DEV), Production identity open.**
