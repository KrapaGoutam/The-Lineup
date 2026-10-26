# Table Allocation Version Upgrade Part 1 — Audit

**Status:** Complete; implementation is not started and requires explicit user approval

**Scope:** Table Allocation / Table Rotation only

**Branch:** `upgrade/table-allocation-v2-part1`

**Base:** fetched `origin/main` at `3403058`

**Audit date:** 2026-10-21

**Method:** current source, migrations, tests, Git, public GitHub metadata, and read-only platform inspection. Historical documentation is evidence, not runtime truth.

## Executive Summary

The module has one shared client workspace and one shared server-action dispatcher, but it does not yet have one consistently enforced state and mutation contract. Logical rotation is held in `table_rotation_entries`; current physical claims are trigger-derived in `section_assignments`; the frontend reconstructs physical occupancy from entry labels instead of reading the physical ledger. Sixteen public board RPCs mutate the same graph, with `board_events` serving audit, undo/redo, and Realtime invalidation.

Two findings are critical:

1. **P0 RLS:** ending a table fails whenever the caller differs from the original assigner. `board_end_table` updates status without changing `assigned_by`, while the final UPDATE policy requires the result row's `assigned_by = auth.uid()`. Floor and Servers expose this path; Grid and Picker do not.
2. **P0 data model/RPC:** entry constraints prove organization consistency but not that the supplied round, rotation member, and guarded service session are the same session. A direct RPC caller can validate an unlocked current session while targeting same-organization historical IDs.

The minimum safe upgrade order is database integrity and authorization first, then a single RPC-only mutation boundary, then shared read/type contracts, then client consistency and cross-view semantics. Frontend workarounds must not precede the database correction.

Production parity is **not independently verifiable**. The active Supabase context exposes only JobQuest projects, not expected project `ftadewtkjlaotfdvtjcv`. GitHub CLI has an invalid token. The Vercel link resolves to `the-lineup` under team `Onepiece`, but all cloud mutations remain stopped because the complete project identity set is not safe. The production URL responds HTTP 200, which proves reachability only.

Finding totals in this audit: **2 P0, 18 P1, 12 P2, and 2 P3**. Counts group related symptoms under one root finding.

## Current Architecture

### Request and state flow

```text
/ or /r/[restaurantSlug] (Server Component)
  -> loadPageData
     -> authenticated user + organization/location/team/tip state
     -> getAllocationContext(organization, optional date)
        -> dining_tables + dining_areas relationship
        -> latest service_session for location/date
        -> rotation_members + rotation_rounds
        -> table_rotation_entries + board_events
     -> RestaurantOperationsApp (long-lived client state)
        -> AllocationWorkspace (Grid/Floor/Picker/Servers/Dashboard)
           -> optimistic shared RotationBoard
           -> executeBoardActionRemote (Server Action)
              -> one of 16 public RPCs
                 -> rotation/session/entry tables
                 -> entry trigger synchronizes section_assignments
                 -> board_events invalidates subscribed clients
```

Server Components are the initial read boundary. Mutations use Server Actions, then Supabase RPCs. The browser subscribes to `board_events` INSERTs for the active session and calls `router.refresh()`. The client keeps a shared optimistic board across all five views.

### Files / module inventory

Fifteen production application modules form the direct frontend/read boundary:

| Class                       | Files                                                                                                                             | Responsibility                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Entry/read integration      | `src/app/page.tsx`, `src/app/r/[restaurantSlug]/page.tsx`, `src/lib/page-data.ts`, `src/components/restaurant-operations-app.tsx` | Initial auth/read, route assembly, long-lived application state                           |
| Server action / RPC wrapper | `src/features/allocation/actions/allocation-actions.ts`                                                                           | Validates action shape, resolves member/session, calls all public RPCs, revalidates route |
| Data                        | `src/features/allocation/data/allocation-data.ts`                                                                                 | Loads and projects database rows into `AllocationContext` / sparse `RotationBoard`        |
| Shared state/UI             | `allocation-workspace.tsx`, `allocation-date-filter.tsx`                                                                          | View selection, optimistic reducer, date navigation, Realtime, undo/redo                  |
| Views                       | `dashboard-view.tsx`, `floor-view.tsx`, `server-board-view.tsx`, `table-assignment-decision.tsx`, `table-map.tsx`                 | Dashboard, Floor, Servers, Picker, map/resource controls                                  |
| Domain                      | `domain/rotation-board.ts`, `domain/floor-layout.ts`                                                                              | Deterministic board transitions and physical layout resolution                            |

Tests are separate: six allocation-relevant Vitest files, two dedicated allocation Playwright files, and twelve allocation pgTAP files. Historical feature documents 003, 009, 010, 011, 028 and the `table-rotation-multi-view` document set describe superseded as well as current behavior.

## View Data-Flow Maps

All views receive the same client `board`, team, layout, and callbacks from `AllocationWorkspace`. They differ in which actions they expose and how they interpret the shared data.

### Grid

- Initial load: sparse `RotationBoard` projected from `rotation_members`, `rotation_rounds`, and `table_rotation_entries`; no direct `section_assignments` read.
- Client state: the canonical client-side board, selection, undo/redo indicators, date, and pending optimistic history.
- Mutations: Quick Add/Add Member, Remove, Reorder, Pause/Resume, Assign, Assign Also, Unassign/Clear Cell, Skip, row/column/board clears, row add/delete, Undo/Redo.
- RPCs: all general board RPCs except view-only Floor/Server interaction is not required; logically it can invoke the same dispatcher.
- Refresh: optimistic reducer first; on success route revalidation plus Realtime `board_events` refresh. Failure rolls back from a captured board snapshot.
- Risk: combined labels can be typed directly; sparse destination cells break several optimistic reducers; overlapping requests can roll back unrelated later work.

### Floor

