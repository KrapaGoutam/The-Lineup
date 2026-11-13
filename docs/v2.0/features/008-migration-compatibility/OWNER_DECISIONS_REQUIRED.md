# V2-008 — Decision Register (approved vs. owner input required)

Prepared in Batch A (2026-11-12). No decision was invented. Questions that repository or Hosted DEV evidence could answer were answered in the plans instead of being asked.

## 1. Already approved (do not re-ask)

| Ref | Decision                                                                                                                                                                                                                                  | Source                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| A-1 | **D7**: a location-only manager may manage kiosk devices for locations where they hold an active `manager` assignment, without general Location Administration.                                                                           | Owner, via #255 closeout → #256                                           |
| A-2 | V2.0 tenant/role architecture (V2-D001…D022), incl. the V2-D019 tier ladder and highest-applicable-capability resolver.                                                                                                                   | `DECISIONS.md`                                                            |
| A-3 | External (Neon) Attendance is preserved where explicitly configured; no forced `EXTERNAL` on every location; no silent internal→external conversion.                                                                                      | V2-D011/D017; task brief                                                  |
| A-4 | No unauthorized financial activation: finance stays OFF; native Payroll consumption stays disabled.                                                                                                                                       | Standing owner constraint                                                 |
| A-5 | No Production changes in V2-008 Batch A (and none without separate sign-off thereafter).                                                                                                                                                  | Standing owner constraint; `MIGRATION_STRATEGY.md`                        |
| A-6 | Kiosk device location is attributed by trusted in-app pairing (no GPS/IP/Wi-Fi).                                                                                                                                                          | V2-D013/D014/D015                                                         |
| A-7 | T5 stale-cookie replay accepted as an exception; physical-tablet acceptance owned by V2-009.                                                                                                                                              | #255 closeout                                                             |
| A-8 | **U-1 policy (S1):** revocation is terminal for a kiosk device row; ordinary reassignment never reverses it; restoring a physical tablet needs a new pairing. Implemented **locally** (ledger 90); Hosted application still gated by D-7. | Owner, S1 prompt §2 → [U1 document](U1_KIOSK_REVOKED_DEVICE_LIFECYCLE.md) |

## 2. Owner input required

Legend — **Blocks B**: blocks Batch B implementation start/scope. **Blocks C**: blocks Hosted DEV execution/validation.

### D-1 — Production organization/location identity and member list (read-only preflight)

1. **Question:** May a read-only Production preflight be run to capture ids, slugs, active-location counts, org-member roles (counts and ids, no PII), null-location counts and `attendance_identity_links` counts?
2. **Evidence:** DEV cannot answer it: DEV's org slug is `the-monks`, location "DEV Location"; docs say `monks`/Webster. `main` has 62 migrations vs `development` 88 (26 V2 migrations pending on Production, assumed). Production was prohibited in Batch A.
3. **Options:** (a) authorize one read-only preflight with a hard-coded read-only wrapper; (b) defer to V2-009; (c) owner supplies the manifest manually.
4. **Recommended:** (a), in Batch C, read-only (`begin read only`), counts and ids only.
5. **Data affected:** none (read-only).
6. **Risk if deferred:** the Production backfill manifest cannot be built; V2-009 stalls; wrong-org mapping risk if guessed by name.
7. **Blocks B:** No. **Blocks C:** Production-shaped rehearsal only.

### D-2 — Approve the legacy → location role ladder

1. **Question:** Approve the mapping `owner → manager`, `general_manager → manager`, `shift_manager → assistant_manager`, `host → staff`, `server → staff` for orgs with exactly one active location (org roles unchanged)?
2. **Evidence:** matches V2-D019 and the five existing DEV Monks rows (owner/GM→manager, server→staff); effective-access analysis shows no change at N=1; `ROLE_MAPPING_PLAN.md` §3–4. Caveat **E-1**: any manager/assistant row gives org-wide Recipes management and Inventory org-manager.
3. **Options:** (a) approve as proposed; (b) map `shift_manager → staff` (rejected by analysis: reduces access); (c) per-person list instead of a rule.
4. **Recommended:** (a).
5. **Data affected:** `location_memberships` inserts only, approved orgs only.
6. **Risk if deferred:** after the V2 app ships, real members without a location row are denied operational access in the app (no TS fallback) — release blocker; no tooling can be finalized.
7. **Blocks B:** Yes for B2 (manifest rule); validator can be built parameterized meanwhile. **Blocks C:** Yes.

