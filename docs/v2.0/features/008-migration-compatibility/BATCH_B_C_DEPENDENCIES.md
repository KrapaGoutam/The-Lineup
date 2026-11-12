# V2-008 — Batch B / Batch C Dependencies (V2-008.004 – .007 and D7)

Status: **PLAN ONLY.** Nothing here is authorized for execution. Evidence: [INVENTORY.md](001-existing-data-inventory/INVENTORY.md), [MAPPING_PLAN.md](002-organization-location-backfill/MAPPING_PLAN.md), [ROLE_MAPPING_PLAN.md](003-existing-role-migration/ROLE_MAPPING_PLAN.md), [D7 plan](D7_LOCATION_SCOPED_KIOSK_PLAN.md), [OWNER_DECISIONS_REQUIRED.md](OWNER_DECISIONS_REQUIRED.md).

## 1. Delivery vehicle (agent recommendation, not an owner decision)

- **No environment-specific data in `supabase/migrations/`.** Organization/location/profile ids differ between DEV and Production and migration files run on every database (local, CI, DEV, Production).
- Backfill logic ships as **tested tooling** that is driven by an **owner-approved manifest per environment** and produces a **receipt**: a pure manifest validator (Vitest), a guarded maintenance function/script, and pgTAP proving idempotency, atomicity and the invariants. A migration may carry only inert, environment-neutral helpers (e.g. the D7 listing RPC).
- Consequence: the data steps do **not** advance the migration ledger; D7's RPC (if approved at Batch B) is the only expected schema change (DEV ledger 88 → 89).
- Production **execution** of any data step belongs to V2-009 with explicit owner sign-off (`MIGRATION_STRATEGY.md` invariant 2). A Production **read-only preflight** (ids, counts, null-location counts, member roles) needs its own explicit authorization and can be done earlier.

## 2. V2-008.004 — Module configuration backfill

Verified facts: canonical nine keys match the enum; `settings` is not a row; readiness function exists; row guard lets privileged maintenance sessions supply `created_at`; rows are append-only (delete forbidden for clients); archived locations are frozen.

| Location class                            | DEV today                                             | Rule                                                                                                                                                                                   | Needs owner input                        |
| ----------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| The Monk's DEV "DEV Location"             | 9 rows: `bar_inventory` on, 8 off (owner, 2026-11-11) | **Preserve.** Never overwrite (`on conflict do nothing`).                                                                                                                              | D-5: are the 8 "off" values intentional? |
| Manual Preview "DEV Bar & Lounge"         | 0 rows                                                | No rows until D-3.                                                                                                                                                                     | D-3                                      |
| Harness active locations (42)             | 0 rows                                                | Not configured by default. Prefer **archive** (reversible via `restore_archive`) so they leave the readiness set; seeding rows onto fixtures only if the owner wants them kept active. | D-4                                      |
| V2-007 acceptance locations (5, archived) | 1 row each, enabled                                   | Untouched; archived → excluded from readiness.                                                                                                                                         | none                                     |
| Production Webster (+ any other active)   | **UNVERIFIED** (strategy says 0 rows)                 | Owner supplies a per-module Enabled/Disabled list; one row per module (9) per location; no blanket default.                                                                            | D-1, D-5b                                |

Decision matrix to present at Batch B (one row per real active location):

| Location                           | table_allocation | tasks | schedule | tips | team | attendance | payroll | bar_inventory | recipes |
| ---------------------------------- | ---------------- | ----- | -------- | ---- | ---- | ---------- | ------- | ------------- | ------- |
| (owner fills; no value is assumed) | ?                | ?     | ?        | ?    | ?    | ?          | ?       | ?             | ?       |

Gates: readiness 100% for every **active** location before any enforcement activation (DB refuses otherwise, V2-D021); activation itself is **out of V2-008** unless the owner separately authorizes (D-8). Backend enforcement stays `staged`.

Validation: pgTAP (insert-only, idempotent, no overwrite of explicit rows, archived skipped, readiness transitions as expected); Vitest manifest validator (nine keys, no `settings`, no unknown key, location active, org match); hosted DEV readiness report (read-only) before/after.

## 3. V2-008.005 — Attendance compatibility

Verified: `NULL` = unconfigured → external-compatible reads, native clocking **fails closed**; `external` preserves the Neon path; `internal_the_lineup` is native; kiosk refuses `external`/`disabled` (V2-D016). DEV: 44 active `NULL`; `attendance_identity_links` = 0 (no Neon link evidence in DEV).

Rules:

- **Do not run** the historical blanket `set attendance_mode='external'`. `NULL` already behaves as external for reads; writing `external` to fixtures adds nothing and removes the "unconfigured" signal.
- Explicit `external` is justified only for a location where **verified historical behavior** is Neon-based (expected: Production Webster) and the owner approves (D-6). Evidence to collect read-only first: Production `attendance_identity_links` count for the org, whether the Neon path is live for that org.
- Setting the mode must go through `public.set_location_attendance_mode(p_location_id, p_mode, p_expected_updated_at, p_reason)` (audited, optimistic-concurrency). Batch B must confirm whether the RPC accepts a maintenance session; if not, the only acceptable alternative is a guarded one-off that writes the same audit event. Neither is run in Batch A.
- Never convert `internal_the_lineup` locations to `external`; the five V2-007 acceptance locations are archived and untouched.
- No Neon write, no `attendance_identity_links` write, financial consumption stays **disabled** (`attendance_financial_activation.enabled = false`; TS policy gate still `not_approved`).

