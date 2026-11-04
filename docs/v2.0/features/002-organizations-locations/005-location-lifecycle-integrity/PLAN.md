# Subfeature V2-002.005: Location Lifecycle Integrity — Plan

Parent Feature: [V2-002: Organizations & Locations](../README.md)
Milestone: The Lineup V2.0 (#8) · Program #248 · Feature #250 · Issue #281
Prerequisites: V2-002.001–.004 (PR #280 merged at `b08efeee933507dcd4d7e475f2ebab957d47453e`)
Branch: `feature/v2.0-002.005-location-lifecycle-integrity` (from `origin/development` @ `6aa61760ca8bbe8a643fae8ca8c27958dbd31a69`)
Execution environment: Claude Code Cloud (no Supabase credentials)

## 1. Mission

Safe, auditable deactivation, archive and reactivation of `public.locations`, with operational cascade protection and **no hard deletion**. One forward-only migration: `20261104020000_location_lifecycle_integrity.sql`.

## 2. Lifecycle state model (decision D-1)

One source of truth, fully backward compatible; the existing `active` boolean keeps its meaning for every reader.

| State    | `active` | `archived_at` |
| -------- | -------- | ------------- |
| ACTIVE   | true     | NULL          |
| INACTIVE | false    | NULL          |
| ARCHIVED | false    | NOT NULL      |

`CHECK (archived_at IS NULL OR active = false)` makes `active = true` with an archive timestamp unrepresentable. No second status column was added (that would create two competing sources of truth).

## 3. Transition matrix (decision D-2)

| Action            | From     | To       | Hard-blocker check | Notes                                                                              |
| ----------------- | -------- | -------- | ------------------ | ---------------------------------------------------------------------------------- |
| `deactivate`      | ACTIVE   | INACTIVE | yes                | warnings recorded in the audit snapshot                                            |
| `reactivate`      | INACTIVE | ACTIVE   | none               | restores nothing: staff, sessions, tasks, schedules, tips stay as they are         |
| `archive`         | INACTIVE | ARCHIVED | yes (stricter)     | cannot skip INACTIVE; requires typed location name in the UI                       |
| `restore_archive` | ARCHIVED | INACTIVE | none               | separate from reactivation on purpose; archived never becomes active automatically |

Every other pair raises `LC002`. There is no delete action. A reason (3–500 trimmed characters) is mandatory at the database boundary.

## 4. Authorization (decision D-3)

Identical to every other V2-002 management action (`private.can_manage_location_lifecycle`): Overall Owner, Overall Manager, or an **active** Organization Owner / General Manager of the location's **owning organization**, resolved from the persisted row. Overall Assistant Manager, Location Managers, shift managers, host/server, other-organization managers and inactive/revoked members (including a revoked creator, Issue #106) are denied.

Archive is intentionally **not** restricted to owners only: a second, narrower role rule would diverge from the established contract. Its extra friction is structural instead — it is only reachable from INACTIVE, has stricter blockers, needs a reason, and needs the typed location name.

## 5. Database objects

| Object                                                                | Purpose                                                                                                                                                                                                        |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `locations.archived_at` + `locations_lifecycle_state_consistent`      | lifecycle metadata                                                                                                                                                                                             |
| `public.location_lifecycle_events`                                    | append-only audit (location, organization, actor, previous/new state, reason, blockers snapshot, `changed_at`); RLS read for lifecycle managers; no client write                                               |
| `public.transition_location_lifecycle(uuid,text,text,text)`           | `SECURITY DEFINER`, `search_path=''`, actor from `auth.uid()`, row lock `FOR NO KEY UPDATE`, expected-state guard (`LC003`), transactional blocker re-check (`LC001`), state change + audit in one transaction |
| `public.get_location_lifecycle_readiness(uuid)`                       | informational preview: status, `can*` flags, blockers (bounded counts), retained-history counts                                                                                                                |
| `private.location_lifecycle_blockers/_retained`                       | shared by both functions so preview and enforcement cannot drift                                                                                                                                               |
| `private.locations_guard_lifecycle` (trigger)                         | client roles (`authenticated`, `anon`) cannot change `active`/`archived_at` directly                                                                                                                           |
| `private.locations_forbid_delete` (trigger) + revoked DELETE/TRUNCATE | hard-delete protection                                                                                                                                                                                         |
| `private.guard_location_operational_write` (triggers)                 | rejects NEW operational work at a non-ACTIVE location; takes `FOR SHARE` on the location row                                                                                                                   |

`public.audit_events` was **not** reused: its composite FK requires the actor to be an _organization member_, which an Overall Owner/Manager acting across organizations is not. The actor in the new table is a plain `uuid` (no FK) so account deletion can neither block nor erase history. The location FK (`NO ACTION`) additionally makes a location with history undeletable.

SQLSTATEs: `LC001` blocked (detail = JSON blockers), `LC002` invalid transition, `LC003` state conflict, `42501` unauthorized, `22023` invalid input, `P0002` not found, `55000` operational write at non-active location.

## 6. Concurrency / TOCTOU (decision D-4)

The transition locks the location row (`FOR NO KEY UPDATE`) and then re-reads it, so conflicting transitions serialize; a stale `expected_status` fails with `LC003`. Every guarded operational INSERT first reads the location `FOR SHARE`, which conflicts with that lock. Therefore either the writer commits first (and the transition then sees its work as a blocker) or the transition commits first (and the writer is rejected). Verified with real two-session runs on PostgreSQL 16 (see EVIDENCE.md) — all three orderings behaved deterministically. The guard function is `SECURITY DEFINER` because row locks need UPDATE privilege/policy that ordinary staff lack.

## 7. Operational dependency matrix

Legend — Behaviour on a non-ACTIVE location. "Guard" = `BEFORE INSERT` trigger `<table>_location_lifecycle_guard` (error `55000`). "Update allowed" = corrections/closing remain possible.

| Module            | Table / RPC                                                                                                                                                                        | Location relationship (FK delete) | Deactivate                                       | Archive               | Enforcement                                                                           | Tests                        | Deferred                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------ | --------------------- | ------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------- |
| Staff assignments | `location_memberships`, `apply_location_assignment_changes`                                                                                                                        | `CASCADE`                         | history (kept)                                   | history (kept)        | RPC rejects inactive (existing); NEW insert/re-activate guard on every path           | DB-020…022, DB-023f          | —                                                                         |
| Service sessions  | `service_sessions`                                                                                                                                                                 | `CASCADE`                         | **active = HARD**; planned = warning             | active/planned = HARD | insert guard + guard on `→ active` update                                             | DB-016, DB-023a/b, race runs | —                                                                         |
| Seatings / board  | `seatings`, `rotation_*`, `board_*` (via session)                                                                                                                                  | `CASCADE` (via session)           | open seating = HARD                              | open seating = HARD   | no new session ⇒ no new board activity; seatings insert guard                         | DB-023f (trigger inventory)  | —                                                                         |
| Scheduling        | `schedule_periods`, `shifts`                                                                                                                                                       | `CASCADE`                         | published future shifts, draft periods = warning | HARD                  | insert guards; shifts/periods never deleted                                           | DB-023c, DB-023f             | publish of existing draft (update)                                        |
| Tasks             | `tasks`, `checklist_instances`, `task_recurrence_rules`                                                                                                                            | `NO ACTION`                       | open tasks, active series = warning              | HARD                  | insert guards (blocks generation + new series); completing/cancelling stays possible  | DB-023e, DB-023f             | —                                                                         |
| Tips              | `tip_pools`                                                                                                                                                                        | `NO ACTION`                       | draft = warning; **finalized = historical**      | draft = HARD          | insert guard; finalizing a draft stays possible; finalized never touched              | DB-016d/e, DB-018c/e         | —                                                                         |
| Bar inventory     | `inventory_adjustments`, `inventory_order_drafts`, `inventory_import_batches`, `inventory_date_lots`                                                                               | `NO ACTION` / `CASCADE` (lots)    | open order drafts, staged imports = warning      | HARD                  | insert guards on the ledger and workflow tables; **stock balances never zeroed**      | DB-023f                      | see "Not guarded" below                                                   |
| Payroll           | `payroll_*`                                                                                                                                                                        | none (organization-scoped)        | n/a                                              | n/a                   | unaffected                                                                            | —                            | —                                                                         |
| Attendance (Neon) | `attendance_identity_links`                                                                                                                                                        | none (organization-scoped)        | n/a                                              | n/a                   | unaffected; no Kiosk/Attendance V2                                                    | —                            | future attendance integration must check `locations.active`/`archived_at` |
| Configuration     | `shift_templates`, `dining_areas/tables`, `floor_templates`, `operating_hours`, `shift_kind_defaults`, `checklist_templates`, `inventory_freshness_rules`, `inventory_saved_views` | `CASCADE`                         | historical                                       | historical            | intentionally **not** guarded: not operational activity; managers may prepare/correct | —                            | —                                                                         |

**Not guarded, deliberately:** `inventory_stock` — zero rows are auto-seeded for _every_ location of an organization whenever a catalog product is created (`inventory_products_seed_stock`); a guard would break product creation tenant-wide. Stock _changes_ are guarded through `inventory_adjustments`. `shift_assignments`/existing-row updates are corrections, not new work.

Classification rationale: a **hard** blocker is work that is live _now_ and would be stranded or made inconsistent (active session, open seating) or, for archive, anything that still needs a human decision (open tasks, draft pools, published future shifts, open drafts). A **warning** is unresolved work that can still be completed after deactivation because updates stay permitted. **Historical** records (closed sessions, finalized tip pools, completed tasks, ledger rows, assignments) never block and are only counted. The system never closes, cancels or finalizes anything on the user's behalf.

## 8. FK cascade / hard-delete audit (decision D-5)

Several location FKs are `ON DELETE CASCADE` (templates, periods, shifts, dining, sessions, seatings, hours, assignments, date lots…), others `NO ACTION` (tip pools, tasks, checklists, inventory ledger/drafts/imports, audit). Rewriting ~15 FKs in an applied schema was rejected as higher risk than closing the root: `authenticated`/`anon` have **no DELETE/TRUNCATE privilege** on `locations` (re-asserted), no RLS DELETE policy exists, a `BEFORE DELETE` trigger refuses client roles even if a grant/policy were mistakenly added (pgTAP DB-015d), no function in `public`/`private` deletes from `public.locations` (static pgTAP check DB-015f), and the lifecycle-audit FK blocks removal for any location with history (DB-015e). Privileged break-glass sessions (postgres/service_role) remain possible by design (test-fixture teardown relies on it).

## 9. Application layer

Domain `domain/location-lifecycle.ts` (pure: status mapping, transitions, reason, blocker evaluation/formatting, fail-closed payload parsing). Data `data/location-lifecycle.ts` (RPC wrappers, error classification). Actions `actions/location-lifecycle-actions.ts`: live session → actor from `auth.getUser()` → `verifyLocationAdminAuthority` → location resolved from persisted data and checked against the claimed organization (`TENANT_MISMATCH`) → RPC (expected status sent, actor never sent). `Location.archivedAt` added as optional (compatible); readers' column lists include `archived_at`; `listActiveLocationsByOrganization`/`getCurrentUserAccessibleLocations` already filter `active = true`, so inactive and archived are never offered as operational choices, while `getLocationById`/`listLocationsByOrganization` still return archived rows for management and history.

UI (inside Location Administration): lifecycle badge (text, not colour only); Active → [Manage][Deactivate]; Inactive → [Manage][Reactivate][Archive]; Archived → [View History] only, in a collapsible "archived locations" section (`aria-expanded`). Confirmation dialog: location, organization, current → next state, impact text, real blocker counts (hard blocks confirmation, never offers bulk-cancel), warnings, retained-history summary, required reason, typed name for archive, pending/error/stale states. `LocationLifecycleSource` boundary: live uses the actions; the demo source is closure-scoped in-memory and imports no server action (test-asserted).

## 10. Rollout / rollback

Additive. Existing rows become ACTIVE/INACTIVE unchanged; the new guards only reject writes at locations that are already `active = false`. Rollback is a forward migration dropping the triggers (and optionally the RPCs/table); `archived_at` data is preserved. Hosted DEV apply and real-database verification are Codex Local steps.

## 11. Non-goals

V2-003 context switching, module scoping, attendance/Clock Kiosk, inventory transfer/disposal workflows, payroll changes, any Delete UI, bulk "resolve all" tooling.

## 12. Known limits / honest notes

- Guards cover INSERT and the session-activation / assignment-reactivation edges. An existing _draft_ schedule period can still be published at an inactive location (update). It is a warning on deactivate and a hard blocker on archive; closing this edge is a candidate for V2-005 if desired — it creates no new operational rows.
- Blocker counts are bounded at 1000 (`capped`).
- Generated types (`database.generated.ts`) were edited by hand (no database in Cloud); Codex Local must confirm `supabase gen types` yields no diff.