- **D-2b** Multi-element role arrays: policy is "owner picks one role per person; never the first element". Approve? Recommended yes. (0 in DEV; Production unknown.)
- **D-2c** Any multi-location real org: an explicit person × location × role list is required; no "all locations" default. Approve? Recommended yes.

> **Update (S1, 2026-11-12):** the three decisions are now described in an owner-ready packet in **§4 below**, with measured evidence (zero capability change at one location; the E-1 timing hazard at two or more) and the corrected write path for B2. **None is approved.** D-2's caveat "E-1" is now bounded precisely in the [E-1 plan](E1_RECIPES_INVENTORY_SECURITY_PLAN.md): at N=1 it adds nothing; at N≥2 it matters only for `shift_manager → assistant_manager`.

### D-3 — Manual Preview organization disposition

1. **Question:** Is `the-lineup-manual-preview` ("DEV Bar & Lounge", 2 active members, 14 recipes, 28 products, 0 location rows) a real QA tenant to keep operational, or disposable?
2. **Evidence:** created 2026-10-29; has credentials and catalog data; members currently resolve `no_access`.
3. **Options:** (a) keep: assign its members per D-2 and configure modules (D-5b); (b) keep but leave unassigned (known `no_access`); (c) retire it (archive location, deactivate members) later.
4. **Recommended:** (a) if it is still used for manual QA, otherwise (c); not (b).
5. **Data affected:** 2 memberships, 1 location, 0–9 module rows.
6. **Risk if deferred:** it stays one of the 43 not-ready locations; blocks any DEV enforcement rehearsal.
7. **Blocks B:** No. **Blocks C:** Only the DEV enforcement/readiness rehearsal.

### D-4 — Harness fixture disposition (28 orgs / 42 active locations; 3 retired acceptance orgs)

1. **Question:** How should the 42 active `V2 Harness` locations be treated?
2. **Evidence:** no credentials, no real operational history except 69 allocation tables and catalogs; they make `module_enforcement_readiness()` 43 not-ready; archive is reversible (`restore_archive`) and retains history; acceptance fixtures are already archived.
3. **Options:** (a) archive them through the lifecycle path (reversible, removes them from readiness); (b) keep active and seed explicit module rows; (c) leave as is (enforcement can never be activated on DEV).
4. **Recommended:** (a), as a separate owner-approved DEV maintenance step; never delete.
5. **Data affected:** 42 location lifecycle states + lifecycle events.
6. **Risk if deferred:** enforcement activation rehearsal on DEV is impossible; fixtures keep inflating "44 active".
7. **Blocks B:** No. **Blocks C:** The DEV readiness/enforcement rehearsal only.

### D-5 — Monks DEV module values and Production module matrix

1. **Question (D-5):** Are the eight `disabled` module rows at The Monk's DEV "DEV Location" (table_allocation, tasks, schedule, tips, team, attendance, payroll, recipes) intended?
2. **Evidence:** created/changed by the org-owner account via Settings on 2026-11-11 04:54–04:56 UTC; no audit entry for module changes; only `bar_inventory` is enabled. With enforcement staged nothing is hidden today; if activated, those modules would be denied.
3. **Options:** (a) keep (intentional); (b) owner re-enables via Settings editor (audited) before any activation; (c) ignore until activation is planned.
4. **Recommended:** (b)/(a) by owner choice — **preserve now**; V2-008 will not change them.
5. **Data affected:** none now.
6. **Risk if deferred:** none until activation; then the pilot analogue loses 8 modules.
7. **Blocks B/C:** No (read-only report only).

- **D-5b (Production):** per real active Production location, owner supplies Enabled/Disabled for each of the nine modules (matrix in `BATCH_B_C_DEPENDENCIES.md` §2). **Blocks V2-009**, not Batch B.

### D-6 — Attendance mode for real locations

1. **Question:** Set `attendance_mode = 'external'` on the Production pilot location (Webster) and leave every other location `NULL` (unconfigured)?
2. **Evidence:** `NULL` already behaves external-compatible for reads and fails closed for native clocking; V2-D017 preserves Neon; DEV has no Neon links so DEV cannot prove it.
3. **Options:** (a) explicit `external` for Webster only, via the audited RPC, after Production link evidence (D-1); (b) leave all `NULL`; (c) `internal_the_lineup` for a location the owner wants on native/kiosk.
4. **Recommended:** (b) until D-1 evidence exists, then (a) for Webster only. Never blanket.
5. **Data affected:** one `locations.attendance_mode` value + audit event.
6. **Risk if deferred:** none functionally; kiosks cannot clock at `NULL`/`external` locations (intended).
7. **Blocks B:** No. **Blocks C:** No.