- Initial load: physical resources from `dining_tables`/`dining_areas`; occupants are derived by splitting active entry labels, not from `section_assignments`.
- Client state: selected resource, resolved floor layout, occupant badges, modal action state.
- Mutations: Assign, Transfer, End, End selected/multiple/all + Assign.
- RPCs: `board_assign`, `board_transfer`, `board_end_table`, `board_end_and_assign`.
- Events: assign, transfer, end, end-and-assign events are inserted by RPCs.
- Risk: cross-actor End hits the final entry UPDATE RLS defect. Combined entries are presented as separate table badges, but an action affects the whole entry.

### Picker

- Initial load: same layout and entry-derived occupancy as Floor; emphasizes selecting available physical resources and recommended next server.
- Mutations: Assign and Transfer through the shared dispatcher. It deliberately has no End control.
- Refresh: shared board event subscription and optimistic state.
- Risk: nested click propagation can open the map unexpectedly; `nextColumn` only checks labels, so a skipped server can remain next.

### Servers

- Initial load: columns/server order plus active entry labels; active-table counts are client-derived.
- Mutations: Assign Also, Transfer, End, and bulk End + Assign via shared callbacks.
- RPCs: `board_assign`, `board_transfer`, `board_end_table`, `board_end_and_assign`.
- Risk: same cross-actor End RLS failure as Floor; counts can omit unknown/unpositioned layout labels; combined entry actions operate the complete entry.

### Dashboard

- Initial load: derived summaries from the shared board and physical layout.
- Mutations: none directly; navigation/drill-down only.
- Realtime: receives the workspace's refresh, not a separate subscription.
- Risk: recent activity shows only a subset of event types, and occupancy/count definitions can omit active entries whose labels are absent from the layout.

### Shared read policy behavior

Initial database reads exercise membership-scoped SELECT policies on locations, dining resources, service sessions, rotation tables, and events. An individual query failure for member/round/entry/event/session currently logs an error and returns a partial or empty context; only the physical-table load is surfaced as an explicit allocation error.

## Operation Matrix

`executeBoardActionRemote` is the server boundary for board mutations. “Entries” below means `table_rotation_entries`; `SA` means `section_assignments` is maintained indirectly by the entry trigger. Every event INSERT is also the Realtime invalidation signal.

| View / action                           | Client handler -> server action | RPC                       | Tables written                                 | Effective policy/event                        | Other views affected        |
| --------------------------------------- | ------------------------------- | ------------------------- | ---------------------------------------------- | --------------------------------------------- | --------------------------- |
| Grid Quick Add / Add Member             | dispatch add-column             | `board_add_column`        | `service_sessions`, `rotation_members`, rounds | member/session policies; add_column           | All                         |
| Grid Remove Member                      | set status removed              | `board_set_column_status` | `rotation_members`, `board_events`             | operate-service; column_status                | All                         |
| Grid Reorder                            | move-column                     | `board_move_column`       | `rotation_members`, `board_events`             | operate-service; move_column                  | All                         |
| Grid Pause / Resume                     | set-column-status               | `board_set_column_status` | `rotation_members`, `board_events`             | operate-service; column_status                | All                         |
| Grid/Floor/Picker/Servers Assign        | assign                          | `board_assign`            | rounds, entries, SA, events                    | entry INSERT; assign                          | All                         |
| Grid/Servers Assign Also                | assign into next eligible round | `board_assign`            | rounds, entries, SA, events                    | entry INSERT; assign                          | All                         |
| Floor/Picker/Servers Transfer           | transfer                        | `board_transfer`          | source/destination entries, SA, events         | entry DELETE/INSERT; transfer                 | All                         |
| Floor/Servers End                       | end-table                       | `board_end_table`         | entry status, SA, events                       | entry UPDATE; end; **P0 cross-actor failure** | All                         |
| Floor/Servers End one/many/all + Assign | end-and-assign                  | `board_end_and_assign`    | entries, rounds, SA, events                    | UPDATE/INSERT; end_and_assign                 | All                         |
| Grid Unassign                           | clear-cell                      | `board_clear_cell`        | entries, SA, events                            | entry DELETE; clear_cell                      | All; undo currently blocked |
| Grid Skip                               | skip-turn                       | `board_skip_turn`         | entries, events                                | entry INSERT/UPDATE; skip                     | All                         |
| Grid Add Row                            | add-row                         | `board_add_row`           | rounds, events                                 | round INSERT; add_row                         | All                         |
| Grid Delete Row                         | delete-row                      | `board_delete_row`        | rounds/entries/SA/events                       | DELETE policies; delete_row                   | All                         |
| Grid Clear Row                          | clear-row                       | `board_clear_row`         | entries/SA/events                              | entry DELETE; clear_row                       | All                         |
| Grid Clear Column                       | clear-column                    | `board_clear_column`      | entries/SA/events                              | entry DELETE; clear_column                    | All                         |
| Grid Clear Board                        | clear-board                     | `board_clear_board`       | entries/SA/events                              | entry DELETE; clear_board                     | All                         |
| Workspace Undo                          | undo button -> undo action      | `board_undo`              | operation-specific rows + events               | relevant policies; marks event undone         | All                         |
| Workspace Redo                          | redo button -> redo action      | `board_redo`              | operation-specific rows + events               | relevant policies; marks event redone         | All                         |

The views do not call distinct RPCs for identical logical operations; inconsistency is chiefly action exposure and client interpretation. Floor and Servers uniquely expose End, which is why they surface the shared RPC/policy defect.

## Database Table Inventory

Fourteen directly or indirectly relevant tables were identified. All public operational tables are intended to have RLS enabled; exact production flags/owners remain unverified.

