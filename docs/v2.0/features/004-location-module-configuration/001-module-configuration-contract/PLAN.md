# V2-004.001 — Module Configuration Contract: Plan and Design

GitHub: Subfeature [#298](https://github.com/KrapaGoutam/The-Lineup/issues/298) · Parent [#252](https://github.com/KrapaGoutam/The-Lineup/issues/252) · Program [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248) · Milestone [#8](https://github.com/KrapaGoutam/The-Lineup/milestone/8)

Branch `feature/v2.0-004.001-module-configuration-contract` from `origin/development` `fcc661df96b5af1c01ebb8f2f00ff42078e02979` (`main` `5e5b7747693b6e81014eafdf299b87e56c3f033d`, unchanged). Environment: Claude Code Cloud.

Companion files: [TEST_MATRIX.md](TEST_MATRIX.md) · [EVIDENCE.md](EVIDENCE.md) · [STATUS.md](STATUS.md)

---

## 1. Outcome and non-goals

**Outcome.** A durable data contract that lets every physical location enable or disable application modules independently — even two locations of one organization — plus the TypeScript vocabulary every later phase will share. Examples of intent (NOT stored settings): a restaurant may use Table Allocation, Tasks, Recipes, Bar Inventory, Tips and Payroll; a liquor store may use Bar Inventory, Tasks, Team and Payroll.

**This phase changes no behaviour.** No existing table, policy, trigger or function is modified; the migration inserts no rows; nothing reads the new table. Demo mode never touches it.

**Non-goals (not implemented, not started):** V2-004.002 settings UI · V2-004.003 navigation hiding · V2-004.004 backend enforcement · V2-005 operational location scoping · V2-008.004 backfill · attendance mode (V2-006) · Production/`main`.

## 2. Decisions taken before implementation

| #   | Decision                                                                                                                                                                    | Why                                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Module identifiers are a Postgres **enum** `public.location_module_key`; labels and tab ids live only in the TypeScript registry.                                           | Invalid keys are rejected by the database itself; the generated enum union gives compile-time exhaustiveness; renaming a label can never need a data migration.                                        |
| D2  | `settings` is **system-required**: it has no enum value, so no row can ever exist for it.                                                                                   | A location must not be able to disable everything and lock its administrators out (§5).                                                                                                                |
| D3  | **No `organization_id` column.** Ownership is `location_id → locations.id`; the organization is derived.                                                                    | `locations.organization_id` is already immutable (V2-002.002), so organization ownership cannot drift. Duplicating it would create a consistency risk for no benefit.                                  |
| D4  | Natural **primary key `(location_id, module_key)`**, `ON DELETE RESTRICT`, no surrogate id.                                                                                 | Uniqueness per location is the identity. Restrict means deleting a location can never silently erase its configuration.                                                                                |
| D5  | `is_enabled boolean NOT NULL` with **no default**.                                                                                                                          | Every row is an explicit decision; "I forgot to say" can never become "enabled".                                                                                                                       |
| D6  | **Write authority = the existing location-administration authority** (`private.can_manage_location_lifecycle`).                                                             | No second hierarchy. Overall Owner/Manager, or active Org Owner/General Manager of the owning organization. Wrapped in `private.can_manage_location_module_configs` as the single seam for V2-004.002. |
| D7  | **Read authority is narrower than "org member"**: manage authority, any Overall role, or an active assignment at that location backed by an active organization membership. | Matches the V2 access model ("belonging to the organization does not grant other locations"). More restrictive than `locations` (which any org member can read).                                       |
| D8  | No client **DELETE**. Disable with `is_enabled = false`.                                                                                                                    | A delete would silently convert an explicit decision back to "not configured".                                                                                                                         |
| D9  | Writes are **rejected at ARCHIVED locations**, allowed at ACTIVE and INACTIVE ones.                                                                                         | Configuration is preparation, not operational activity (consistent with V2-002.005), but an archived location is retired until restored.                                                               |
| D10 | One validated **`metadata` envelope** instead of an open blob (§7).                                                                                                         | Evolvable without becoming an authorization channel.                                                                                                                                                   |
| D11 | No guessed defaults, no backfill, no trigger on `provision_location`.                                                                                                       | Backfill is owned by V2-008.004 (§6).                                                                                                                                                                  |

### 2.1 Reconciliation with the earlier V2 planning sketches

`DATA_MODEL.md §2.4` and `MIGRATION_STRATEGY.md §2.3` predate this phase and sketched a different table (stored `organization_id`, free-text key, `is_enabled default true`, `ON DELETE CASCADE`, open `settings` object) and a blanket "all modules enabled" seed using legacy key names. The requirements for this phase supersede them on purpose — a stored organization can drift, a default-true flag lets forgetfulness enable modules, a cascade can erase configuration with a location, and a guessed blanket seed contradicts "do not mass-insert guessed feature flags". Both documents were updated in this PR to describe the implemented contract and the V2-008.004 hand-off.

## 3. Canonical module registry

Source of truth: `src/features/modules/domain/module-registry.ts`.

| Label            | Database key (`module_key`) | Client `AppTab` | Requirement     | Configurable per location | Scope          | Organization-level dependency |
| ---------------- | --------------------------- | --------------- | --------------- | :-----------------------: | -------------- | ----------------------------- |
| Table Allocation | `table_allocation`          | `allocation`    | optional        |            yes            | `location`     | —                             |
| Tasks            | `tasks`                     | `tasks`         | optional        |            yes            | `location`     | —                             |
| Schedule         | `schedule`                  | `schedule`      | optional        |            yes            | `location`     | —                             |
| Tip Split        | `tips`                      | `tips`          | optional        |            yes            | `location`     | —                             |
| Team             | `team`                      | `team`          | optional        |            yes            | `hybrid`       | `memberships`                 |
| Attendance       | `attendance`                | `attendance`    | optional        |            yes            | `hybrid`       | `attendance_identity_links`   |
| Payroll          | `payroll`                   | `payroll`       | optional        |            yes            | `hybrid`       | `payroll_settings`            |
| Bar Inventory    | `bar_inventory`             | `barInventory`  | optional        |            yes            | `hybrid`       | `inventory_catalog`           |
| Recipes          | `recipes`                   | `recipes`       | optional        |            yes            | `organization` | `recipe_book`                 |
| Settings         | _(none — never stored)_     | `settings`      | system-required |            no             | `hybrid`       | —                             |

Notes:

- The three identities are deliberately separate. `barInventory` (UI id) ≠ `bar_inventory` (durable key); the label "Tip Split" maps to key `tips`. Scopes mirror [MODULE_SCOPE_MATRIX.md](../../../MODULE_SCOPE_MATRIX.md).
- **Organization-level dependencies are data, not toggles.** Disabling Bar Inventory at one location does not touch the organization's catalog; it only governs that location's use of the module. Recipes is organization-scoped data: enabling or disabling it per location controls whether the location _exposes_ the organization recipe book, never its content.
- **Guarantees by construction:** `ConfigurableModuleKey` _is_ the generated database enum, and `AssertEveryAppTabIsRegistered` fails `tsc` if an `AppTab` has no module — verified by deliberately breaking each (EVIDENCE.md §3). Duplicate labels/tabs/orders are unit-tested. Order is an explicit `sortOrder`, so lists are deterministic.
- Current role gating (`isManager` for Team and Bar Inventory, `!demoMode` for Payroll) is **orthogonal** to enablement and unchanged: a module is usable only when it is enabled **and** the caller's role allows it.

## 4. Schema

```text
public.location_module_configs
  location_id  uuid        NOT NULL  → public.locations(id)  ON DELETE RESTRICT
  module_key   public.location_module_key  NOT NULL
  is_enabled   boolean     NOT NULL  (no default)
  metadata     jsonb       NOT NULL  DEFAULT '{}'  CHECK private.location_module_metadata_valid
  created_at   timestamptz NOT NULL  DEFAULT now()
  updated_at   timestamptz NOT NULL  DEFAULT now()
  updated_by   uuid        NULL      (server-stamped from auth.uid(); no FK)
  PRIMARY KEY (location_id, module_key)
```

- **Migration:** `supabase/migrations/20261105210000_location_module_configs.sql` (next timestamp after head `20261104164217_location_schedule_publication_guard`). Additive, idempotent where cheap (`if not exists`, `drop … if exists` for own objects), forward-only.
- **Objects created:** enum `public.location_module_key`; table `public.location_module_configs`; functions `private.location_module_metadata_valid`, `private.can_manage_location_module_configs`, `private.can_read_location_module_configs`, `private.location_module_configs_guard_row`, `…_lifecycle_guard`, `…_forbid_delete`; three triggers; three RLS policies.
- **Indexes:** the primary key `(location_id, module_key)` serves every access path (per-location read, per-location+module lookup, RLS subselects). No secondary index until a cross-location query exists.
- **`updated_by`** is a plain `uuid`, not a foreign key, like `location_lifecycle_events.actor_profile_id`: deleting an account must never block or erase audit pointers. A full change history is **not** included — it belongs with the first writer (V2-004.002), which can add an append-only event table following the V2-002.005 pattern. Justification for the minimal metadata kept now: last-writer + two timestamps cost nothing and are server-stamped (unforgeable).
- **Triggers:** `guard_row` (invoker) freezes `location_id`, `module_key`, `created_at` and stamps audit columns for client roles; `lifecycle_guard` (definer, `FOR SHARE` on the location, serialized with the lifecycle transition) rejects writes at archived locations; `forbid_delete` rejects client-role deletes as a third layer behind the missing privilege and the missing policy.

## 5. System-required modules and the recovery rule

**Rule.** Settings is `system_required`. It cannot be stored, therefore cannot be disabled, and `resolveModuleState` returns `system_required` for it **regardless of any read failure** (a database outage must not lock administrators out). Settings is where organization/location administration, staff-assignment management and (from V2-004.002) module settings live; a location with every optional module disabled still has them.

Platform plumbing — sign-in, sign-out, passcode change by the signed-in person, organization/location context switching — is **not a module** and must never be gated by this registry.

**Account recovery.** Passcode _reset_ currently lives inside the Team tab, which is optional (owner's own examples disable it at some locations). Disabling Team at a location must therefore not remove the ability of authorized administrators to reset a passcode. The registry records this as `hostsAccountRecovery: true` on `team`, and this plan makes it a **binding constraint on V2-004.003/.004**: the passcode-reset capability stays governed by role authority alone, and the UI must keep a recovery path reachable when Team is disabled (for example from Settings → staff). No new permission is introduced here.

## 6. Semantics, defaults and staged rollout

### 6.1 What a consumer can distinguish

| State                  | Meaning                                                                                                                           | Usable? |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- | :-----: |
| `enabled`              | Row exists, `is_enabled = true`                                                                                                   |   yes   |
| `disabled`             | Row exists, `is_enabled = false` (explicit decision)                                                                              |   no    |
| `missing`              | Location readable, **no row**: "not configured". **Never equals enabled.**                                                        |   no    |
| `system_required`      | Settings (and any future system module)                                                                                           |   yes   |
| `location_unavailable` | Location not found / not visible to the caller (not distinguished: no tenant enumeration), or not ACTIVE (`inactive`, `archived`) |   no    |
| `unauthorized`         | No session, or the database refused the read                                                                                      |   no    |
| `unavailable`          | Table missing in this environment (`schema_missing`) or database/transport failure (`database_error`)                             |   no    |
| `error`                | Data this build cannot trust (`invalid_row`) or an unexpected failure                                                             |   no    |

`readLocationModuleConfigs` **never throws and never turns a failure into an empty successful configuration** (the existing location readers return `[]`/`null` on error, which would read as "nothing configured" — deliberately not copied). One malformed row fails the whole read. Unknown module keys from a newer database are ignored.

**Known limit (documented, not hidden).** Row Level Security cannot distinguish "the location has no rows" from "there are rows you may not read". A signed-in organization member who is not assigned to the location sees zero rows, which the reader reports as `ok` with every module `missing`. This is **fail-closed** (missing is never usable), so it cannot widen access, but it cannot say "unauthorized". Consumers must obtain location authorization from the active-context resolver first. If a distinct signal is needed (for example, UI copy in V2-004.002), the minimal fix is a narrow read-only RPC returning the status; it is intentionally not built now (see §12 Q2).

### 6.2 Staged rollout contract

1. **V2-004.001 (this phase):** schema + types. No consumer. Existing Monks features are untouched because nothing reads configuration.
2. **V2-004.002:** authorized management UI/actions (first writer; adds change history if wanted).
3. **V2-004.003:** navigation consumes `resolveModuleState`; **demo mode must bypass the table**.
4. **V2-004.004:** backend enforcement. Server actions/RPCs fail closed on anything but `enabled`/`system_required`.
5. **V2-008.004:** reconciles legacy locations by inserting explicit rows from the owner-approved per-location module list.

**Sequencing adjustment (called out, not implemented).** Because `missing` is not usable, activating V2-004.004 in any environment with live locations before they have explicit rows would disable those locations' modules. Therefore: **V2-004.004 must not be activated in an environment until every ACTIVE location there has explicit rows** — in hosted DEV via V2-004.002's UI or a one-off owner-approved seed, in Production via V2-008.004. The enforcement PR should ship an explicit "all active locations reconciled" check/guard so this cannot be forgotten. No mass-insert of guessed flags is done here.

**New locations.** `provision_location` is unchanged, so a new location has _no_ rows (everything `missing` → not usable except Settings). Provisioning defaults are a product decision owned by V2-004.002 (open question Q1); the registry is the place to hang them.

## 7. Metadata and extension strategy

Distinctions the contract keeps:

| Concept                             | Where                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------- |
| Enabled state                       | `is_enabled` column — the only thing that enables a module                  |
| Informational metadata              | `metadata.note` (≤ 280 chars) and `metadata.schemaVersion` (=1)             |
| Future module-specific settings     | `metadata.settings` — **reserved, must be `{}` today**                      |
| Permissions / org / location access | **Never here.** `memberships`, `location_memberships`, `overall_roles` only |

`private.location_module_metadata_valid(module_key, metadata)` (a `CHECK`) accepts only an object ≤ 2048 bytes whose keys are a subset of `schemaVersion | note | settings`. Roles, tokens, permissions or any other key are rejected. The function takes `module_key` so a later migration can `create or replace` it to admit **typed, per-module** settings (validated in SQL and mirrored by a typed parser in TypeScript) without a table change. `parseModuleMetadata` mirrors the SQL rules and is used when mapping rows; a row that fails it is never trusted.

Adding a module: `alter type public.location_module_key add value '<key>'` in a migration → `tsc` fails until the registry entry is added (compile-time reminder) → the enum/registry equality unit test and pgTAP `MC-001b` update.

## 8. Role and RLS matrix

`W` write (insert/update), `R` read, `–` no access. Locations: **A** = assigned location, **A′** = another location of the same organization, **X** = another organization.

| Actor                                                          |  A  | A′  |  X  |
| -------------------------------------------------------------- | :-: | :-: | :-: |
| Anonymous                                                      |  –  |  –  |  –  |
| Overall Owner / Overall Manager                                | R W | R W | R W |
| Overall Assistant Manager                                      |  R  |  R  |  R  |
| Org Owner / Org General Manager (active)                       | R W | R W |  –  |
| Org shift manager / host / server **assigned** to the location |  R  |  –  |  –  |
| Location manager / assistant manager / staff (assigned)        |  R  |  –  |  –  |
| Org member **not** assigned to the location                    |  –  |  –  |  –  |
| Revoked / inactive organization membership                     |  –  |  –  |  –  |
| Active location assignment **without** active org membership   |  –  |  –  |  –  |

Delete: nobody (client). Archived location: reads only. Service role: unchanged platform behaviour (bypasses RLS; never reachable from the browser; no new RPC or key exposure).

Authority is resolved only from `locations → organization_id`, `memberships.active`, `location_memberships.active` and `overall_roles` — never from `metadata`, request input or a client-supplied organization id. No `SECURITY DEFINER` function takes an actor parameter; both helpers read `auth.uid()` with `search_path = ''`. No RPC is added.

## 9. TypeScript contract

| File                                                | Responsibility                                                                                                                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/modules/domain/module-registry.ts`    | Registry, key types derived from the generated enum, tab mapping, compile-time exhaustiveness                                                                       |
| `src/features/modules/domain/module-config.ts`      | Config record, metadata parser, read result, per-module `ModuleState`, `resolveModuleState`, `isModuleUsable`, `listModuleStates`, `listMissingConfigurableModules` |
| `src/features/modules/data/module-config-reader.ts` | Server reader `readLocationModuleConfigs(locationId, client?)` returning the result union                                                                           |
| `src/types/database.generated.ts`                   | Adds the table and the enum (see EVIDENCE.md §4 for how)                                                                                                            |

No `any`, no unchecked casts of database values, one registry. Pure domain files import no data layer (asserted by a test).

## 10. Lifecycle considerations

- Locations cannot be hard-deleted by clients (V2-002.005) and the FK is `RESTRICT`; rows survive deactivation and archive.
- Inactive location: configuration may be prepared; operationally `resolveModuleState` reports `location_unavailable/inactive`.
- Archived location: writes rejected (`55000`), reads allowed; restoring (`restore_archive` → inactive) re-enables edits.
- Reactivation does not alter configuration.
- Privileged maintenance (postgres/service_role) can still delete a row — needed by V2-008 reconciliation and test teardown; the real-JWT test removes its rows first.

## 11. Migration safety and recovery

- Additive only: one enum, one table, six functions, three triggers, three policies. No `ALTER` of existing objects; no `UPDATE`/`INSERT` of existing data; no change to PINs, memberships, assignments, attendance, payroll or inventory. Verified by `MC-013`/`MC-014` and by 370 pre-existing V2 pgTAP assertions still passing.
- Forward-only per project policy. Recovery if ever required before any consumer exists: `drop table public.location_module_configs; drop type public.location_module_key;` plus the six functions — safe because nothing references them (`MC-013b/c`, `MC-014a-c`). After V2-004.002 data exists this stops being a free rollback; take a snapshot first.
- Hosted DEV application belongs to the later authorized validation stage; Cloud never ran `supabase db push`, never linked a project, and never contacted Production.

## 12. Open questions for the owner

- **Q1 Provisioning defaults.** What should a brand-new location start with — everything enabled, or nothing until configured? (Today: nothing, i.e. all `missing`.) Decide in V2-004.002.
- **Q2 Unauthorized vs missing.** Is the documented fail-closed ambiguity (§6.1) acceptable, or should V2-004.002 add a narrow status RPC?
- **Q3 Recovery path.** Confirm passcode reset may be exposed outside the Team tab (Settings) when Team is disabled at a location (§5).
- **Q4 Write authority.** Org Owner/GM only (this plan, identical to location administration). Should location managers ever toggle their own location's modules? Not granted; changing it is a one-line change to `can_manage_location_module_configs`.

## 13. What this does not fix (do not claim otherwise)

Module configuration rows do **not** resolve the known V2-003 residuals: Schedule, Tips, Table Allocation and Bar Inventory location-binding gaps; the reminder prompt context gap; direct-PostgREST cross-location RLS; the pre-existing cross-tab sign-out race. Those remain V2-005 / tracked work and **Production release stays blocked** until V2-005, V2-008 and V2-009 complete.

## 14. Codex / Local build prompt (validation stage)

Validate PR HEAD against the authorized hosted DEV database only; do not expand scope. Steps are in [EVIDENCE.md §5](EVIDENCE.md). Required gate: `npm run check`, `npm test`, `npx next build --webpack`, `supabase test db`, hosted DEV migration + `tests/real/module-config.db.real.test.ts`, `supabase gen types typescript --local` diff review.
