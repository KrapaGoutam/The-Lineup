# V2-008 — Batch B2–B4 Next-Step Package (preparation only, written after B1)

Nothing here is implemented. It exists so the next session starts with the constraints already decided. Authority: [OWNER_DECISIONS_REQUIRED.md](OWNER_DECISIONS_REQUIRED.md) (D-numbers), [ROLE_MAPPING_PLAN.md](003-existing-role-migration/ROLE_MAPPING_PLAN.md), [MAPPING_PLAN.md](002-organization-location-backfill/MAPPING_PLAN.md), [BATCH_B_C_DEPENDENCIES.md](BATCH_B_C_DEPENDENCIES.md). Deployed schema wins over any historical SQL (`location_memberships`, never `location_assignments`).

## Gate status after B1

| Batch                                 | Can start?                            | Blocked by                                                                                                                    |
| ------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| B2 manifest validator + backfill kit  | Validator/dry-run only, parameterized | **D-2, D-2b, D-2c** for any real rule or manifest; **D-9** (remainder) for the broader scope                                  |
| B3 module-configuration tooling       | Read-only report only                 | Owner decisions on location classification, module enablement, existing explicit rows, harness disposition (D-3/D-4/D-5/D-5b) |
| B4 attendance compatibility           | Read-only review only                 | **D-6** for any write; Production link evidence (**D-1**) before touching Webster                                             |
| Hosted DEV (B1 migration or any data) | No                                    | **D-7** (explicit, per step, with the exact manifest)                                                                         |

B1's migration (`20261112200000_kiosk_manager_authority_hardening.sql`) exists **only locally**. Hosted DEV is still at ledger 88.

## B2 — Manifest validator and backfill tooling

Hard rules (each one is a test the tool must carry):

1. **Atomic per organization.** One transaction per org that inserts every required `location_memberships` row or none. A partial organization is the P0 fallback cliff: the first row disables the DB legacy fallback for every unassigned member while the TypeScript resolver has no fallback at all. The validator must refuse any manifest that would leave an org with some members assigned and others not (unless the unassigned are explicitly inactive).
2. **Order:** backfill complete and reconciled **before** the V2 app release reaches that organization.
3. **No guessed multi-role mapping.** `roles[]` with more than one element requires an explicit owner-chosen role per person (D-2b); never "the first element", never the maximum silently.
4. **No guessed multi-location assignment.** An org with more than one active location needs an explicit person × location × role list (D-2c); no "all locations" default.
5. **No privilege escalation.** Approved ladder only (D-2): owner/general_manager → `manager`, shift_manager → `assistant_manager`, host/server → `staff`. Remember E-1: any `manager`/`assistant_manager` row grants org-wide Recipes management and Inventory org-manager today, so every proposed manager/assistant row is a privilege grant that the dry-run must list explicitly with its effective-capability delta.
6. **Idempotent reconciliation.** Re-running yields zero changes; existing rows are never downgraded, never reactivated if an owner deactivated them, never overwritten.
7. **Dry-run first.** Output a reviewable manifest (ids only, no PII), counts per org, and the capability delta; **explicit approval before any Hosted DEV write (D-7)**.
8. Use the audited RPC `apply_location_assignment_changes` where it fits; no direct inserts that bypass audit.

Open dependency inherited from B1: **E-1 privilege spill** is independent of kiosks and is not fixed. Remediation (restrict the org-level Recipes/Inventory predicates to org roles, or scope them to the location) must be decided before any manager row is mass-created.

## B3 — Module configuration

- Never blanket-enable. Missing row = not usable; backend enforcement activation stays `STAGED` (D-8).
- Preserve existing explicit rows (Monks DEV 8 of 9 disabled, D-5). A tool may report them; it may not change them.
- Classification of each real active location (real vs harness vs retired) and its nine-module matrix come from the owner (D-3, D-4, D-5, D-5b). 42 of 44 active DEV locations are harness fixtures.
- Deliverable at this stage: a read-only readiness/diff report built on `private.module_enforcement_readiness()`.

## B4 — Attendance compatibility

- Preserve all three modes: `EXTERNAL`, `INTERNAL_THE_LINEUP`, `DISABLED`. `NULL` already behaves as external-compatible for reads and fails closed for native clocking.
- Do **not** force `EXTERNAL` onto locations that already use internal attendance; no silent internal → external conversion.
- No Neon writes. No native financial consumption activation (finance stays OFF).
- A write (e.g. Webster → `external`) needs D-6 and Production link evidence (D-1); only through the audited RPC.

## Later gate (not part of B1–B4): Hosted DEV

A separately authorized Batch C must contain, in order: backup/recovery preflight → isolated populated-data rehearsal → Hosted DEV migration push (including the B1 migration) → **actual** authorization probes with real JWTs (the 0078 matrix and `tests/local/kiosk-authority.local.test.ts` against DEV with synthetic users, then cleanup) → post-migration reconciliation. B1's local approval does not cover any of these.

## Recommended next step

B1 closes D7 and F-1 locally. The next decision for the owner is **not** engineering: approve D-2/D-2b/D-2c (role ladder and the two multi-value rules) and decide the E-1 remediation path. Until then B2 can only deliver the parameterized validator.