| Table                                                  | Purpose / source of truth                                       | Keys, constraints, indexes                                                                                    | Read / written by                                            |
| ------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `organizations`                                        | Tenant root                                                     | PK `id`; creator reference                                                                                    | auth/page bootstrap; authorization helper reads              |
| `memberships`                                          | Authoritative user-to-org role/active membership                | member/org/user FKs and membership uniqueness                                                                 | auth/team reads; RLS helpers                                 |
| `profiles`                                             | Display identity for members                                    | PK/FK to auth identity                                                                                        | roster/page read                                             |
| `locations`                                            | Location scope                                                  | PK; org FK and tenant indexes                                                                                 | allocation selects primary location                          |
| `dining_areas`                                         | Physical layout grouping                                        | PK; location/org FKs; unique `(location_id,name)`                                                             | floor/table load; layout management elsewhere                |
| `dining_tables`                                        | Physical table/bar registry and coordinates                     | PK; location/area/org FKs; unique `(location_id,label)`                                                       | Floor/Picker/Servers/Dashboard read                          |
| `service_sessions`                                     | Daily location/meal board boundary                              | PK; org/location FKs; partial unique active session per location/date/meal                                    | context load; get/create RPC helper                          |
| `rotation_members`                                     | Server order and active/paused/removed status                   | PK; session/server FKs; unique session/server; deferrable unique session/position                             | all views; add/status/reorder RPCs                           |
| `rotation_rounds`                                      | Ordered board rows                                              | PK; session/org FKs; unique session/sequence                                                                  | Grid/all entry projection; row RPCs                          |
| `table_rotation_entries`                               | Logical assignment/skip/end history                             | PK; round/member/org FKs; unique round/member; status lifecycle                                               | all views; assignment/clear/transfer/end/skip/undo/redo RPCs |
| `section_assignments`                                  | Current physical occupancy/conflict ledger                      | PK; org/location/session/table/entry/member FKs; partial unique active `(service_session_id,dining_table_id)` | entry-sync trigger writes; current UI does **not** read      |
| `board_events`                                         | Mutation audit, undo/redo payload, Realtime invalidation        | PK; session/org/actor FKs; index `(service_session_id,created_at)`                                            | context/realtime reads; every RPC writes                     |
| `tip_pools`                                            | Finalized service-date lock                                     | PK; unique location/date; org/location FKs                                                                    | lock helpers/policies; tips UI writes                        |
| `attendance_identity_links` + external attendance read | Prioritizes current floor-team roster; not assignment authority | tenant/profile link constraints; external attendance is read-only integration                                 | page/team bootstrap; never auto-adds a rotation member       |

Important missing index: entry lookups by `(rotation_member_id, status)` lack a leading composite index. `active_table_count` and `max_concurrent_tables` exist in the model but are not a maintained or enforced source of truth.

## Database Relationship Graph

```text
auth.users
  -> profiles
  -> memberships -> organizations
                       |
                       +-> locations
                       |     +-> dining_areas -> dining_tables
                       |     +-> tip_pools (date lock)
                       |     +-> service_sessions
                       |            +-> rotation_members -> member/profile
                       |            +-> rotation_rounds
                       |            |      +-> table_rotation_entries
                       |            |             |  (AFTER trigger, label resolution)
                       |            |             +-> section_assignments -> dining_tables
                       |            +-> board_events
                       +-> all operational rows carry organization_id
```

The logical rotation and physical-resource domains meet in the entry synchronization trigger: an active entry label resolves to one or more `dining_tables`, then active `section_assignments` claims those tables. The frontend instead repeats this connection by splitting entry labels.

## Source-of-Truth Analysis

| Domain state                | Authoritative source                                  | Derived/overlapping source                                | Synchronization / divergence risk                                                   |
| --------------------------- | ----------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Rotation history            | `table_rotation_entries` lifecycle rows               | client `RotationBoard`                                    | Server read projection; partial errors and stale client state can diverge           |
| Current logical assignments | active `table_rotation_entries`                       | client active cells                                       | Realtime refresh plus optimistic mutations                                          |
| Current physical occupancy  | active `section_assignments` with unique active claim | UI splits active entry labels and matches `dining_tables` | DB trigger is atomic, but UI never reads ledger; unknown/combined labels diverge    |
| Available tables            | absence of active `section_assignments`               | client absence of matched active labels                   | Same split-source risk                                                              |
| Server active tables        | active entries across rounds                          | client label arrays/counts; `active_table_count` field    | Counter is not maintained; layout-filtered metrics can omit rows                    |
| Server order/status         | `rotation_members.position/status`                    | client columns                                            | Realtime/refetch; concurrency-safe position migration serializes allocation/reorder |
| Turn/next server            | derived from ordered members plus cells               | workspace label-based `nextColumn`                        | skipped cells with null labels are misclassified                                    |
| Audit/undo                  | `board_events` payload/inverse payload                | optimistic activity feed                                  | phantom entries remain after RPC failure; raw event grants permit forgery/update    |

Recommended invariant: entries own logical history, section assignments own current physical claims, rotation members own ordering, and board events are immutable system-written audit/invalidation records. The API should return these roles explicitly rather than recreating physical truth from labels.

## RPC Inventory

Sixteen public RPCs are called by the module. Their final definitions are `SECURITY INVOKER`, use `SET search_path = ''`, revoke PUBLIC/anon execution, and grant authenticated execution. Because they are invoker functions, underlying table RLS remains decisive.