### D-7 — Hosted DEV write authorization (execution of V2-008 data steps)

1. **Question:** Authorize, for a stated manifest only, (i) a pre-change backup/baseline, (ii) a rehearsal, (iii) Hosted DEV application of the approved backfill/config manifests and the D7 migration push, (iv) synthetic real-JWT D7 verification and its cleanup?
2. **Evidence:** DEV is at ledger 88; real Monks rows already exist so the data run is expected to be a no-op; the D7 RPC is the only expected schema change.
3. **Options:** (a) authorize at Batch C start with the exact manifest; (b) rehearsal only; (c) none.
4. **Recommended:** (a) per step, not blanket; (b) if D-2 is not yet decided.
5. **Data affected:** only what the manifest names; `location_memberships`, optionally module rows, one function.
6. **Risk if deferred:** V2-008 cannot be validated on hosted infrastructure.
7. **Blocks B:** No. **Blocks C:** Yes.

### D-8 — Backend enforcement activation

1. **Question:** Is activation of module enforcement (V2-004.004) part of V2-008 or V2-009?
2. **Evidence:** DEV readiness 1/44; the DB guard refuses activation until every active location is configured; Monks has 8 disabled modules (D-5).
3. **Options:** (a) keep `staged` through V2-008 (activation owned by V2-009 release gate); (b) activate on DEV after D-3/D-4/D-5.
4. **Recommended:** (a).
5. **Data affected:** one switch row.
6. **Risk if deferred:** none; enforcement remains STAGED.
7. **Blocks B/C:** No.

### D-9 — Approve Batch B scope, including the D7 RPC migration and predicate hardening

> **Update (B1, 2026-11-12):** the owner authorized **B1 only** — the D7 listing RPC + UI, the F-1 predicate hardening and the additive migration (ledger 88 → 89), for **local** implementation and validation. That portion is implemented locally ([D7 plan §8](D7_LOCATION_SCOPED_KIOSK_PLAN.md)). The remainder of D-9 (B2–B4 tooling) stays **not approved**; Hosted DEV application of the B1 migration remains gated by **D-7**.

1. **Question:** Approve Batch B = {D7 listing RPC + UI, tooling for backfill/config/attendance reports, tests} and the additive migration (ledger 88 → 89), **including** hardening `private.kiosk_can_manage_location` (finding F-1: require active org membership + live session for the location-manager branch)?
2. **Evidence:** `D7_LOCATION_SCOPED_KIOSK_PLAN.md` §2, §6.1.
3. **Options:** (a) approve both; (b) approve D7 only and record F-1 as a residual window; (c) hold.
4. **Recommended:** (a).
5. **Data affected:** one new function, one replaced function; no data.
6. **Risk if deferred:** D7 cannot ship (required before Production); F-1 persists.
7. **Blocks B:** **Yes.**

## 3. Summary

| Decision      |             Blocks Batch B             |       Blocks Batch C       |     Blocks V2-009      |
| ------------- | :------------------------------------: | :------------------------: | :--------------------: |
| D-1           |                   no                   |   Prod-shaped rehearsal    |          yes           |
| D-2 / 2b / 2c |                yes (B2)                |            yes             |          yes           |
| D-3           |                   no                   | enforcement rehearsal only |  yes (Preview tenant)  |
| D-4           |                   no                   | enforcement rehearsal only |           no           |
| D-5 / 5b      |                   no                   |             no             |        yes (5b)        |
| D-6           |                   no                   |             no             |          yes           |
| D-7           |                   no                   |            yes             |           —            |
| D-8           |                   no                   |             no             |          yes           |
| D-9           |                **yes**                 |            yes             |          yes           |
| D-10 (E-1)    | **adopted + implemented locally (§6)** |    no (N≥2 / D-2c: yes)    | yes before any N≥2 org |
| D-11 (H-S1)   |                   no                   |             no             |           no           |

## 4. D-2 / D-2b / D-2c — owner-ready decision packet (added in Security Gate S1, 2026-11-12)

**Nothing here is approved.** The S1 prompt that asked for this packet did not approve it. Evidence: [measured equivalence probe](security-s1/d2_role_ladder_equivalence_output.md) (disposable local stack), [ROLE_MAPPING_PLAN.md](003-existing-role-migration/ROLE_MAPPING_PLAN.md), [E-1 plan](E1_RECIPES_INVENTORY_SECURITY_PLAN.md). Production roles are **unverified** (D-1).

