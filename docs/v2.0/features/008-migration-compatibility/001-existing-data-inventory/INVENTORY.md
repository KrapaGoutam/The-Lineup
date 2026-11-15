# V2-008.001 — Existing Data Inventory

Status: **DISCOVERY COMPLETE (Hosted DEV observed, Production and Neon NOT observed).** Read-only. No data, schema, role, location or module setting was changed.

## 1. Scope, method and revisions

| Item                  | Value                                                                                                                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Environment read      | Hosted DEV `opmujepkemwcdxxorhfd` only                                                                                                                                                                                                 |
| Read time             | 2026-11-12 ~19:42–20:10 UTC                                                                                                                                                                                                            |
| Method                | Supabase Management API `database/query`, every statement wrapped in `begin read only; …; rollback;`, statement guard allowing only `SELECT`/`WITH`. Counts via `query_to_xml`/aggregates. No `INSERT/UPDATE/DELETE/DDL/RPC` executed. |
| Source revision       | `development` = `790fd2db560c41cb27affe98a70faeb7bd3f07cd` (PR #324 merge); this branch `feature/v2-008-migration-compatibility`                                                                                                       |
| DEV migration ledger  | **88**, latest `20261111120000` (`kiosk_device_registration`) — matches `development` (88 files)                                                                                                                                       |
| `main` migrations     | 62 files, latest `20261029194855`. **26 V2 migrations (`20261102213000` … `20261111120000`) exist on `development` and not on `main`.**                                                                                                |
| Not read              | **Production** (prohibited), **Neon** (prohibited), Vercel, Auth user records                                                                                                                                                          |
| Sensitive-data policy | Only counts, enum values, slugs, and 8-character ID prefixes are recorded. No names of people, emails, PINs, passcode locators/hashes, tokens or Auth data were read or stored.                                                        |

Every observation below is marked **[DEV]** (observed) or **[UNVERIFIED]** (inference or not observable). Nothing is invented.

## 2. Schema facts (deployed schema is authoritative)

- Canonical per-location assignment table: **`public.location_memberships`** (`location_id`, `profile_id`, `role location_role`, `active`; `unique (location_id, profile_id)`). Roles: `manager`, `assistant_manager`, `staff`. The `location_assignments` table in `MIGRATION_STRATEGY.md §2.1` and `MODULE_SCOPE_MATRIX.md` **does not exist** (see `002-…/MAPPING_PLAN.md §3`).
- Organization role table: `public.memberships` (`roles public.app_role[]`: `owner`, `general_manager`, `shift_manager`, `host`, `server`; `active`). Unique per (profile, organization) — **[DEV]** 0 duplicates.
- Overall roles: `public.overall_roles` (`owner`, `manager`, `assistant_manager`), no client write path. **[DEV] 0 rows.**
- Module keys (`public.location_module_key`) — verified identical to the canonical nine: `table_allocation, tasks, schedule, tips, team, attendance, payroll, bar_inventory, recipes`. `settings` is not an enum member.
- `locations.attendance_mode` is nullable `attendance_mode` (`external`, `internal_the_lineup`, `disabled`). V2-006 contract: `NULL` = unconfigured, fails closed for native clocking, treated as external-compatible for reads.
- Enforcement switch: `module_enforcement_settings.mode`. **[DEV] `staged`**, no activation reference.
- Finance switch: `attendance_financial_activation.enabled` = **false** (singleton, last changed 2026-11-10).
- Legacy loader `getPrimaryLocation(organizationId)` (`src/features/locations/data/primary-location.ts`) is **still called** from 6 non-test source files (allocation actions, attendance financial-readiness and native-report actions, context reconcile gate and workspace-expectation, module-enforcement); 5 further files (allocation, bar-inventory, schedule and tips data) import other helpers from the same module. It is a compatibility seam, not an authorization source.

## 3. Organizations **[DEV]**

33 organizations.

| Class                                        | Orgs | Slug pattern                                                                                                             | Active locations | Notes                                                                                                                                |
| -------------------------------------------- | ---: | ------------------------------------------------------------------------------------------------------------------------ | ---------------: | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Real-business (DEV copy)**                 |    1 | `the-monks` ("The Monk's DEV")                                                                                           |                1 | 5 active members, 5 active passcode credentials; the only org with operational history.                                              |
| **Ambiguous / manual-QA**                    |    1 | `the-lineup-manual-preview` (name contains a mojibake em dash)                                                           |                1 | Created 2026-10-29. 2 active members + 2 credentials, **0 location memberships**, 14 recipes, 28 products, 6 vendors. Owner to rule. |
| **Harness fixture (V2 Harness)**             |   28 | `v2h-*` (14, two locations each) and `v2ho-*` "Other" tenants (14, one location each), created 2026-10-26 and 2026-11-03 |               42 | No credentials; memberships provisioned by service role; no location memberships.                                                    |
| **Acceptance fixture (V2-007), all retired** |    3 | `v2007-acc-d0d772-primary`, `v2007-acc-d0d772-foreign`, `v2007-rt-0718df-primary`                                        |                0 | All 5 locations archived, 7 memberships deactivated; retained history (devices revoked, attendance sessions). Never delete/reuse.    |

Total 1 + 1 + 28 + 3 = 33.

## 4. Locations **[DEV]**

49 locations: **44 active, 5 archived**, all `time_zone = 'America/Chicago'`, 0 inactive-but-unarchived.

| Class                     | Locations | Active | Archived | `attendance_mode`                         |        Module config rows | Location memberships |
| ------------------------- | --------: | -----: | -------: | ----------------------------------------- | ------------------------: | -------------------: |
| The Monk's DEV            |         1 |      1 |        0 | `NULL`                                    | 9 (8 disabled, 1 enabled) |             5 active |
| Manual Preview            |         1 |      1 |        0 | `NULL`                                    |                         0 |                    0 |
| Harness primary (`v2h-`)  |        28 |     28 |        0 | `NULL`                                    |                         0 |                    0 |
| Harness "Other" (`v2ho-`) |        14 |     14 |        0 | `NULL`                                    |                         0 |                    0 |
| V2-007 acceptance         |         5 |      0 |        5 | 4 × `internal_the_lineup`, 1 × `external` |           5 (all enabled) |    10 (all inactive) |
| **Total**                 |    **49** | **44** |    **5** |                                           |                    **14** |               **15** |

Active-location truth: **42 of the 44 active locations are harness fixtures.** The other two are The Monk's DEV "DEV Location" (the legacy pilot analogue, Webster stand-in) and the Manual Preview "DEV Bar & Lounge".

### 4.1 Module configuration state **[DEV]**

- The Monk's DEV Location has all nine rows. Only `bar_inventory` is **enabled** (created 2026-11-09 by the owner account). The other eight (`table_allocation, tasks, schedule, tips, team, attendance, payroll, recipes`) were created 2026-11-11 04:54–04:56 UTC by the org-owner account through the Settings editor, and are all **disabled**. Provenance is a manual authenticated session; the audit log holds no entry for module changes, so **intent is not established** (see Decision D-5).
- Module-enforcement readiness function (`private.module_enforcement_readiness()`), read-only: **44 active locations → 1 ready, 43 not ready** (all 43 have zero rows; none partial). The activation guard refuses `active` while any active location is not ready.
- Consequence: if enforcement were activated with today's data, every module except Bar Inventory would be denied at the only real DEV location. **Do not activate** without the owner confirming D-5.

### 4.2 Attendance mode **[DEV]**

- 44 active locations all `NULL` (unconfigured). Only the 5 retired acceptance locations carry explicit modes.
- `attendance_identity_links` (Supabase ↔ Neon user link) has **0 rows** in DEV. DEV therefore cannot show which Monks members have Neon links; **[UNVERIFIED] on Production**.

## 5. Users, roles and credentials **[DEV]**

- Profiles: 60. Profiles with no membership: 1 (a bare profile; identity not read). Profiles in more than one organization: **0**. Profiles with active location memberships at more than one location: **0**.
- Organization memberships: 59 — Monks 5 (1 owner, 1 general_manager, 3 server); Manual Preview 2 (1 general_manager, 1 server); harness 45 (28 owner, 14 general_manager, 2 server, 1 shift_manager); V2-007 acceptance 7 (all inactive). **Every membership has a single-element role array** (0 multi-role, 0 empty).
- Location memberships: 15 — Monks 5 active (2 `manager`, 3 `staff`), acceptance 10 inactive. Created 2026-11-05 for Monks, one per org member.
  - The Monks DEV mapping already present is exactly **owner → `manager`, general_manager → `manager`, server → `staff`**, matching V2-D019.
  - Orphans: location memberships without an org membership **0**; active location membership with inactive org membership **0**.
- Org members with **no** location membership (`no_access` in the resolver): 45 harness rows, **2 Manual Preview rows**, and the 1 deactivated acceptance owner.
- Passcode credentials: 14 (Monks 5, Manual Preview 2, retired acceptance 7). Credentials without a membership: 0. Active credentials with an inactive membership: 0. Active members without a credential: 45 (all harness, service-role provisioned).
- Overall roles: **0** (zero Overall Owners is the established state; none were or may be created in Batch A).
- Access requests (`registrations`): 4, all `approved`. Their handling of location assignment was **not inspected** (see §9).

## 6. Operational records **[DEV]**

Row counts are for all of DEV; "Monks" is rows whose location belongs to The Monk's DEV.

| Domain             | Tables (rows)                                                                                                                                                                   | Location-keyed?              | Null `location_id`       |                          Monks |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------ | -----------------------------: |
| Table allocation   | `dining_areas` (5), `dining_tables` (96), `service_sessions` (0), `seatings` (0), `floor_templates` (0)                                                                         | Yes, NOT NULL                | 0                        |                     2 / 27 / 0 |
| Tasks              | `tasks` (48), `checklist_instances` (21), `checklist_templates` (2), `task_recurrence_rules` (1), `task_notifications` (193; nullable column)                                   | Yes                          | 0                        |      all 48 / 21 / 2 / 1 / 193 |
| Schedule           | `schedule_periods`, `shifts`, `shift_templates`, `shift_kind_defaults` (all 0)                                                                                                  | Yes, NOT NULL                | 0                        |                              0 |
| Tips               | `tip_pools` (0) + derived tables (0)                                                                                                                                            | Yes                          | 0                        |                              0 |
| Payroll            | `payroll_periods` (0, nullable `location_id`), settings/rates/payments/adjustments (0)                                                                                          | Hybrid                       | 0                        |                              0 |
| Bar Inventory      | `inventory_stock` (236), `inventory_adjustments` (126), `inventory_change_log` (719, nullable), `inventory_date_lots` (47), order drafts (13/16), saved views (10), imports (5) | Yes; catalog is org-level    | 0                        | 32 / 34 / 414 / 24 / 3 / 5 / 5 |
| Org-level catalogs | `inventory_products` (148: Monks 32, harness 88, Manual Preview 28), `inventory_vendors` (69), `bar_recipes` (32: Monks 18, Manual Preview 14) and children                     | No `location_id` (by design) | n/a                      |                            n/a |
| Attendance         | `attendance_sessions` (4), `attendance_events` (10), `attendance_breaks` (1)                                                                                                    | Yes                          | 0                        |                          **0** |
| Kiosk              | `kiosk_devices` (6, all `revoked`), `kiosk_pairing_codes` (8), `kiosk_sessions` (**0**), `kiosk_pairing_attempts` (11)                                                          | Yes                          | 0                        |                              0 |
| Audit/lifecycle    | `audit_events` (14; **1 row with null `location_id`**, an org-level designation change), `location_lifecycle_events` (10)                                                       | Mixed                        | 1 (legitimate org-level) |                              0 |

Integrity checks:

- **Cross-tenant mismatch:** for all 41 tables carrying both `organization_id` and `location_id`, the row's organization equals its location's organization. **0 mismatching rows.**
- **Missing location:** 0 rows with a null location in any NOT NULL-by-design table; the only null-location row is the intentional org-level audit event.
- **Time zones:** all 49 locations `America/Chicago`; no timezone/business-date conflict is present in DEV data.
- **Attendance evidence for Monks:** none (all 4 attendance sessions belong to retired acceptance orgs). Monks' real attendance remains in Neon (external) — **[UNVERIFIED]**.
- Schedule, Tips, Payroll, Service Sessions are **empty in DEV**. DEV therefore cannot prove backfill behavior for those domains; Production (or a restored copy) is required for that evidence.

## 7. Compatibility hazards discovered

| ID   | Sev    | Hazard                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Evidence                                                                                              |
| ---- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| H-1  | **P0** | **Legacy single-location fallback cliff.** `can_operate_board`, `tasks_workforce_eligible`, `schedule_profile_level`, `tips_profile_level` and (for shift_manager) `attendance`/`payroll`/`inventory_profile_level` grant org-role access only while the org has exactly one active location **and no `location_memberships` row at all** (rows of any status count). The first row ever inserted removes the fallback for **every** member of that org. A partial or interrupted backfill locks out every unassigned member. | Function definitions read from DEV (`pg_get_functiondef`); `MAPPING_PLAN.md §5`.                      |
| H-2  | **P0** | **Production has no V2 schema.** `main` has 62 migrations; `development` has 88. Production presumably has none of `location_memberships`, `location_module_configs`, `overall_roles`, kiosk, attendance-v2. The backfill must run after the 26 V2 migrations and before the V2 app is released, in a rehearsed order. Production state is **[UNVERIFIED]**; reading it needs separate owner authorization.                                                                                                                   | `git ls-tree` of `origin/main` vs `origin/development`; `MIGRATION_STRATEGY.md`; prior release notes. |
| H-3  | P1     | **Enforcement activation is blocked and could silently disable the pilot.** DEV readiness is 1/44. Monks DEV has 8 of 9 modules explicitly disabled with unknown intent.                                                                                                                                                                                                                                                                                                                                                      | §4.1                                                                                                  |
| H-4  | P1     | **43 active non-Monks locations have no configuration.** They are 42 harness fixtures plus Manual Preview. They either need explicit rows or must leave the "active" set (archive is reversible via `restore_archive`). Seeding configuration onto fixtures preserves clutter; archiving removes them from readiness.                                                                                                                                                                                                         | `module_enforcement_readiness()`, lifecycle actions in `20261104020000`.                              |
| H-5  | P1     | **Manual Preview members cannot operate their location.** 2 active members, 1 active location, 0 location memberships → resolver `no_access` (org owner/GM without assignment, per V2-003.001). Org holds recipes/inventory data, so it is not a disposable fixture by data volume.                                                                                                                                                                                                                                           | §5, `access-resolver.ts` §6B/6C.                                                                      |
| H-6  | P1     | **Location role spills into org-level catalogs.** An active `manager`/`assistant_manager` row **at any location** grants org-wide Recipes management (`recipes_is_manager`) and Inventory org-manager (`inventory_is_manager`). A mapping that gives such a row to a user whose org role did not already carry it is a privilege expansion beyond the one location.                                                                                                                                                           | Function definitions; `ROLE_MAPPING_PLAN.md §4`.                                                      |
| H-7  | P1     | **Inconsistent combine semantics.** Tasks/Tips/Schedule use `coalesce(location role, org role)` (a location row **overrides** the org role); Attendance/Payroll/Inventory use `greatest(...)`. A lower-than-org location role lowers Tasks/Tips/Schedule access but not the others.                                                                                                                                                                                                                                           | Function definitions.                                                                                 |
| H-8  | P2     | The strategy doc's `attendance_mode = 'external'` blanket update contradicts the shipped V2-006 contract ("no silent backfill; NULL = unconfigured") and the approved "preserve, don't force" rule.                                                                                                                                                                                                                                                                                                                           | `MIGRATION_STRATEGY.md §2.2` vs migration `20261110000000` header and `attendance-mode.ts`.           |
| H-9  | P2     | `getPrimaryLocation` is still called from 6 non-test source files. Safe while orgs are single-location; ambiguous for multi-location orgs. Not changed here.                                                                                                                                                                                                                                                                                                                                                                  | `grep -rl getPrimaryLocation src` (non-test).                                                         |
| H-10 | P2     | Manual Preview org name contains a mojibake `ΓÇö` (encoding artifact); cosmetic, noted for the disposition decision.                                                                                                                                                                                                                                                                                                                                                                                                          | §3                                                                                                    |

## 8. Duplicate / ambiguous assignment review

- Duplicate org memberships: 0. Duplicate (location, profile) rows: prevented by `unique (location_id, profile_id)`.
- Users spanning orgs or locations: 0 in DEV (multi-org/multi-location behavior is therefore covered only by pgTAP/Vitest, not by DEV data).
- Ambiguous classification: Manual Preview org (§3), and which Monks module values are intentional (§4.1).

## 9. Not verified / limits

- Production data and ledger, Neon attendance data/links, Vercel environment values, Auth users.
- `registrations` approval path: whether approving a request creates a location assignment was not inspected; Batch B must read `src` for it before relying on the claim "no code backfills assignments" (the migrations contain no backfill: only the assignment RPC `apply_location_assignment_changes` inserts rows).
- How the 2026-11-05 Monks location memberships were created (RPC or manual) is not recorded; the resulting rows are consistent with the approved mapping.

## 10. Gate A1

All relevant domains are inventoried or marked unverified; every unresolved mapping risk is listed (H-1…H-10). **A1: PASS (Hosted DEV scope), Production-dependent items open.**