| RPC                       | Purpose                          | Primary authorization/validation                         | Tables / event                        | Principal gap                                |
| ------------------------- | -------------------------------- | -------------------------------------------------------- | ------------------------------------- | -------------------------------------------- |
| `board_assign`            | Assign or assign also            | active board member, unlocked session, member validation | rounds, entries, SA, assign           | round/session identity not structurally tied |
| `board_add_column`        | Add server                       | active member; get/create session                        | sessions, members, rounds, add_column | relies on helper and position lock           |
| `board_set_column_status` | Pause/resume/remove              | active member, unlocked                                  | members, column_status                | direct table grants duplicate boundary       |
| `board_clear_cell`        | Unassign one                     | active member, unlocked                                  | entries, SA, clear_cell               | no undo/redo CASE                            |
| `board_clear_row`         | Clear row                        | active member, unlocked                                  | entries, SA, clear_row                | raw mutation path can bypass event           |
| `board_clear_column`      | Clear server                     | active member, unlocked                                  | entries, SA, clear_column             | same                                         |
| `board_clear_board`       | Clear all                        | active member, unlocked                                  | entries, SA, clear_board              | same                                         |
| `board_move_column`       | Reorder                          | active member, unlocked                                  | members, move_column                  | client overlap; DB position locking improved |
| `board_add_row`           | Add row                          | active member, unlocked                                  | rounds, add_row                       | raw direct round INSERT also granted         |
| `board_delete_row`        | Delete row                       | active member, unlocked                                  | entries/round, SA, delete_row         | needs malicious mixed-ID coverage            |
| `board_transfer`          | Move assignment between servers  | active member, unlocked                                  | entries, SA, transfer                 | combined-entry semantics implicit            |
| `board_end_table`         | End assignment                   | active member, unlocked                                  | entry UPDATE, SA, end                 | cross-actor UPDATE RLS; session mismatch     |
| `board_skip_turn`         | Record skip                      | active member, unlocked                                  | entries, skip                         | sparse client reducer no-op                  |
| `board_end_and_assign`    | End selected entries then assign | active member, unlocked                                  | entries/rounds/SA, end_and_assign     | cross-actor UPDATE RLS; mixed IDs            |
| `board_undo`              | Apply latest inverse             | active member, unlocked                                  | action-specific, event update         | clear_cell absent; no concurrency lock       |
| `board_redo`              | Reapply latest event             | active member, unlocked                                  | action-specific, event update         | same                                         |

Private helpers include `get_or_create_active_session`, `ensure_trailing_round`, `assert_is_active_board_member`, `assert_is_board_manager`, `assert_board_not_locked`, `is_service_date_tip_finalized`, `has_org_role`, entry-to-occupancy synchronization, and event-retention cleanup.

### Security-definer audit

Repository definitions show these security-definer routines:

- `private.has_org_role`: fixed search path, but incorrectly treats `organizations.created_by` as an authorization bypass even without active membership.
- `private.is_service_date_tip_finalized` and `private.assert_board_not_locked`: intentionally centralize a lock check that the caller may be unable to evaluate through `tip_pools` RLS.
- entry-to-`section_assignments` trigger: intentionally must maintain physical claims independent of the caller; it validates tenant/location resolution and is protected from direct browser invocation.
- `private.cleanup_stale_board_events`: privileged retention maintenance.

Function ownership cannot be proven from migration text and must be read from production `pg_proc`. Before any definer expansion, ownership, fixed search path, complete user-ID validation, tenant/location/session validation, and EXECUTE ACLs must be verified. The audit does **not** recommend using SECURITY DEFINER merely to conceal the current policy defect.

## RLS Policy Matrix

Twenty relevant operational policies are effective across the eight allocation tables plus `tip_pools`; shared organization/location/membership policies are additional. Superseded policy definitions were considered chronologically rather than counted as effective.

| Table                    | SELECT     | INSERT                                      | UPDATE                                                       | DELETE                    | Actual effect / issue                                                        |
| ------------------------ | ---------- | ------------------------------------------- | ------------------------------------------------------------ | ------------------------- | ---------------------------------------------------------------------------- |
| `dining_areas`           | org member | manager                                     | manager                                                      | manager                   | Layout read available to members; management restricted                      |
| `dining_tables`          | org member | manager                                     | manager                                                      | manager                   | Same, with tenant/location FKs                                               |
| `service_sessions`       | org member | org member/RPC                              | org member/RPC                                               | none/manager path         | Public raw session mutation remains broader than an RPC-only design          |
| `rotation_members`       | org member | active board member                         | active board member                                          | restricted                | Final `rotation_members_operate_service` supports open service editing       |
| `rotation_rounds`        | org member | active member if unlocked                   | active member if unlocked                                    | active member if unlocked | Raw policy lock query can be neutralized by `tip_pools` RLS invisibility     |
| `table_rotation_entries` | org member | active member, unlocked, caller attribution | active member, unlocked, **result `assigned_by=auth.uid()`** | active member, unlocked   | UPDATE check causes cross-actor End failure; direct writes can omit events   |
| `section_assignments`    | org member | no client write                             | no client write                                              | no client write           | Trigger-owned physical ledger is the strongest boundary                      |
| `board_events`           | org member | active member                               | active member                                                | retention/none            | Browser can forge INSERT and alter audit payload/actor fields; not immutable |
| `tip_pools`              | manager    | manager                                     | manager/draft/reopen rules                                   | manager/draft             | Non-manager board policies cannot safely query it directly                   |

### Role / permission matrix

| Capability                                | Active host/server member | Manager/owner with active membership | Inactive/nonmember | Current enforcement issue                                 |
| ----------------------------------------- | ------------------------: | -----------------------------------: | -----------------: | --------------------------------------------------------- |
| Read current board/layout                 |                       Yes |                                  Yes |                 No | Tenant policies generally sound                           |
| Add/reorder/pause/remove rotation members |                       Yes |                                  Yes |                 No | Product intentionally broadened; raw grants remain        |
| Assign/transfer/clear/skip/end            |                       Yes |                                  Yes |                 No | End is incorrectly limited to original assigner in effect |
| Add/delete/clear rows/board               |                       Yes |                                  Yes |                 No | Raw writes can bypass audit and reliable finalized lock   |
| Undo/redo                                 |                       Yes |                                  Yes |                 No | Event mutability and concurrency weaken audit             |
| Edit dining layout                        |                        No |                                  Yes |                 No | Separate manager boundary                                 |
| Finalize/reopen tips                      |                        No |                                  Yes |                 No | Finalization is board lock source                         |