## 4. V2-008.006 — Hosted DEV migration validation (future sequence)

DEV is already at ledger 88, so the schema part is a no-op unless D7's RPC migration is added. The V2-008 DEV run is therefore mostly **data-tooling proof**:

1. **Fresh baseline** (read-only): ledger, enforcement `staged`, finance off, Overall 0, per-table counts, location/membership/config snapshot (hashes of counts, no names).
2. **Dependency review**: migration list vs `development`; any new migration touching the same functions.
3. **Restore or isolated rehearsal**: restore a backup/branch copy or a local stack seeded to mirror the Production shape (single active location, mixed roles, **non-empty Schedule/Tips/Payroll** — DEV has none, so a synthetic or restored-copy rehearsal is mandatory for those domains). Reuse the established backup/rehearsal recipes from V2-005/V2-006/V2-007.
4. **Forward-only application** of the tooling against the rehearsal copy, then (only with approval) Hosted DEV for the manifest the owner approves. Real DEV members are already mapped, so the DEV run is expected to be a **no-op for Monks** and proves idempotency.
5. **Focused pgTAP / authorization checks** (not the full suite): the ROLE_MAPPING §7 list and the D7 matrix.
6. **Post-migration reconciliation**: INVENTORY counts unchanged except the approved delta; zero cross-tenant mismatch; readiness report; enforcement `staged`; finance off; Overall 0.
7. **Explicit owner approval before any Hosted DEV write** (D-7). Production is not touched.

## 5. V2-008.007 — Recovery / forward-fix

- **Assumptions:** Hosted DEV is a rehearsal sandbox; Production is recoverable only by backup + forward fix. No destructive reset, no `db reset`, no table truncation, no deletion of audit/lifecycle/financial rows.
- **Idempotency requirements:** every step is `insert … on conflict do nothing` keyed by natural unique keys; re-running after success is a no-op with an identical receipt; manifests carry ids and expected pre-state.
- **Partial failure:** each org is one transaction (all-or-nothing) because of the H-1 cliff; a failure rolls that org back to the exact pre-state; other orgs are independent. Never leave an org with some rows.
- **Conflict detection:** pre-state mismatch (existing differing/inactive row, multi-location, ambiguous array) aborts the org and reports; no overwrite.
- **Forward-fix, not rollback:** to correct a wrong row, add a reviewed manifest that deactivates/changes it via the audited assignment RPC path — never raw `delete`. Wrong module rows are corrected through the Settings editor/RPC (audited), not by deleting.
- **Preservation:** audit events, lifecycle events, attendance history, payroll/finance rows, kiosk device history are never rewritten.
- **Receipts:** each run writes counts + role histogram + readiness before/after (no names) to the feature folder.

## 6. Implementation order and approval boundaries

| Step | Batch  | Work                                                                                             | Needs before start                   | Writes                                     |
| ---- | ------ | ------------------------------------------------------------------------------------------------ | ------------------------------------ | ------------------------------------------ |
| B1   | B      | D7 location-scoped Kiosks (RPC + action + UI + tests) — see D7 plan                              | Owner approval of Batch B scope; D-9 | Local only (+1 additive migration locally) |
| B2   | B      | Manifest schema + validator + backfill tooling + pgTAP/Vitest (V2-008.002/.003)                  | D-2 (ladder), D-2b, D-2c             | Local only                                 |
| B3   | B      | Module-config reconciliation tooling + readiness report (V2-008.004)                             | D-5 (and D-3/D-4 for scope)          | Local only                                 |
| B4   | B      | Attendance-mode tooling review (V2-008.005): confirm RPC maintenance path; no data change        | D-6                                  | Local only                                 |
| C1   | C      | Fresh baseline + backup + rehearsal (V2-008.006)                                                 | **D-7 owner authorization**          | Rehearsal copy only                        |
| C2   | C      | Hosted DEV application of approved manifests + D7 migration push (if any)                        | **D-7** and exact-head CI            | Hosted DEV (approved scope only)           |
| C3   | C      | Reconciliation, focused pgTAP, D7 real-JWT hosted check, recovery runbook finalized (V2-008.007) | C2                                   | None (read-only + synthetic cleanup rules) |
| C4   | C      | Independent review → exact-head CI → owner approval → **one** merge to `development`             | all                                  | Git only                                   |
| —    | V2-009 | Production read-only preflight → Production migrations + data steps → release gate               | separate owner sign-off              | Production                                 |

Approval boundaries (never implied by a batch assignment): Hosted DEV writes · enforcement activation (D-8) · any attendance-mode write · any module-config write · Production anything · merge.

## 6b. Interactions to keep in mind

- Fixing D-4 by archiving fixtures changes `locations` lifecycle rows (retained history, reversible) — it is a data decision, not part of the role backfill.
- Enforcement activation also needs `private.module_enforcement_readiness()` clean **after** D-3/D-4, otherwise the DB guard refuses.
- The D7 UI must not rely on `isManager` (`user.role !== "server"`, `restaurant-operations-app.tsx:1108`); a location-only `manager` whose org role is `server` would be hidden by it.
