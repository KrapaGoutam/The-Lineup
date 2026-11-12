# V2-008 — Decision Register (approved vs. owner input required)

Prepared in Batch A (2026-11-12). No decision was invented. Questions that repository or Hosted DEV evidence could answer were answered in the plans instead of being asked.

## 1. Already approved (do not re-ask)

| Ref | Decision                                                                                                                                                        | Source                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| A-1 | **D7**: a location-only manager may manage kiosk devices for locations where they hold an active `manager` assignment, without general Location Administration. | Owner, via #255 closeout → #256                    |
| A-2 | V2.0 tenant/role architecture (V2-D001…D022), incl. the V2-D019 tier ladder and highest-applicable-capability resolver.                                         | `DECISIONS.md`                                     |
| A-3 | External (Neon) Attendance is preserved where explicitly configured; no forced `EXTERNAL` on every location; no silent internal→external conversion.            | V2-D011/D017; task brief                           |
| A-4 | No unauthorized financial activation: finance stays OFF; native Payroll consumption stays disabled.                                                             | Standing owner constraint                          |
| A-5 | No Production changes in V2-008 Batch A (and none without separate sign-off thereafter).                                                                        | Standing owner constraint; `MIGRATION_STRATEGY.md` |
| A-6 | Kiosk device location is attributed by trusted in-app pairing (no GPS/IP/Wi-Fi).                                                                                | V2-D013/D014/D015                                  |
| A-7 | T5 stale-cookie replay accepted as an exception; physical-tablet acceptance owned by V2-009.                                                                    | #255 closeout                                      |

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

1. **Question:** Approve Batch B = {D7 listing RPC + UI, tooling for backfill/config/attendance reports, tests} and the additive migration (ledger 88 → 89), **including** hardening `private.kiosk_can_manage_location` (finding F-1: require active org membership + live session for the location-manager branch)?
2. **Evidence:** `D7_LOCATION_SCOPED_KIOSK_PLAN.md` §2, §6.1.
3. **Options:** (a) approve both; (b) approve D7 only and record F-1 as a residual window; (c) hold.
4. **Recommended:** (a).
5. **Data affected:** one new function, one replaced function; no data.
6. **Risk if deferred:** D7 cannot ship (required before Production); F-1 persists.
7. **Blocks B:** **Yes.**

## 3. Summary

| Decision      | Blocks Batch B |       Blocks Batch C       |    Blocks V2-009     |
| ------------- | :------------: | :------------------------: | :------------------: |
| D-1           |       no       |   Prod-shaped rehearsal    |         yes          |
| D-2 / 2b / 2c |    yes (B2)    |            yes             |         yes          |
| D-3           |       no       | enforcement rehearsal only | yes (Preview tenant) |
| D-4           |       no       | enforcement rehearsal only |          no          |
| D-5 / 5b      |       no       |             no             |       yes (5b)       |
| D-6           |       no       |             no             |         yes          |
| D-7           |       no       |            yes             |          —           |
| D-8           |       no       |             no             |         yes          |
| D-9           |    **yes**     |            yes             |         yes          |