`private.has_org_role` violates the membership-only rule by OR-ing `organizations.created_by`; a deactivated creator can retain privileged authorization. All authorization must derive from server-verified active membership rows.

## End-Table RLS Trace

### Exact path

```text
Floor: floor-view.tsx End handler
Servers: server-board-view.tsx End handler
  -> allocation-workspace.tsx dispatches `end-table`
  -> allocation-actions.ts calls supabase.rpc("board_end_table", ...)
  -> public.board_end_table (SECURITY INVOKER)
     UPDATE table_rotation_entries
        SET status = 'ended', ended_at = now()
      WHERE rotation_round_id = ... AND rotation_member_id = ...
  -> final UPDATE policy `table_rotation_entries_update_any_member`
     USING: active member + board unlocked
     WITH CHECK: active member + board unlocked + assigned_by = auth.uid()
```

If Mia's entry was assigned by user A and user B ends it, the updated row still carries A in `assigned_by`. PostgreSQL evaluates the resultant row against `WITH CHECK`; B therefore receives `new row violates row-level security policy for table "table_rotation_entries"`. No new entry is created by the ordinary End function. The error says “new row” because PostgreSQL calls the UPDATE post-image a new row. Same-actor tests pass, masking the problem.

The same condition can affect `board_end_and_assign` and undo/redo branches that end an entry. Grid and Picker do not expose End, so their normal UI path does not reproduce it. The repair must preserve immutable original attribution or introduce explicit modifier attribution; it must not rewrite history to satisfy an ill-shaped policy.

## State-Transition Model

```text
empty --Assign--> active --End--> ended
  |                  |
  |                  +--Transfer--> source removed/released + destination active
  |                  +--Unassign--> entry deleted + claim released
  +--Skip----------> skipped

active server --Pause--> paused --Resume--> active --Remove--> removed
```

Definitions used by actual code:

- **ACTIVE:** entry status active and table label present; physical claim should exist for each resolved label.
- **ENDED:** entry retained with status ended and `ended_at`; no active physical claim.
- **UNASSIGNED/empty:** no entry for the round/member cell. “Unassign” deletes rather than lifecycle-ending the row.
- **SKIPPED:** a skipped entry/cell, commonly with no label. The current next-server algorithm incorrectly treats label absence as empty.
- **AVAILABLE:** the UI sees no active label matching a physical table; the database definition is no active `section_assignments` claim.
- **OCCUPIED:** UI-matched active label versus database active claim. These are intended to agree but are two calculations.

Grid's cell lifecycle is richer than Floor/Picker's physical availability model. Dashboard and Servers derive summaries from Grid-shaped entries. A future contract should expose both logical cell state and physical claims without conflating them.

## Occupancy Model

Example lifecycle:

1. **Assign T13 to Mia:** insert/upsert an active entry for Mia in a round. The AFTER trigger resolves `T13`, inserts the active `section_assignments` claim, and the RPC inserts an assign event.
2. **End T13:** update entry to ended and timestamp it. The trigger removes the active physical claim. Insert an end event. Mia's history remains. Today this fails if another user performs End.
3. **Reuse T13 for John:** create a new active entry in John's eligible round; the trigger creates a new active claim. Mia's ended entry remains as history.
4. **Unassign:** delete the active entry; the trigger releases the claim. The event inverse is the only retained reconstruction after deletion.
5. **Transfer:** remove/replace source logical assignment, create destination assignment, and atomically release/claim through trigger behavior.
6. **Assign Also:** place another active entry in the earliest eligible round for the same member. Multiple concurrent active tables are supported because uniqueness is per round/member, not per member.

The partial unique physical claim prevents two active entries from owning the same table in a session. Ordinary End/Unassign deletes the active ledger row instead of retaining `released_at`; only certain conflict-transfer behavior leaves a released record, so `section_assignments` is not a consistent occupancy-history ledger.

### Multi-table server model

The database supports zero, one, or many active entries per server across rounds. No current uniqueness constraint forces one active table per member. The UI nevertheless carries one-to-one assumptions:

- combined labels such as `T1 + T2` are encoded in one entry string;
- physical views split them into separate badges, but End/Transfer/Unassign affects the whole entry;
- counts exclude labels not found in the layout;
- `active_table_count`/`max_concurrent_tables` are unused or unmaintained.

Multi-table support is real at the row level, but combined-resource action semantics need an explicit API/UI contract.

### Service-session model

`get_or_create_active_session` selects or creates the daily location/meal session. A partial unique constraint plus conflict handling prevents duplicate active sessions. The latest concurrency migration serializes rotation position allocation and provides a deferrable uniqueness constraint for reorder operations.

The serious remaining boundary issue is entries: organization FKs do not prove that the member and round share the same service session, and RPCs do not consistently validate every supplied ID against the guarded session. Historical and current session IDs must not be mixable.

## Realtime Model

- With a session, the workspace subscribes to `board_events` INSERT filtered by `service_session_id`.
- With no session, it subscribes to `service_sessions` INSERT filtered only by organization.
- A notification calls `router.refresh()`; visibility change and browser `online` also refresh.
- All five views share this one mechanism. Physical occupancy changes depend on the corresponding RPC also inserting a board event.

Stale-state windows:

1. Navigating to a historical date changes the subscription. Returning to today copies cached initial context without an authoritative refetch, so events received while away can be missed.
2. `todayDate` is frozen at mount; crossing midnight can mismatch route data, date bounds, and read-only state.
3. There is no focus callback or explicit Supabase channel reconnect/backlog reconciliation; `visibilitychange` and `online` are partial compensation.
4. The no-session listener is organization-wide rather than location-specific.
5. `revalidatePath` targets `/r/[slug]`; the root route relies on Realtime or incidental refresh.

Realtime should remain an invalidation mechanism, not the source of truth. Every focus/reconnect/date transition must refetch authoritative context.

