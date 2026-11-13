# V2-008 Batch B2–B4 — Planning kit (read-only, local)

Written for: the engineer or owner who will run, review or later extend the migration tooling. **Status: IMPLEMENTED LOCALLY, DRY-RUN ONLY. Nothing here can write to any database, and no executor exists.** Hosted DEV, Production and Neon were not touched.

Code: [scripts/migration-compat/](../../../../scripts/migration-compat/) · Tests: `scripts/migration-compat/*.test.ts` (Vitest, 124), [tests/local/migration-compat.local.test.ts](../../../../tests/local/migration-compat.local.test.ts) (real local stack, 6), [pgTAP 0081](../../../../supabase/tests/database/0081_b2_role_ladder_capability.test.sql) (18).

## 1. What it is

Three pure planners over plain-JSON snapshots, one loopback-only reader and one CLI.

| Planner              | File                | Question it answers                                                                                                                                 | Verdicts                                                               |
| -------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **B2** role backfill | `role-backfill.mjs` | For ONE organization: is there a _complete_ set of `location_memberships` rows that preserves every member's capability, and what exactly is it?    | `APPLY` (changeset) · `NOOP` · `SKIP` (exception report, no changeset) |
| **B3** module config | `module-config.mjs` | Given an owner manifest, which `location_module_configs` rows would be inserted/overridden, what is missing, is enforcement activatable afterwards? | `READY_FOR_OWNER_APPROVAL` · `NOOP` · `REPORT_ONLY` · `REFUSED`        |
| **B4** attendance    | `attendance.mjs`    | Current `attendance_mode` per location, identity-link validity (Supabase side only), source-transition conflicts, proposed owner-review manifest    | `READY_FOR_OWNER_APPROVAL` · `NOOP` · `REPORT_ONLY` · `REFUSED`        |

Support: `common.mjs` (ladder, keys, canonical hash), `capability-model.mjs` (model of the deployed `*_profile_level` functions, pinned to measurement), `snapshot.mjs` (reader), `cli.mjs`.

## 2. Guarantees (each is a test)

- **No write path.** Planners are pure. The reader only issues `GET`/`HEAD` through `guardedFetch`, which throws on any other method. A static test scans every source file for mutating verbs, SQL writes, `.rpc(`, database clients and `child_process`. The CLI answers `--execute/--apply/--write/--commit/--force` with exit 3.
- **Loopback only.** Any non-loopback URL is refused before a request is made, redirects are never followed (`redirect: "error"`, because the service key travels in a custom header) and a response from any other origin is refused. Reading Hosted DEV or Production needs its own authorization (D-1 / D-7) and a deliberate change to the guard. The service key is never printed.
- **Proven against the real schema.** The local integration test digests nine tables before and after every read/plan and requires an identical hash and GET/HEAD-only requests; a control test proves the digest does change when a row is written.
- **Deterministic and idempotent.** Same input → byte-identical output; input ordering is irrelevant; `plan(apply(plan))` is `NOOP`.
- **IDs only.** Output contains uuids, role names and counts; no names or emails. (`--include-names` exists only to feed the advisory harness hint of B3 and is off by default.)
- **Stale approvals cannot be replayed.** Every manifest is bound to a state hash of the snapshot it was written for; drift → refusal.

## 3. B2 — the contract it implements ([OWNER_DECISIONS_REQUIRED §4.5](OWNER_DECISIONS_REQUIRED.md))

`APPLY` is emitted only when **all** hold; otherwise `SKIP` with every reason and **no changeset** (a partial proposal is never produced).

1. Exactly one active location, or an owner-approved, state-bound manifest listing explicit person × location × role rows (D-2c). Never "all locations", never a primary location.
2. Every **active** member is _mapped_ (D-2 ladder or explicit manifest row), _already present_, or **owner-signed unassigned** (the plan prints the resulting loss of access). Anything else → `unmapped_member`.
3. Multiple legacy roles are never auto-mapped (D-2b): not the first, not the highest, not combined, not dropped → `multi_role_requires_explicit_mapping`. An owner-chosen role must not exceed the highest legacy role (`explicit_exceeds_ladder`); a lower one is a reduction that needs `acknowledgeReduction`.
4. Every existing row must equal the plan or be absent. A differing role, an **inactive** row (never reactivated), a row at an archived/inactive location, a row for an inactive or foreign profile, a duplicate, a row at a location outside the organization, or a cross-tenant location → refusal.
5. **Capability preservation is demonstrated before any assignment is proposed.** At one location the ladder adds no capability and removes none (pgTAP 0081, LAD-11…15): the only change is the owner's Schedule/Tasks/Tips level 4 → 3, the same capability band because no threshold in the product distinguishes them. Reductions block; expansions block unless acknowledged. At two or more locations capability is **not measured** and the owner must acknowledge (`acknowledgeUnmeasuredCapability`).
6. Every created manager/assistant row is listed with its E-1 consequence (`retained_by_single_location_exception` vs `none_organization_level_only`).
7. The fallback cliff is reported: `fallbackActiveToday`, rows of any status, and, for an already-half-migrated organization, the members who currently have **no** operational access (`organization_currently_partial` warning). Completing such an organization is allowed and loud; it is not a blocker.