### 4.1 Two role models — what the mapping does and does not touch

| Model                                                 | Values                                                                          | Mapping effect                                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Organization role (`memberships.roles`, `app_role[]`) | `owner`, `general_manager`, `shift_manager`, `host`, `server`                   | **Never changed.** Organization authority (settings, lifecycle, kiosks, org-level modules) stays exactly as it is. |
| Location role (`location_memberships.role`)           | `manager`, `assistant_manager`, `staff` (**there is no `owner` location role**) | The only thing added: one row per active member at the organization's single active location.                      |
| Overall role (`overall_roles`)                        | `owner`, `manager`, `assistant_manager`                                         | **Never created by migration.**                                                                                    |

So an organization **owner** maps to location `manager` — the highest location role that exists — while remaining an organization `owner`. It is neither insufficient (the org role keeps every organization-level right) nor excessive (measured: no capability gained in any database function).

### 4.2 D-2 — ladder, with evidence status (scope: organizations with **exactly one** active location)

| Legacy org role → location role       | Evidence status                                                | Measured capability change at N=1 | If the org later has N≥2 (row kept)                                                       | Automate after approval?                |
| ------------------------------------- | -------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------- |
| `owner` → `manager`                   | **Already present and validated** in DEV (Monks: 1 active row) | none                              | none                                                                                      | Yes                                     |
| `general_manager` → `manager`         | **Already present and validated** in DEV (Monks: 1 row)        | none                              | none                                                                                      | Yes                                     |
| `server` → `staff`                    | **Already present and validated** in DEV (Monks: 3 rows)       | none                              | none                                                                                      | Yes                                     |
| `host` → `staff`                      | **Newly proposed** — no DEV member holds it                    | none (probe)                      | none                                                                                      | Yes (same tier as `server`)             |
| `shift_manager` → `assistant_manager` | **Newly proposed** — no DEV member holds it                    | none                              | **adds org-wide Inventory catalog read and (E-1) shared-catalog write via that location** | Yes at N=1; **hold for N≥2 until D-10** |

Measured across 16 authorization functions × 5 roles × 4 states: **zero capability change at N=1** for every role. Raw levels change only for `owner` 4→3 in Tasks/Tips/Schedule (the modules where a location row overrides the org role); every deployed consumer of a `*_profile_level` compares only `> 0`, `= 0`, `= 1` or `>= 2`, so level 3 vs 4 is never read. **Not measured:** TypeScript-resolver equivalence (the TS side _gains_ location access it lacks today); B2 must carry a Vitest equivalence test before execution.

Rejected alternatives (unchanged): `shift_manager → staff` (regression), `host/server → assistant_manager` (would hand out E-1), `owner → assistant_manager` (reduction).

**Decision requested — D-2:** (a) approve all five for N=1 organizations _(recommended)_; (b) approve only the three validated mappings now and hold `host`/`shift_manager` until the Production member list (D-1) shows they exist; (c) a per-person list instead of a rule. Approving `shift_manager → assistant_manager` is safe at N=1 and should be recorded together with the D-10 sequencing.

### 4.3 D-2b — multi-element role arrays

Policy to approve: **never** the first element, **never** a silent maximum, **never** guessed. The owner supplies either (i) an **exact role-set table** — each distinct array found (e.g. `{server, host}` → `staff`, `{server, shift_manager}` → `assistant_manager`) approved once and applied deterministically — or (ii) a per-person exception. Validator rules: the chosen location role must be derivable from a role **inside** the person's array (no expansion beyond existing access); a choice **below** the person's current effective tier requires an explicit `acknowledge_reduction`; an array absent from the table, an empty array, or `roles[]` that changed since the dry-run → the **whole organization** is skipped. DEV: 0 occurrences (59 rows are single-element); Production: unknown.
**Automatable after approval:** only entries already in the approved table. **Manual:** everything else.

### 4.4 D-2c — organizations with more than one active location

Policy to approve: no organization membership is ever copied to every location; no inferred cross-location manager access; no guessed primary location; no reactivation of an inactive row. Each manifest row is **(person, location, role, evidence)** where evidence is one of: an already-active row at that location, or a written owner instruction naming person + location + role. Anything unresolvable **quarantines the organization** (no writes) and is reported.
**Automatable after approval:** applying owner-listed rows inside the atomic per-organization transaction (§4.5). **Manual:** deciding the list. **Gate:** manager/assistant rows in an N≥2 organization wait for **D-10** (E-1) or its explicit acceptance.