## Login / Initial Hydration

Login establishes the session/cookie, then refreshes the route. `RestaurantOperationsApp` is a long-lived client component whose team and tip-status state is initialized from pre-login props. A route refresh does not necessarily remount it, so those states do not resynchronize. `AllocationWorkspace` has a partial board resync, making the overall fix compensatory rather than architectural.

Consequences include entry labels not matching stale team IDs, Quick Add using demo-like IDs, a finalized board appearing writable in the UI while the RPC rejects it, and physical tables appearing available despite active rows. The parent must deliberately sync authoritative props or key/remount the authenticated workspace boundary.

## Undo / Redo Model

RPCs store `payload` and `inverse_payload` in `board_events`; undo selects the latest eligible event and executes an action-specific inverse, while redo reapplies it and updates event state. Occupancy safety depends on the same entry trigger and physical unique constraint as normal mutations.

| Mutation                          | Undo/redo status                   | Key risk                                                  |
| --------------------------------- | ---------------------------------- | --------------------------------------------------------- |
| Assign / Assign Also              | Implemented                        | Mixed-session validation and concurrent newer state       |
| Transfer                          | Implemented                        | Combined-entry meaning; stale target state                |
| End                               | Implemented                        | Cross-actor UPDATE RLS also affects inverse/reapply paths |
| End + Assign                      | Implemented                        | Same plus multi-row atomicity                             |
| Unassign / `clear_cell`           | **Event emitted but CASE missing** | Latest clear-cell event blocks Undo as unsupported        |
| Skip                              | Implemented                        | Sparse client projection/next-server mismatch             |
| Add/delete/clear row/column/board | Varies by CASE, mostly implemented | Broad destructive scope and raw-write bypass              |
| Reorder/status                    | Implemented                        | Concurrent event selection not locked                     |

Undo/redo selects the candidate event without a session/event advisory or row lock. Two concurrent calls can act on the same event. `board_events` is also mutable by ordinary members, so it cannot presently be treated as an immutable audit log.

## Migration History

Nineteen allocation-related migrations were reviewed chronologically. Applied migrations must not be rewritten.

| Migration                                                            | Purpose / current relevance                                                             |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `20260905065702_initial_schema.sql`                                  | Organization, membership, location, initial allocation tables/helpers; current base     |
| `20260905125418_operational_modules.sql`                             | Rotation/event/tip operational schema and first policies; partly superseded             |
| `20260905174919_allocation_open_editing.sql`                         | Open editing and tip reopen; entry policy superseded                                    |
| `20260906080000_board_event_type_reorder_values.sql`                 | Adds/reorders event enum values used by the current board                               |
| `20260906140000_allocation_board_rpcs.sql`                           | Original RPC suite, event model, broad edit policies; function bodies partly superseded |
| `20260906144345_allocation_board_private_fn_grants.sql`              | Private helper ACL hardening; still relevant                                            |
| `20260906144901_table_rotation_entries_update_delete_any_member.sql` | Split entry policies; superseded by final lock fix                                      |
| `20260906145748_allocation_board_manager_only_actions.sql`           | Temporary manager restriction; later broadened                                          |
| `20260908180000_table_rotation_entries_finalized_lock_rls_fix.sql`   | Current entry policies; contains cross-actor UPDATE check                               |
| `20260908190000_board_clear_cell.sql`                                | Adds Unassign event/RPC; undo/redo omission remains                                     |
| `20260908200000_assert_board_not_locked_security_definer.sql`        | First definer lock helper; superseded                                                   |
| `20260908210000_assert_board_not_locked_historical_date.sql`         | Current historical/finalized lock behavior                                              |
| `20260919120000_table_rotation_multi_view_foundation.sql`            | Layout/occupancy foundation, open service permissions, delete row, RPC revisions        |
| `20260919130000_board_events_retention.sql`                          | Seven-day event cleanup                                                                 |
| `20260920100000_table_rotation_upgrade_1_1.sql`                      | Transfer, End, Skip, lifecycle and undo/redo revisions                                  |
| `20260921100000_table_rotation_multi_table_per_server.sql`           | First bulk End + Assign; later superseded                                               |
| `20260922100000_table_rotation_end_multiple_and_assign.sql`          | Current multi-End + Assign and undo/redo definitions                                    |
| `20260923090000_table_rotation_floor_layout_backfill.sql`            | Physical layout/resource backfill                                                       |
| `20260923100000_table_rotation_concurrency_safe_positions.sql`       | Session creation and member-position concurrency safety                                 |

Main's handoff says the final migration is pending, while an unmerged documentation branch records manual deployment and live smoke verification. Neither is authoritative today because production access is unavailable. Required read-only parity checks are listed under Deployment.

## Test Coverage

| Requirement                      | Current coverage                                   | Level / audit result                         | Missing coverage                                                        |
| -------------------------------- | -------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------- |
| Board reducers/lifecycle         | allocation Vitest                                  | 6 files / 73 tests; **73/73 passed**         | Sparse missing-cell mutation cases; overlapping requests                |
| Floor layout/occupancy rendering | floor/table-map Vitest                             | Passing                                      | authoritative `section_assignments` integration                         |
| Data projection                  | allocation-data Vitest                             | Passing regression cases                     | partial query errors and real DB shapes                                 |
| RPC/RLS/schema                   | 12 allocation pgTAP files / 168 planned assertions | Not rerun; local Supabase/Docker unavailable | cross-actor End, all mixed-tenant/location/session inputs, exact grants |
| End lifecycle                    | `0021` pgTAP                                       | Same actor only                              | second authenticated actor; PostgREST/browser path                      |
| Occupancy conflicts              | `0019` pgTAP                                       | Sequential                                   | simultaneous transactions                                               |
| Cross-view browser UX            | 2 Playwright files / 51 tests                      | Not rerun; forced demo mode                  | all RPC/RLS/PostgREST/Realtime behavior                                 |
| Responsive                       | tablet/mobile projects exist                       | CI runs desktop only                         | tablet/mobile PR gate                                                   |
| Multi-device Realtime            | “second device” test                               | one sequential `page`                        | two authenticated contexts and reconnect/backlog                        |
| Deployment compatibility         | workflow build + DB job                            | independent                                  | migration parity/candidate promotion gate                               |