The plan also carries `expectedAfter` (rows per location, zero unassigned, zero membership/Overall-role changes) and a seven-step `reconciliation` checklist for the future executor.

### What pgTAP 0081 measured (one location, one legacy role per member)

| Member        | before (fallback) | **partial** (only the owner has a row) | after (complete ladder) |
| ------------- | ----------------- | -------------------------------------- | ----------------------- |
| owner         | 4:4:4:4:4:4       | 4:4:4:3:3:3                            | 4:4:4:3:3:3             |
| general_mgr   | 3:3:3:3:3:3       | **3:3:3:3:0:0**                        | 3:3:3:3:3:3             |
| shift_manager | 2:2:2:2:2:2       | **2:2:2:0:0:0**                        | 2:2:2:2:2:2             |
| host / server | 1:1:1:1:1:1       | **1:1:1:0:0:0**                        | 1:1:1:1:1:1             |

(att:inv:pay:sch:tas:tip.) The partial column is the P0 fallback cliff: one row removes the fallback for everyone else, so Tasks/Tips drop to 0 even for the general manager. This is why a changeset is organization-atomic.

## 4. B3 — rules

Nine canonical keys (`table_allocation, tasks, schedule, tips, team, attendance, payroll, bar_inventory, recipes`) verified against the registry by a test; `settings` is system-required and rejected as a module. The owner manifest must decide **all nine for every active location**. Unknown keys and shorthand (`all`, `enableAll`) are rejected. An explicit existing row (the Monk's eight disabled modules) is **preserved**: a manifest that disagrees is `existing_setting_would_change` unless the module is listed in `overrideExisting`. Enabling every module everywhere needs `acknowledgeBlanketEnablement`; enabling modules on a harness-class location needs `acknowledgeHarnessEnablement`; archived locations get no rows. Real/harness classification is the **owner's** (D-4); a name-pattern hint is advisory and a mismatch is a warning. Enforcement readiness is an environment property: a selection can never claim it, and activation stays staged (D-8).

## 5. B4 — rules

`attendance_mode` values are the enum labels `external`, `internal_the_lineup`, `disabled`; `NULL` is unconfigured and is **never guessed**. The legacy Monk's pattern (Neon links, no native history) is reported as _evidence_ and a `suggestionOnly` hint. Configured internal and explicitly disabled locations are preserved; changing a configured mode needs the exact transition in the manifest plus `acknowledgeTransitionConflict`, with each conflict named (`native_history_would_be_orphaned`, `neon_links_would_double_count_with_native`, `explicitly_disabled_location_reactivated`, `open_native_sessions_would_be_stranded`, `external_mode_without_identity_links`). Identity links are checked against Supabase memberships only (positive id, member exists/active, no duplicate profile or Neon id, same Neon id in several organizations); an optional operator-supplied, read-only export of Neon ids is the only way to verify existence — Neon is never contacted. Link errors block an organization that is (or becomes) `external` and only warn elsewhere. A financial-consumption switch that is not OFF refuses the plan. No timesheet, attendance history, payroll or finance row is ever in scope. Mode changes would go only through the audited RPC `set_location_attendance_mode`, in a separately authorized step.

## 6. Running it

```text
# 1. snapshot (loopback stack only; the key comes from an environment variable, never an argument)
node scripts/migration-compat/cli.mjs snapshot role       --url http://127.0.0.1:54321 --organization <uuid> --out role.json
node scripts/migration-compat/cli.mjs snapshot modules    --url http://127.0.0.1:54321 --location <uuid> [--location <uuid>] [--environment] --out modules.json
node scripts/migration-compat/cli.mjs snapshot attendance --url http://127.0.0.1:54321 --organization <uuid> [--neon-export neon-ids.json] --out attendance.json

# 2. plan (add --manifest <file> once the owner has decided; --summary prints counts and codes only)
node scripts/migration-compat/cli.mjs plan role|modules|attendance --snapshot <file> [--manifest <file>] [--summary]
```

Key variable: `LOCAL_SUPABASE_SERVICE_KEY` (or `--key-env NAME`). Exit codes: `0` plan produced and nothing blocks it · `1` `SKIP`/`REFUSED` · `2` could not determine · `3` an execution flag was given.

Manifests carry `schema`, `status: "approved"`, `approvedBy` (an owner decision reference, not a name), `stateHash` (copied from the plan of the snapshot it was written against) and the explicit decisions. Schemas: `v2-008.org-snapshot/1`, `v2-008.role-manifest/1`, `v2-008.module-snapshot/1`, `v2-008.module-manifest/1`, `v2-008.attendance-snapshot/1`, `v2-008.attendance-manifest/1`; the exact keys are enforced (unknown keys are errors).

## 7. What is deliberately NOT here

- An executor of any kind. A future one is a separately authorized maintenance process (D-7) with: one transaction per organization, re-validate the state hash inside it, insert every row or none, run the completeness query, commit — and never `apply_location_assignment_changes` (per person, needs a real caller, reactivates rows).
- Any read of Hosted DEV or Production, any real manifest, any decision for D-1, D-3, D-4, D-5/5b, D-6, D-8, D-11.
- Capability measurement for organizations with two or more active locations (covered by the S1 evidence and an owner acknowledgement instead).