### 4.5 The P0 fallback cliff — how the validator proves completeness before any write

Deployed condition (read from `schedule_profile_level` and `can_operate_board`): the legacy fallback for non-owner/GM members applies **only while the organization has exactly one active location and no `location_memberships` row exists — of any status, at any of its locations** (no `active` filter, archived locations included). The first row, even an inactive one, removes the fallback for every unassigned member; the TypeScript resolver has no fallback at all. Tasks falls back per profile and Inventory's `shift_manager` fallback has no such clause (not re-derived here beyond these two functions).

An organization is **applied or skipped as a whole**. The validator emits `APPLY` only when all hold; otherwise `SKIP` with the reason:

1. N active locations is exactly 1 (or an owner-listed D-2c manifest exists).
2. Every **active** membership resolves to exactly one of: _mapped_ (rule / exact-set table / exception), _already present_ (existing active row equal to the mapped role), or _intentionally unassigned_ (owner-signed; the report prints the resulting loss of access). Any other active member → `SKIP`.
3. Every existing `location_memberships` row of the organization is either equal to the manifest or absent. A differing role, an inactive row, a row at an archived/inactive location, or a row for a profile without an active membership → `SKIP` (never overwritten, never reactivated).
4. A **state hash** over (organization, location ids, ordered membership ids and roles, existing rows) is recorded; the executor recomputes it inside its transaction and refuses on drift.
5. Execution is **one transaction per organization**: re-validate, insert every row, run the completeness query again, then commit; any failure rolls back to zero rows.
6. Post-commit reconciliation re-runs the 16-function matrix per member and diffs it against the dry-run's capability delta; any difference is a failure to investigate.
7. Dry-run output is ids-only (no names or emails), with counts per organization, the verdict, the capability delta, and E-1 flags for every manager/assistant row.

**Correction to the B2 package (rule 8):** `apply_location_assignment_changes(uuid, jsonb)` works **per target person**, needs a real authorized caller (the service role has EXECUTE but `auth.uid()` is null → `Authentication required`), and its assign/update/reactivate actions **upsert and reactivate** (`role = …, active = true`). Called per member it can neither be atomic per organization (each call commits separately — the cliff itself) nor honour "never reactivate or overwrite". See the [B2 package](B2_B4_NEXT_STEP_PACKAGE.md) for the replacement options.

## 5. New decisions raised by Security Gate S1

### D-10 — E-1 correction (Recipes / Inventory organization-wide catalog management)

Full analysis, evidence and options in the [E-1 plan](E1_RECIPES_INVENTORY_SECURITY_PLAN.md) §10. Summary: reproduced, intra-organization (no tenant-scoped actor crosses tenants; Overall roles are cross-tenant by design), no E-1 SQL written. **Decide:** the authority model for multi-location organizations (A org-level only with an N≤1 compatibility rule _(recommended)_ · A′ location managers keep it · B org-level only everywhere · C accept as designed), Overall Assistant Manager treatment, Recipes images follow Recipes writes, and sequencing (correct before any N≥2 backfill or second real location). **Blocks:** B2 for N≥2 organizations / D-2c; not B2 for N=1.

### D-11 — Shared `session_id` hardening (H-S1)

No bypass demonstrated; five helpers accept a token with no `session_id`, two (Tasks, Tips) already require it ([S1 record](SECURITY_GATE_S1.md) §2). **Decide:** schedule the cross-module change (strict form for the five helpers + fixture updates) after V2-009, or accept as is. Recommended: schedule post-V2-009. **Blocks:** nothing.

### U-1 follow-ups (optional)

R-1 (reassigned-active row lingers "Active" with no credential) and R-2 (DB-level invariant: `CHECK` + `BEFORE UPDATE` trigger making `revoked` terminal for every writer) — see the [U-1 document](U1_KIOSK_REVOKED_DEVICE_LIFECYCLE.md) §6. Neither blocks anything.

## 6. Batch B continuation (2026-11-13): decisions adopted for LOCAL implementation only

The owner adopted the following by submitting the "Continue Batch B" prompt unchanged. **Scope: local implementation and dry-run tooling. None of it authorizes a real backfill, a Hosted DEV migration (D-7), real staff-role changes, real module-configuration changes, Attendance-mode updates, financial activation, backend enforcement activation, or a push/PR/merge.**