Additional gaps: no Server Action tests for remote dispatch/undo/redo/date loads; no production-prop resync test; no `clear_cell` undo; no creator-deactivation authorization test; no undo concurrency test. Vitest coverage collection currently includes domain files only, excluding actions/data/components.

## Deployment / CLI Account Audit

### Git and GitHub

- Local `main` and freshly fetched `origin/main` were both `3403058`; the audit branch was created from that exact commit.
- Remote is `https://github.com/KrapaGoutam/The-Lineup.git`.
- `gh auth status` labels `KrapaGoutam` but the token returns 401. Public GitHub API inspection found no newer unmerged Table Allocation implementation; relevant open work is documentation/stale feature PRs and dependency updates.
- Result: identity name matches, credentials are invalid; do not push or mutate GitHub until re-authenticated and verified.

### Vercel

- Ignored `.vercel/project.json` links project `the-lineup`, project ID `prj_vIbup0LAziHwNv1cbJ5sUSxqaoaJ`, org/team ID `team_i8igGalPA54kRnKVsTRPVErz`.
- Read-only inspection resolves current user `krapagoutam-2284`, owner team `Onepiece`, Next.js/Node 24.
- The inspection unexpectedly completed a device OAuth flow and changed local CLI credential state; no deployment/project mutation occurred.
- `https://the-lineup-dusky.vercel.app/` responds HTTP 200. GitHub repository metadata names `the-lineup-gamma.vercel.app`, so the canonical-domain documentation is inconsistent.
- Result: linked project is plausible/verified by ID, but no deploy/relink is permitted while the full GitHub/Supabase context is unsafe.

### Supabase and production drift

- Local ignored project ref is expected `ftadewtkjlaotfdvtjcv`.
- Supabase CLI has no usable access token. The connected account exposes only `jobquest-dev` and `jobquest-prod`; direct access to the expected Lineup ref is denied.
- Result: **identity mismatch/blocker; all cloud/database mutations stopped.** No wrong-project query was run.

Once correct read-only access exists, compare repository state with production:

1. migration history and checksums through `20260923100000`;
2. `pg_class.relrowsecurity/relforcerowsecurity`, owners, grants, and `pg_policies`;
3. `pg_proc` signatures, owners, security mode, `proconfig` search paths, ACLs, and relevant definitions;
4. constraints, indexes, triggers, publications, enum values, and retention scheduling;
5. integrity queries for cross-session entries, duplicate/current claims, active-entry/claim disagreement, multiple active sessions, historical modifications, and counter drift;
6. database/PostgREST logs surrounding the reported End error.

### CI/CD and version skew

PR CI runs app checks and demo-mode desktop Playwright. A separate push-to-main workflow links and pushes Supabase migrations. Vercel Git deployment is external and has no dependency on that job. The frontend can therefore go live against an older schema; project history confirms this has happened.

Required release gate: verify all project IDs, dry-run and apply backward-compatible migrations, verify linked migration parity and RPC signatures, deploy an unpromoted candidate, run authenticated live-mode smoke tests, then promote. A database failure must leave the current production alias unchanged.

### Project-context isolation design

Design, do not implement during this audit:

- `scripts/verify-lineup-context.ps1` stores only expected non-secret remote/account/project IDs; checks repository root, origin, `gh api user`, `.vercel/project.json`, noninteractive Vercel whoami/inspect, local Supabase ref and accessible project; prints `SAFE CONTEXT: YES/NO` and fails closed.
- `scripts/use-lineup-context.ps1` reads Windows user environment variables `LINEUP_SUPABASE_ACCESS_TOKEN` and optionally `LINEUP_VERCEL_TOKEN`, maps them to process-only CLI variables for one supplied command, and clears them in `finally` without printing.
- Scope Supabase MCP read-only config to `?project_ref=ftadewtkjlaotfdvtjcv&read_only=true`; use verified CLI workflows for releases.

`.gitignore` and `supabase/.gitignore` correctly cover env files, `.vercel`, MCP local config, Supabase temp state, coverage, Playwright artifacts, and debug logs. No broadening is recommended. The pre-existing untracked `The Lineup.code-workspace` is preserved and excluded.

## Known Defects and Classified Findings

### P0 Critical (2)

| ID / type                 | Finding                                                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RLS-001 / RLS,RPC         | Cross-actor End, bulk End, and related undo/redo status updates fail the entry UPDATE `WITH CHECK` because immutable `assigned_by` belongs to the original assigner. |
| DATA-001 / DATA MODEL,RPC | Entry round/member/session consistency is not structurally enforced; same-org mixed-session IDs permit historical-lock bypass through direct RPC calls.              |

### P1 High (18)

| ID / type                       | Finding                                                                                                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| RLS-002 / RLS,RPC               | Authenticated raw CRUD grants/policies bypass the RPC-only audit and lock boundary.                                   |
| AUDIT-001 / RLS,SECURITY        | `board_events` can be inserted/updated by members, permitting forged or altered audit/inverse payloads.               |
| UNDO-001 / RPC                  | `clear_cell` emits an event but final undo/redo CASE logic does not support it.                                       |
| AUTH-001 / RLS                  | Organization creator bypass in `has_org_role` survives membership deactivation.                                       |
| RLS-003 / RLS                   | Invoker policies query manager-hidden `tip_pools`, making raw finalized-lock enforcement unreliable.                  |
| CONC-001 / CONCURRENCY          | Concurrent undo/redo can select and act on the same event.                                                            |
| FRONT-001 / FRONTEND            | Long-lived application state does not fully resync authoritative team/tip props after login.                          |
| FRONT-002 / FRONTEND            | Sparse board projection causes transfer/end-and-assign crashes and skip no-ops in optimistic reducers.                |
| REAL-001 / REALTIME             | Historical-date navigation can return to stale cached today state.                                                    |
| REAL-002 / REALTIME             | Frozen mount-date produces midnight read-only/date/session mismatch.                                                  |
| FRONT-003 / FRONTEND            | Skipped, label-less server can remain the recommended next server.                                                    |
| FRONT-004 / FRONTEND            | Optimistic activity is not rolled back on RPC failure and only some action types are projected.                       |
| DATA-002 / DATA MODEL,FRONTEND  | Combined-table entries render as separate resources but mutations affect the entire entry without explicit semantics. |
| CONC-002 / FRONTEND,CONCURRENCY | No client pending/serialization boundary permits overlapping rollback and duplicate undo/redo.                        |
| TEST-001 / TEST                 | Demo-only, desktop-only browser CI cannot cover RLS, RPC, Realtime, production shape, or actual devices.              |
| DEP-001 / DEPLOYMENT            | GitHub credential is invalid and expected Supabase project is inaccessible; production parity is blocked.             |
| DEP-002 / DEPLOYMENT            | Vercel and database deployments are independent, allowing proven frontend/schema version skew.                        |
| TEST-002 / TEST,RLS             | No systematic two-tenant/two-location/two-session behavioral and exact-grant matrix exists for all 16 RPCs.           |

### P2 Medium (12)

| ID / type                          | Finding                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| TYPE-001 / FRONTEND                | Generated database types predate lifecycle/layout migrations; Supabase clients omit the `Database` generic.        |
| PERF-001 / DATA MODEL              | Missing leading `(rotation_member_id,status)` entry index.                                                         |
| DATA-003 / DATA MODEL              | `active_table_count`/`max_concurrent_tables` are dead or unenforced.                                               |
| SOURCE-001 / DATA MODEL            | UI physical occupancy derives from labels rather than authoritative `section_assignments`.                         |
| FRONT-005 / FRONTEND               | Picker nested clicks can unintentionally open the map.                                                             |
| REAL-003 / REALTIME                | Visibility/online refresh lacks complete focus/channel reconnect reconciliation.                                   |
| FRONT-006 / FRONTEND               | Only slug route is explicitly revalidated.                                                                         |
| FRONT-007 / FRONTEND               | Dashboard/server metrics omit active unknown/unpositioned labels.                                                  |
| DATA-004 / FRONTEND                | Partial database query failures are logged and converted into plausible empty state.                               |
| REAL-004 / REALTIME                | No-session listener is organization-wide instead of location-specific.                                             |
| FRONT-008 / FRONTEND               | Dashboard recent activity represents only a subset of real events.                                                 |
| DEP-003 / DEPLOYMENT,DOCUMENTATION | Production URL and migration-deployment evidence conflict across main, repo metadata, and an unmerged docs branch. |

### P3 Low (2)

| ID / type                    | Finding                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| DATA-005 / DATA MODEL        | `section_assignments.released_at` is not used consistently; ordinary release deletes the row.     |
| DOC-001 / DOCUMENTATION,TEST | Comments/status counts are stale, including “Floor-only End” and 18/228 pgTAP versus repo 24/340. |

## Architectural, Consistency, and Security Risks

- **Architectural:** five views share state but encode different availability/action semantics; physical state is recalculated in the browser.
- **Data consistency:** session relationships are incomplete; a trigger protects current physical uniqueness but the UI ignores its rows; destructive deletes make event retention the only short-term reconstruction.
- **Security/RLS:** invoker RPCs plus direct table grants produce two mutation APIs; creator bypass and event mutability weaken authorization/audit.
- **Concurrency:** physical unique claims and recent position locking are strong, while undo selection and optimistic client mutations are not serialized.
- **Operational:** database/frontend release independence and unverifiable credentials make otherwise-correct code unsafe to ship.

## Technical Debt

- Stale generated Supabase types and untyped clients.
- Repeated string parsing for combined table labels.
- Incomplete error state propagation and event-to-activity projection.
- Demo-mode tests standing in for real integration tests.
- Historical documentation not reconciled into main.
- Absent project-context guard scripts and project-scoped read-only MCP setup.

## Version Upgrade Recommendations

1. **Restore trusted context and production parity first.** Re-authenticate exact accounts, add fail-closed context verification, reconcile migration evidence, and prevent independent frontend promotion.
2. **Fix database integrity and P0 authorization.** Enforce same-session relationships/validation, correct entry mutation policies without falsifying assignment attribution, add cross-actor tests, restore membership-only authorization, and implement `clear_cell` undo.
3. **Create one guarded mutation boundary.** Revoke direct authenticated writes where RPCs are the contract, make audit events system-written/immutable, use a reliable finalized-lock helper, serialize undo/redo, and verify exact ACLs.
4. **Publish a typed, explicit read model.** Regenerate types, type clients, return physical claims from `section_assignments`, surface query errors, add the needed index, and remove or formally maintain dead counters.
5. **Harden client consistency and Realtime.** Resync login props, make reducers total for sparse cells, serialize mutations, correct skipped-next/date behavior, and refetch on history/focus/reconnect/date rollover.
6. **Unify cross-view semantics.** Define combined-resource actions, counts, state labels, and activity consistently across Grid, Floor, Picker, Servers, and Dashboard.
7. **Gate release on real integration evidence.** Run two-user/two-context live-mode browser tests, comprehensive pgTAP authorization matrices, responsive projects, migration parity checks, candidate smoke, then promotion.

The implementation plan in `VERSION_UPGRADE_PART1_PLAN.md` turns these recommendations into approval-sized phases. **No implementation is authorized or started.**