| Ref         | Adopted as                                                                                                                                                                         | Implemented in                                                                                                                                         | Note                                                                                                                                                                                                                                                                         |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D-10**    | **Option A**: org-level roles manage the shared catalogs; location roles keep it only while the organization has exactly one active location; location-scoped stock ops unchanged. | Migration `20261113100000_e1_shared_catalog_authority.sql`, pgTAP `0080`, app layer (see [E-1 plan](E1_RECIPES_INVENTORY_SECURITY_PLAN.md) §13).       | **D-10b resolved conservatively:** the prompt requires existing Overall-role authority to stay intact, so the Overall **assistant manager keeps** organization-wide catalog management (the plan had recommended narrowing it). Re-open only if the owner wants it narrowed. |
| **D-10c/d** | Recipes images follow the same rule as recipes; E-1 is corrected before any multi-location backfill.                                                                               | `recipes_can_write_image` uses the same predicate; B2 refuses N≥2 without a complete manifest and lists every manager/assistant row's E-1 consequence. | —                                                                                                                                                                                                                                                                            |
| **D-2**     | Ladder: owner/GM → manager, shift_manager → assistant_manager, host/server → staff, as **location** rows only; organization roles and Overall roles untouched.                     | `role-backfill.mjs`; capability preservation demonstrated before any assignment (pgTAP `0081`, `capability-model.test.ts`).                            | Zero capability change at one location, measured. Only owner Schedule/Tasks/Tips 4 → 3 (same band).                                                                                                                                                                          |
| **D-2b**    | Multi-role arrays are never auto-mapped; the record is marked "explicit mapping required"; the organization is excluded from automatic write execution.                            | `multi_role_requires_explicit_mapping` → organization `SKIP`.                                                                                          | The tool still inventories and reports them.                                                                                                                                                                                                                                 |
| **D-2c**    | Multi-location organizations need a complete, explicit, per-organization manifest; nothing is inferred.                                                                            | `multi_location_requires_complete_manifest`; state-hash-bound manifest; capability unmeasured at N≥2 needs an explicit acknowledgement.                | No automatic multi-location backfill is authorized by this adoption.                                                                                                                                                                                                         |
| **B2–B4**   | Local tooling only.                                                                                                                                                                | [B2_B4_PLANNING_KIT.md](B2_B4_PLANNING_KIT.md).                                                                                                        | Dry-run planners; no executor.                                                                                                                                                                                                                                               |

**Still unapproved (not converted into approvals):** D-1 Production read-only preflight · D-3 Manual Preview mappings · D-4 harness fixture disposition · D-5/5b actual module values · D-6 ambiguous Attendance modes · **D-7 Hosted DEV migration and write authorization** · D-8 enforcement activation · D-11 shared `session_id` hardening. For ambiguous multi-role / multi-location records the approved default is **skip and report**.

**New observation for the owner (not a decision yet):** in the V2 UI an organization **owner with only an organization membership and no location assignment** lands on "No restaurant location assigned" (reproduced in the browser while writing the E-1 specs). That is existing, intended V2 behaviour (a workspace needs a location), and it is exactly why the D-2 ladder maps Owner → **Manager at the location** while preserving the organization membership. It means a real organization's owner and general manager need their location rows **before** the V2 app reaches that organization.

## 7. Batch C — D-7 split (added 2026-11-13)

D-7 is now four separate decisions; **none is approved**, and the Batch C prompt is not D-7 authorization. Packet: [batch-c/D7_APPROVAL_PACKET.md](batch-c/D7_APPROVAL_PACKET.md).

| Ref   | Decision                                                                                                  | State                                    |
| ----- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| D-7A  | Apply exactly migrations 89, 90, 91 to Hosted DEV (+ encrypted backup, real-data rehearsal, verification) | **Ready for owner decision**             |
| D-7B  | Authenticated verification: path 1 rolled-back SQL probes (recommended); path 2 fixtures (not requested)  | Ready (path 1)                           |
| D-7C  | Actual legacy backfill / configuration                                                                    | **Not ready** — Track 2 prerequisites    |
| Git   | Push the feature branch by explicit refspec, open one PR to `development`, exact-head CI (no merge)       | Ready for owner decision                 |
| Merge | Final merge authorization                                                                                 | Later; needs D-7A/B verified, CI, review |

D-1, D-3, D-4, D-5/D-5b, D-6, D-8, D-11 are unchanged and do **not** block D-7A. They block Track 2 / V2-004 enforcement / V2-009 as listed in the receipt.
