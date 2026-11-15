# V2-009 — Stage D Production preflight handoff

Prepared November 14, 2026 (America/Chicago). **STAGE C PASS — HOSTED DEV ACCEPTED**;
owner manual authentication 8/8, operational smoke 7/7, combined 15/15.
Canonical accepted evidence: [STATUS.md](STATUS.md). No Stage D action was executed.
**Next state: AWAITING PRODUCTION PREFLIGHT AUTHORIZATION.**

## Accepted baseline and identities

- Development / PR #331 merge: `ec06ce95faa8d6bf0f8127b2a92b3bb2a8818ad4`.
- Current main: `5e5b7747693b6e81014eafdf299b87e56c3f033d`.
- Accepted DEV: Supabase `opmujepkemwcdxxorhfd`, migration ledger 97/latest
  `20261114210116` per Stage B receipt; owner-verified READY exact-commit alias
  <https://the-lineup-git-development-onepiece11.vercel.app/>. Not re-queried here.
- Historical Production Supabase candidate: `ftadewtkjlaotfdvtjcv`, project
  `the-lineup`. This identity and **actual migration baseline/schema must be
  independently reverified** before constructing a Production migration set.
- Existing Vercel application `the-lineup`: **verified in the D1 continuation
  (2026-11-14, read-only)** — see [D1 Production preflight](#d1-production-preflight-continuation-2026-11-14).
  Authoritative scope is team `onepiece11` / `team_i8igGalPA54kRnKVsTRPVErz`, project
  `prj_vIbup0LAziHwNv1cbJ5sUSxqaoaJ`. The earlier `team_lsStfTKp3LGQEWGYRM0BJ4Pb`
  (connector slug `one-piece-5779`) is a stale/unrelated team that does not own
  this project; no access to it is needed.

## D1 Production preflight continuation (2026-11-14)

Read-only; nothing in Production, Vercel, GitHub or the database was changed.
Status: **D1 PREFLIGHT READY — OWNER DECISIONS REQUIRED** (not a Production GO).

- **Vercel (verified):** team `onepiece11` (Hobby plan); project `the-lineup`
  (`prj_vIbup0LAziHwNv1cbJ5sUSxqaoaJ`, `.vercel/project.json` agrees); GitHub
  `KrapaGoutam/The-Lineup` (public), Production branch `main`, deployments enabled.
  Production deployment `dpl_A75LmPh83YAHssqRcJidRZJW1cTQ`, READY, serves main
  `5e5b7747…`; aliases `the-lineup-dusky`, `the-lineup-onepiece11`,
  `the-lineup-git-main-onepiece11` (`.vercel.app`). The served Production bundle
  references only `ftadewtkjlaotfdvtjcv`; the `development` Preview references only
  `opmujepkemwcdxxorhfd`. Production env has **no `KIOSK_SESSION_SECRET`** (V2 kiosk
  needs it; Preview-only today). `APP_PIN_PEPPER` and `SUPABASE_SECRET_KEY` exist
  for Production (presence only).
- **Production database (reused Codex read, not rerun):** ledger 62, head
  `20261029194855`; V2 tree has 97, so 35 ordered files are pending (shelved
  `20261113120000` is excluded). `20261029194855` is on Production but not on
  `main` (present in the V2 tree) — verify content equality in D2. One org (The
  Monk's), one location (River Oaks), 11 profiles/memberships/Auth users/active
  credentials, no Auth bans; V2 Overall/Location schema not installed.
- **Governance (verified):** GitHub `Production` environment has no reviewers and no
  branch policy; `main` is unprotected, no rulesets; `database.yml` runs
  `supabase db push` on any main push touching migrations while Vercel
  independently auto-deploys main. Merging `development → main` would race both.
- **Owner decisions** are listed in the D1 decision packet delivered with this
  report; Raj's Overall Owner row is never created by migration and needs a separately
  authorized privileged step.

## D2 backup and isolated rehearsal result (2026-11-14, read-only)

Status: **D2 PASS WITH FINDINGS — not a Production GO; D3 needs separate approval.**
Production was read only through the Management API read-only endpoint (no CLI login
role, no writes; ledger still 62). Encrypted (Windows DPAPI, owner-only) bundles live
outside Git under `AppData\Local\TheLineup-PROD-Backups\V2-D2-20261114`; authoritative
file `prod-20261115T045944Z.zip.dpapi` (the earlier `…044801Z` bundle is superseded:
jsonb numeric text was not byte-lossless). Tooling: `_release-backups\prod-d2-tooling-2026-11-14`.
Isolated rehearsal (network none, no ports, Postgres image 17.6.1.166, destroyed after):
migrations 1–62 from the tree replayed cleanly; Production data restored byte-exact
(73 tables / 6,318 rows, 241 FKs, 0 orphans); 35 pending migrations applied to ledger 97
(`20261114210116`, shelved `20261113120000` absent); fresh-97 vs upgraded catalog identical;
`auth.users` byte-identical; no original column or row changed; 745/748 per-profile
visibility cells unchanged (Conan's Payroll reads drop from all to own). Not proven: the
old-`main` app against schema 97 at application level, Storage object bytes (76 images),
and Supabase managed-GoTrue/Storage behavior (stubbed from Production definitions).

## D2b closeout and D3 handoff (2026-11-14, local only)

**D2b CONDITIONAL — SPECIFIC GAPS REMAIN.** D2's Production snapshot and 62→97
rehearsal were reused, not repeated. The later "First owner action" section is the
historical D1 plan; this D2b section is the current handoff. No D3 action is authorized.

- **Recovery artifacts:** The authoritative 426,806-byte DPAPI ciphertext still
  matches SHA-256 `3279c79943ab3cc945eb8b5aacaecfd00ca2f8669eeab7f415ffa66fc9f2b57f`;
  its bundle hash matches the D2 receipt. A separate 426,780-byte portable OpenPGP
  symmetric AES-256/OCB AEAD copy was created with an owner-entered passphrase.
  GnuPG's packet metadata confirms cipher 9 / AEAD 2; in-memory decryption,
  recovered ZIP and embedded bundle hashes passed. Original and superseded backups
  remain untouched. The exact accepted `ec06ce95` source is archived separately
  (2,250 entries, 97 migrations, no environment files, SHA-256
  `e8a1bfdb0e3a87d6bdce8a7ad59fe7df6681364c8e9128bc8b5db26f74b9afab`).
  Owner-only recovery manifest, portable receipt/instructions and DPAPI-protected
  per-object Storage inventory are outside Git under the D2 backup directory.
- **Storage gap:** The authoritative database metadata lists 76 unique private
  `recipe-images` objects, 7,958,106 expected bytes. The owner has no existing
  image download; 0/76 object bytes are locally recovered. The connector has no
  private Storage download capability, and no read-only object credential was
  available. No service-role download or Production request was attempted. The
  protected inventory holds the exact keys/sizes/eTags for a future authorized
  read-only retrieval and byte-level comparison. eTags are metadata, not an
  independently verified file checksum. Full Storage recovery is therefore open.
- **Old-main/schema-97 compatibility:** One focused exact-source contract check
  found that old main still reads legacy `passcode_credentials`; B3 retains that
  table and the existing login fields. Team `roles` update retains a column grant,
  and Schedule has a single-location fallback. These are **static evidence only**.
  Application startup, GoTrue login, enrollment, Team read/write, Schedule write
  and financial write were not run against schema 97: D2's isolated container was
  destroyed and the available Docker engine is inaccessible. Rebuilding a full
  stack or replaying 35 migrations would exceed this bounded pass.
- **Known overlap hazards:** Old main's registration writes the legacy credential
  but not the new global PIN registry. Old main's Team deactivation uses separate
  service-role membership/credential writes and a global Auth ban instead of the
  new transactional `team_set_member_active` operation. Its Payroll server action
  treats every non-server role as full-scope, while schema 97 restricts
  `shift_manager` financial writes. These source/policy mismatches make live
  old-main writes during migration unsafe even though D2 found no table/RPC loss.
  A controlled maintenance window can remove the overlap only if new traffic and
  writers are actually blocked until schema, identity bootstrap, exact new app,
  critical smoke and session continuity are verified. Vercel auto-deploy and the
  GitHub `database.yml` main-push migration job must be made sequential first.
- **Conan Payroll scope reduction — OWNER DECISION PENDING.** D2 observed his
  `shift_manager` membership changing visibility from 24→2 periods, 21→3
  payments and 3→0 adjustments. Migration `20261108021714` replaces the manager
  read policies with `payroll_is_org_manager` (Overall owner/manager or active org
  owner/general_manager), location-scoped management and locked-period self-read.
  `shift_manager` alone no longer grants organization-wide Payroll access. This
  matches the proposed sensitive-Payroll restriction but has no owner approval;
  no policy or role was changed here.

**D3 — Production Release Readiness & Controlled Cutover Preparation (next stage,
not started):** Obtain the owner's Conan decision, Raj Overall Owner bootstrap
approval, eleven location assignments and test-account disposition; complete
distributed PIN abuse protection, trusted request attribution and sensitive
Overall Owner step-up; set `KIOSK_SESSION_SECRET`; resolve GitHub Production
reviewers/main protection and Vercel commercial-use eligibility; obtain physical
device acceptance and a credential transition/recovery decision. Prepare an
enforced maintenance-mode sequence: block traffic/writes, fresh verified recovery
point including Storage bytes, apply only 35 approved migrations, perform separately
approved identity/location bootstrap, deploy the exact new app, verify critical
functions/Auth sessions, then restore access. The main-push database workflow and
Vercel auto-deploy must not race. Obtain a final owner release approval after these
steps are concrete and reviewable. D2b performed no Production/DEV write, Auth
test, configuration change, CI, deployment, merge, push or PR.

## First owner action and authorization boundary

Owner's next action: **authorize a read-only Stage D Production preflight** to
verify the exact Production project/application identities, baseline, deployment
ordering/governance and existing release obligations. Name the responsible operator
and approved private evidence destination. This grant must not include migrations,
data changes, backup export/restore, settings changes, activation or main merge.
Obtain separate concrete authorization for backup/export/rehearsal and eventual
Production execution after the preflight yields a reviewable plan.

Do not start Stage D from this handoff automatically. Do not promote development
to main to discover whether the release process is safe.

## Preflight decisions and evidence required

1. **Actual Production baseline:** verify project/org/account, database version,
   migration versions/names, drift, RLS/grants/RPCs, data and org/location mappings,
   role compatibility, module states and attendance sources. Source main contains
   62 migration files and accepted development 97; neither is proof of Production's
   ledger. Exclude shelved `20261113120000`; construct only the actual pending set.
2. **Vercel binding/secrets:** confirm Production URL and server/browser database
   references, served main commit, deployment permissions and automatic triggers.
   Verify required configuration presence privately, including existing
   `APP_PIN_PEPPER` continuity and dedicated `KIOSK_SESSION_SECRET`; never print
   values or copy DEV secrets. Do not rotate pepper as a deployment convenience.
3. **Fresh encrypted Production backup:** after separate approval, quiesce relevant
   writers and capture a consistent actual-baseline checkpoint, verify ciphertext,
   components/digests, owner-only access, named restore operator and retention.
   DEV backup is not a Production recovery point. Include Auth/public/private/history
   coverage; assess Storage object bytes and external configuration separately.
   Keep existing recovery backups; deletion needs the owner's explicit release.
4. **Actual-baseline rehearsal:** restore that Production checkpoint into an isolated
   local environment; verify contents, FK integrity, policies/owners/grants and
   settings, apply the reviewed pending sequence, then verify ledger/security and
   business/Auth/history preservation. Reuse Stage A method, not its DEV data as
   Production proof. Stop on mismatch or uncertain commit; no ledger repair/retry.
5. **Compatibility and recovery:** demonstrate currently served old-main app works
   on the proposed new schema before app cutover, including auth/registration,
   Team lifecycle, key reads and authorized mutations on disposable rehearsal
   fixtures. Stage A proved B3/B4→97, not main→97. Quiesce credential writers through
   cutover so old writers cannot race B5 durable operations. Explicitly accept the
   one-way person-password/enrollment transition and forward-fix recovery boundary.
6. **Credential operability:** inventory legacy Auth bans without clearing them;
   provide original restaurant enrollment instructions, collision handling,
   Overall Owner provisioning/operator recovery authority and a quiesced exact-profile
   reconciliation runbook. No PIN search, claim expiry/clearing or blind retry of
   an uncertain Auth write. Retained inactive claims and the finite 10,000 PIN
   namespace require owner awareness before broader onboarding.
7. **Release blockers and decisions:** resolve the table below in writing. Stage C
   success does not supply unreported physical-tablet, Recipe Staff or Production
   verification. Preserve Finance OFF and enforcement staged; #304/#319/#320 need
   their own activation/scope decisions, never implicit toggles.

## Migration-first sequencing — mandatory before any main promotion

The checked-in `.github/workflows/database.yml` starts `deploy-migrations` on a
main push touching migrations and executes `supabase db push` in environment
`production`. B4 recorded no required reviewers/branch restriction and unprotected
main; these are historical findings to reverify. Vercel can independently deploy
the same main push. **The two paths are concurrent and unordered; do not assume safety.**

The next plan must establish an enforceable, owner-reviewed sequence:

1. Verify/approve environment controls, branch protections, exact workflow and
   application deployment triggers, credentials/context guards (#111/#112/#113).
   Prevent unattended migration or app cutover; no infrastructure edits in this task.
2. Under a separately approved maintenance window and fresh recovery checkpoint,
   apply only the reviewed compatible Production migrations, then verify actual
   ledger/objects/grants/preservation and old-app/new-schema behavior.
3. Only after those gates, build/verify an unpromoted exact-commit application
   candidate bound to Production using explicitly approved smoke scope; keep
   real employee/financial writes out of tests. Do not expose incompatible code.
4. Promote/deploy the reviewed application and merge only when the automatic
   GitHub/Vercel effects are understood and safe. The merge-triggered migration
   path must not race an unverified app, apply unexpected files or hide failed
   authentication. Record exact deployment ID, commit and binding.
5. On failure, stop and retain maintenance/evidence. Prefer reviewed forward fix;
   pre-B3/B5 app rollback is unsafe once credential enrollment has begun. A restore
   over Production requires separate authority and explicit post-checkpoint loss analysis.

## Production blockers versus deferred concerns

| Obligation                                                                                          | Disposition                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B5 distributed PIN abuse / trusted header attribution                                               | Explicit Production NO-GO. Verify ingress overwrite/attribution and rehearsed edge challenge/admission controls. No quota bypass.                                                                                                          |
| B5 sensitive Overall Owner actions                                                                  | Explicit Production NO-GO; separately approved step-up implementation required. Lightweight hobby/trusted-user scope does not silently waive this. Owner must resolve a concrete control/scope decision.                                   |
| Governance and main migration/app race                                                              | Pre-release blocker; #113 and historical B4 controls remain unresolved until verified/fixed or explicitly revised by owner through a safe concrete process.                                                                                |
| Production identity, actual baseline, access (#111/#112), binding, fresh recovery and compatibility | Unverified release prerequisites; DEV proof cannot substitute.                                                                                                                                                                             |
| Physical supported tablet/device acceptance                                                         | #257 carries pairing, touch PIN/keypad, Clock In/Out, Finish/privacy, inactivity timeout and print/preview. Owner's supplied smoke does not specify physical hardware; gap remains evidence/acceptance, not a reported application defect. |
| Legacy-ban inventory, one-way Auth acceptance, Overall Owner recovery, minimum retention/monitoring | Explicit release/operator decisions still required; no blanket acceptance inferred from eight successful QA identities.                                                                                                                    |
| Old #234 Recipe owner retest/Staff TC-19 and #164 Production checks                                 | Current GitHub records OPEN. Reconcile later evidence/scope or obtain explicit owner disposition; do not declare failure or success from unrelated smoke.                                                                                  |
| B4 V9-T audit reads, supabase_admin defaults, D-11/session contract                                 | Preserve existing decisions; reconcile changed B5 code and record remaining policy acceptance/verification.                                                                                                                                |
| B5 C1–C6 nonblocking residuals                                                                      | Preserve disclosed limits; #338 audit durability and #124 ongoing operational maturity are V2.1 backlog, conditional on Stage D confirming nonblocking status. Basic pre-release recovery/retention is still required.                     |

There is **no new owner waiver** of a documented Production blocker. If the small
trusted-user/hobby scope conflicts with required edge/step-up/governance work,
record the owner's explicit resolution before changing the gate or authorizing
implementation. Do not relabel it P3 merely to close V2.0.

## Cost and hosting scope

Prefer existing free-tier controls and an owner-operated release/recovery process;
no paid upgrade is recommended by default. Actual plan/account suitability must be
verified in preflight. Vercel's current [Hobby terms](https://vercel.com/legal/terms#hobby-plan)
restrict Hobby use to personal or non-commercial use; a free application supporting
an operating restaurant is not automatically eligible merely because users are trusted.
Owner must assess actual use. [Hobby limits](https://vercel.com/docs/plans/hobby)
also constrain usage and log availability; do not promise continuous service or
durable audit storage from short runtime logs. Acknowledge limitations explicitly.

[GitHub environment protections](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
are available for public repositories on current free plans; private-repository
availability differs. A solo owner using prevent-self-review needs an eligible
second approver or an explicitly approved alternative release process. Verify
repository visibility/plan before declaring controls impossible or recommending cost.
These policies were consulted for planning; no account configuration was changed.

## Small final Production smoke and release closeout

After explicit release authorization and schema/app readiness: one ordinary scoped
user and one owner/manager verify legacy enrollment/universal auth as applicable,
identity/context and logout; one authorized location switch/isolation check; one
paired kiosk Clock In/Out/Finish on an approved disposable fixture; Schedule and
Allocation reads, manager Inventory and Staff restriction check. Confirm binding,
no sensitive auth logs and agreed hardware/privacy/print acceptance. Scope fixture
creation/cleanup explicitly; never use real payroll/tips or replay all eight DEV users.
Add only a targeted check for any changed Production-specific risk; no blanket
full-suite replay. Exact smoke scope belongs in the future authorized execution plan.

Close #257/#248 and milestone #8 only after Production prerequisites/owner decisions,
exact migration/app evidence, agreed smoke and final owner Production acceptance.
Record release notes/recovery limitations; #255 stays closed. Only then may a
separately approved V2.1 feature start. V2.1 docs/issues/milestone do not authorize work.

---

# Historical V2-009 B1 — F-5 / F-6 handoff

## F-5 lifecycle correction — local checkpoint (2026-11-14)

Branch `fix/v2-009-f5-multi-org-deactivation` was recovered clean at `c16f2e33d5b74a63a4937dc0dd23c16c0316681d`; Stage B remains at `110ae9c7676efa48165b9e72988c5430c9d60be6`. The project-owned local Docker database was verified at ledger 92, then only forward migration `20261114054945_team_membership_lifecycle_boundary.sql` was applied (ledger 93). The shelved executor is absent. No reset, hosted contact, push, PR, merge, or deployment. The Docker stack publishes ports on all host interfaces; this work connected through localhost.

**Workflow map:** `/api/auth/register` creates a new Auth user, profile, membership and credential through the server-only service-role client, rolling back the Auth user on provisioning failure. `provision_organization` creates the first owner membership under Overall Owner authority. Team designation edits use authenticated `UPDATE (roles)`. Team deactivation/reactivation uses `team_set_member_active`, atomically changing membership, an existing credential, and audit. No delivered UI assigns an existing profile to another organization or permanently deletes a membership. The new authenticated `team_add_member` RPC supplies the controlled existing-profile assignment path. Ordinary employee removal remains audited deactivation, preserving history.

**Correction:** Direct authenticated membership INSERT and DELETE are revoked. `team_add_member` requires a live session, checks the active organization or Overall authority and target-role hierarchy, forbids self-assignment, and writes `member_added` with the new membership in one transaction. Existing inactive rows must use F-5 reactivation. It does not copy or create a credential for a person in another organization, consistent with F-5's credential-less support and the open F-6 login redesign. Service-role registration, role edits, existing credentials, and independent global Auth bans remain unchanged. The generated RPC type is updated; no new table, policy, index, PIN, password, or Auth user write was added.

**Verification:** New pgTAP `0084` 30/30; original F-5 `0083` 51/51; related RLS/provisioning/Team tests 112/112; one broader database run 86 files/3,564 assertions (before five additional focused assertions, which passed separately). Real local GoTrue/PostgREST 5/5; focused Vitest 2 files/13 tests; `npm run check` passed. The old `0068` zero-row DELETE expectation now requires `42501`. The first `0084` run exposed a null actor-active check for an Overall manager; it was fixed and rerun. Prior F-5 concurrency 3/3, full Vitest 4,178 passing, and webpack build are reused for unchanged application paths. Full Vitest and build were intentionally not repeated because no runtime TS application code changed. There is no delivered Playwright assignment flow.

**Unpublished PR draft:** target `development`; title `fix(v2-009): make Team membership lifecycle transactional and organization-scoped`; `Relates to #257`.

> F-5 replaced organization-wide Team deactivation through a global Auth ban with a transactionally audited membership/credential RPC, leaving independent account-wide bans intact. A local probe later found that direct authenticated DELETE followed by INSERT restored organization access without credential or audit consistency. This correction revokes those direct writes and adds a live-session, role-scoped RPC to assign an existing profile. Self-service onboarding, ordinary audited deactivation/reactivation, and authorized role editing remain. Local evidence: pgTAP `0084` 30/30, `0083` 51/51, related tests 112/112, one full database run 86 files/3,564 assertions, local GoTrue/PostgREST 5/5, focused Vitest 13/13, and `npm run check`. Original F-5 concurrency, full Vitest and webpack build evidence is reused. F-6 person-based credentials, legacy Auth-ban recovery, F-1/F-2 and the Payroll advisory inconsistency remain separate. Hosted DEV must receive F-5 before this corrective migration after an exact-head preflight and separate authorization. This PR gives no Production rollout approval.

Corrective implementation commit: `6e0b72313f32f26e972d478cb815aed150d1ef53` (five source/test files). Next: focused independent review. Any push/PR or Hosted DEV application needs a separate owner decision. The documentation handoff commit follows separately; use `git rev-parse HEAD` for the branch tip.

---

## F-5 final readiness gate (2026-11-13) — BLOCKED

The reviewed implementation remains at `e1c8fd968966c44607d13ff99ea1ef3d50ad680f` before this documentation correction. A focused rollback-only probe against verified local `supabase_db_restaurant-roster` (ledger 92, latest `20261113110000`) confirmed an authenticated Organization Owner can DELETE a fresh inactive target membership and INSERT the same `(organization_id, profile_id)` with `active=true`. Both operations pass RLS. The foreign key cascades deletion of the inactive passcode credential; the replacement membership has no credential. No `member_reactivated` audit event is recorded. Under the target's authenticated identity, `private.has_org_role` changes from false to true, so organization access is regained despite bypassing `team_set_member_active`. An unrelated authenticated nonmember deleted zero rows and was denied INSERT (`42501`). All synthetic rows were rolled back. Some historical memberships can be protected from deletion by dependent RESTRICT or NO ACTION foreign keys; that does not close the fresh-membership bypass.

The existing `authenticated` INSERT/DELETE grants and `memberships_insert_manager`/`memberships_delete_manager` RLS policies permit this sequence. The unique `(organization_id, profile_id)` constraint blocks concurrent duplicates but permits delete then recreate. Registration provisions a new membership through the server. Team designation changes update roles; no delivered Team member-delete workflow was found. Direct Data API writes remain available to the authorized manager. The independent review's scoped approval preceded this reproduction and does not clear this finding.

**Decision required:** F-5 is not PR-ready under the approved transactional lifecycle contract. Owner must approve a narrow boundary change or explicitly accept the bypass. Recommended correction: keep legitimate membership creation through a controlled server/RPC path, remove direct authenticated membership DELETE, and constrain INSERT to a controlled creation path or an invariant-preserving policy. Preserve credential and audit lifecycle atomically, and verify the result with focused authenticated RLS tests. Do not alter the reviewed SQL or app code under the current authorization.

The branch was clean at the start of this gate. The full F-5 pgTAP (85 files/3,539 assertions), Vitest (305 files/4,178 passed, 7 skipped), check, webpack build, HTTP/GoTrue 4/4, and concurrency 3/3 are historical exact-implementation evidence and were not rerun. No push, PR, merge, hosted migration, global-ban cleanup, or rollout occurred. The complete PR description is withheld pending the lifecycle decision.

---

## F-5 implementation checkpoint — 2026-11-13 (supersedes earlier B1 state below)

**Local result:** F-5 implementation and regression gates are green. This is a local PR candidate only; owner PR approval and independent migration review remain before any Hosted DEV application. The older conditional notes below record the investigation before the owner approved Q1–Q4 and local migration work.

- **Recovery:** `.tmp/v2-009-f5`, `fix/v2-009-f5-multi-org-deactivation`, implementation base HEAD `5b32b75c5574a6914b1246e3ec841e6d9005f7e5`; use `git rev-parse HEAD` for the final local commit. The cumulative Stage B source remains untouched at `110ae9c7676efa48165b9e72988c5430c9d60be6`.
- **Database:** verified Docker `supabase_db_restaurant-roster`, local volume, loopback port 54322, database `postgres`, zero foreign servers, empty synthetic fixture state. Ledger was 91 with no shelved executor; migration `20261113110000_team_set_member_active.sql` was applied locally and registered as ledger 92. No reset or hosted connection.
- **Migration:** `private.team_live_session()` requires `session_id`, a live `auth.sessions` row and an unbanned actor. `public.team_set_member_active(uuid,uuid,boolean,text)` locks actor and target membership rows in profile order, rechecks Overall/organization role authority, updates the scoped credential when present, updates membership, and inserts the audit row in one PostgreSQL transaction. It never reads the target Auth restriction, returns no `auth_restricted`, and never writes Auth. Default execution is revoked; only `authenticated` receives RPC execution. Direct `memberships.active` updates are denied while authorized `roles` edits remain possible.
- **Application:** both Team routes now use the caller's cookie-bound client, map RPC errors to 400/401/403/404/500 and already-in-state to 409, and no longer perform service-role membership writes or global bans/unbans. The RPC owns the audit event. No Team UI redesign or B3 credential work.
- **Security evidence:** pgTAP `0083` 51/51; local HTTP/GoTrue 4/4; real two-connection concurrency 3/3; full pgTAP 85 files/3,539 assertions; full Vitest 305 files/4,178 passed, 7 skipped; `npm run check` and `next build --webpack` pass. The first full pgTAP run found one old Payroll fixture trying to update `active` as `authenticated`; it now performs that test-only fixture toggle as `postgres`, and focused 0010 54/54 plus the final full run pass.
- **R-2 direct probe:** after deactivating a synthetic organization membership while retaining its active location assignment, `payroll_location_authorized` returns true (advisory inconsistency). `private.payroll_can_manage_location` returns false, and an existing `payroll_settings` row is invisible under the same caller identity. No protected Payroll operation bypass was demonstrated. Track a separate defense-in-depth remediation; no Payroll function was changed in F-5.
- **Compatibility:** credential-less historical members are supported. Independent and unknown global bans remain untouched, including on reactivation; global security administration owns their review and recovery. A user with an existing session loses A and keeps B. B3 must revisit the per-organization credential update when it introduces person-based PIN credentials; F-6 remains open.
- **Next:** independent review of the actual migration/app diff, then owner approval to push/create one PR targeting `development` (relates to #257). Before Hosted DEV, provide exact-head PR CI, a backup and restored rehearsal, read-only ledger/schema preflight and an authorized global-ban inventory. Hosted DEV/Production/Neon, migration 92 executor, push, PR creation, merge, Finance/enforcement activation, and B2/B3/B4 implementation were not performed.

### Draft PR description (not posted)

**Title:** `fix(v2-009): make Team membership transitions transactional and organization-scoped`

F-5 replaces Team's best-effort membership/credential/Auth-ban sequence with one authorized PostgreSQL transaction. It preserves independent global bans and other organization access, blocks direct `memberships.active` updates, and records the audit event atomically. The caller's authenticated client invokes the RPC. Local evidence: pgTAP 85 files/3,539 assertions, Vitest 305 files/4,178 passed, focused real GoTrue 4/4, two-connection concurrency 3/3, `npm run check`, webpack build. R-2 advisory Payroll inconsistency is documented separately. Relates to #257; does not close it. Migration must precede route rollout. No hosted application is part of this PR candidate.

---

**State:** CONDITIONAL. F-5 migration/policy decision required; no PR candidate. The cumulative Stage B source branch and its evidence remain intact at `feature/v2-009-final-gate` `110ae9c7676efa48165b9e72988c5430c9d60be6`.

**Recovery:** `.tmp/v2-009-f5`, branch `fix/v2-009-f5-multi-org-deactivation`, HEAD `5b32b75c5574a6914b1246e3ec841e6d9005f7e5` (same as verified `origin/development`). Dirty files: `src/features/auth/data/member-deactivation.ts`, `.test.ts`, `tasks/current-task.md`; new `F5_ISOLATION_CHECKPOINT.md` and this handoff. No local commit, push, PR or merge. The scratch F-6 probe under `.tmp/` is ignored.

**F-5:** three focused failing tests, eight passing. Independent Auth ban is overwritten on single-org deactivation and cleared on multi-org reactivation; failed credential reactivation still activates membership. No existing ban provenance. The owner has approved separate authority for organization and global restrictions, but not the required forward migration or the associated change to Feature 017's GoTrue session-kill behavior. Exact design, grants/RLS, concurrency, legacy treatment, rollback and approval question: [F5_ISOLATION_CHECKPOINT.md](F5_ISOLATION_CHECKPOINT.md#b1-owner-approved-contract-and-migration-decision). **Do not create or apply a migration before that decision.** Keep the two original red ban tests intact.

**Independent F-5 review (2026-11-13): SAFE WITH SPECIFIC AMENDMENTS — owner migration approval required.** Contract, migration spec, tests and owner questions Q1–Q4 are in [F5_MIGRATION_CONTRACT.md](F5_MIGRATION_CONTRACT.md); it supersedes the step-3 ban-check design in the checkpoint. Worktree still dirty and uncommitted (same three files, nothing edited). Reviewed: `member-deactivation.ts/.test.ts`, both Team routes, `current-user.ts`, `require-live-session.ts`, `payroll-actor.ts`, `has_org_role`, memberships RLS/grants, kiosk live-session helper, audit trigger, local catalog queries (ledger 91). Not repeated: all Stage B campaigns, hosted reads. Next exact action: owner answers Q1–Q3 (and names Q4's owner), then separately authorizes Codex to write the migration. Prohibited until then: SQL, app/test edits, push/PR, hosted/Neon, B2/B3/B4.

**F-6:** CONFIRMED locally with synthetic four-digit PINs and real local GoTrue/PostgREST. A profile can hold two active organizations; a second credential with the same Auth email hits `23505`, an alias email does not authenticate, and rotating the account-wide password to B's organization-derived value breaks A's sign-in. Two people can share the PIN in different organizations. Synthetic residue zero. B3 designs person-based credentials and the post-login gateway; no credential reset, gateway or role change in B1.

**Tests/evidence:** baseline F-5/domain 20/20 before new regressions; current focused F-5 8 pass/3 fail; `npm.cmd run check` passes after the third test, and the prior webpack build passed with unchanged application code. Stage B's 67/67 pgTAP, 64/64 role matrix, 3,555 full pgTAP and 4,172 Vitest are reusable only for unchanged behavior. Local target was `http://127.0.0.1:54321`, Docker `supabase_db_restaurant-roster` (ledger 91/latest `20261113100000`); no tunnel or hosted target. No isolated HTTP F-5 retest until a candidate exists.

**Next:** owner approves or rejects the exact F-5 migration/session contract. If approved, implement the single vertical slice, test red-to-green locally, review, and commit. V9-F5 delivery authorization is separately required before pushing or creating a PR. B2 can proceed independently. B3 must preserve the Overall/organization/location role layers and reconcile ambiguous legacy mappings, with negative escalation tests. F-1/F-2 remain separate migrations; F-3, V9-T and D-11 remain separate decisions.

**Forbidden:** no Stage B cumulative push, migration 92, Hosted DEV/Production/Neon access, deployment, Finance/enforcement activation, GitHub release setting or issue #257 change. Do not repeat the broad Stage B campaigns without a concrete authorization change.

---

## Stage D3A — Production release blocker resolution and cutover preparation

**Verdict: D3A BLOCKED — RELEASE SAFETY ISSUE.** The Storage recovery gap is closed, and trusted PIN request attribution has a local candidate. A schema-first release remains unsafe until a tested traffic **and direct-database writer** fence, serialized migration/deployment governance, distributed PIN abuse defense, and Overall Owner step-up are in place. D3B is not authorized or ready.

### Evidence and private artifacts

- Production snapshot and migration rehearsal from D2 remain authoritative and unchanged: 62 → 97, 35 migrations, excluding shelved `20261113120000_v2008_track2_backfill_executor.sql`. The existing DPAPI and portable database ciphertexts were not regenerated.
- With explicit one-time owner authorization, retrieved exactly 76 inventoried private `recipe-images` objects via GET-only requests. Reused 0; downloaded and verified 76/76, 7,958,106/7,958,106 bytes. Inventory size and MD5-shaped object eTags matched downloaded content; every saved file was read back and SHA-256 hashed. The owner-only `storage/recipe-images/` tree preserves bucket keys. `storage-download-receipt.json` records each key and digest.
- `storage/portable-encrypted/recipe-images-76.zip.gpg` is a passphrase-controlled OpenPGP AES-256/OCB archive. Decryption round trip, 77 ZIP entries (76 files plus receipt), each entry size/hash, and ciphertext SHA-256 passed. `storage/portable-encrypted/storage-archive-receipt.json` and existing `recovery-manifest.json` now record completion. Limit: the snapshot inventory and object retrieval were taken at different times; post-snapshot writes are outside this recovery point. The passphrase remains owner-held.
- Private `future-identity-assignment-manifest.json.dpapi` contains exact Auth/profile/org-membership IDs and River Oaks location ID for all 11 unique active joins, proposed roles, pending approvals, drift checks and failure actions. Private `future-raj-overall-owner-bootstrap.sql` is an **unexecuted** guarded, idempotent, audited operator procedure with approval/operator placeholders. Both are in the owner-only D2 backup directory. No identifiers are published in Git. Raj's existing owner membership and credential were verified in the snapshot; they must be checked again live at execution. The script records the privileged operator in the audit reason, never misattributes the action to Raj. No assignment was made.

### Compatibility and security decision

- **Option A: controlled quiesced cutover is the preferred design, not yet proven.** Old `main` can create a legacy credential without the global PIN registry, use the old Team deactivation path, and assume broad `shift_manager` Payroll access despite schema 97's narrower policy. Another 27 removed and 40 changed policies and membership-write grant changes leave other write paths unproven at runtime. A maintenance page or Vercel domain switch cannot prevent direct Supabase writes with existing JWTs or old deployment URLs. If a rehearsal cannot enforce both ingress and database writer isolation throughout migration/bootstrap/new-app validation, Option B requires a reviewed old-main compatibility bridge; neither route currently satisfies a Production GO gate. Local Docker was unavailable in D2b; no runtime compatibility PASS is claimed.
- B5's `reserve_global_pin_attempt` uses central PostgreSQL quotas across Vercel instances: 8/15 minutes per hashed ingress address, 3/hour for registration, and a global threshold that tightens unknown-client quotas. This does **not** bound many-IP distributed abuse. Require a reviewed edge challenge/admission policy and focused hostile-client validation before release. No new paid provider was chosen.
- Local branch `feature/v2-d3a-trusted-attribution`, worktree `.tmp/v2-d3a-security`, starts at accepted `ec06ce95faa8d6bf0f8127b2a92b3bb2a8818ad4`. A shared helper accepts only Vercel's validated `x-vercel-forwarded-for` in Vercel runtime, rejects malformed/multiple values, and uses conservative `unknown` outside a trusted Production boundary. Global and legacy PIN fingerprints use it. Focused tests 17/17, targeted lint and typecheck passed. The accepted kiosk pairing code already follows this platform-header contract. This is an uncommitted candidate for owner review, not an edge-abuse fix.
- Sensitive Overall Owner grant/revoke, organization ownership/creation, credential recovery and cross-organization administration require a step-up stronger than a four-digit PIN. Existing policy/provider/enrollment/recovery choices are not approved; no weak second-PIN scheme or new authentication architecture was added. Hold these operations and Production release until the owner selects an approvable mechanism and it is implemented/tested.

### Identity and owner holds

- Raj: proposed platform Overall Owner **in addition to** existing The Monk's Org Owner. Future operator must compare live Auth ID, profile, active owner membership, active credential and schema 97 with the private manifest, confirm explicit owner approval and operator identity, execute the one-transaction bootstrap, and verify one Overall Owner row plus audit. Ambiguity or drift aborts with no write; transaction failure rolls back. A post-commit incident needs an approved forward-fix/restore plan, not an unaudited deletion.
- All 11 River Oaks location assignments remain **pending**. Proposed roles: Raj retain owner + Overall Owner; Anil/Saima/Taniya Manager; Conan Assistant Manager; BHOOMII/Sidhu/Tom Staff; TestOwner Manager; TestManager Manager; TestStaff Staff. Preserve current org memberships and credentials. Tom's account purpose and all test-account retention need owner decisions. TestOwner currently has Org Owner: do not downgrade without express approval. No Liquor Tap assignment/provisioning.
- **Conan Payroll reduction — OWNER APPROVAL REQUIRED:** schema 97 changes visible periods 24→2, payments 21→3, adjustments 3→0. Recommend retaining the narrower Assistant Manager scope unless the owner expressly approves a separate sensitive-Payroll authority policy. No Payroll RLS change.

### Required governance and D3B runbook (prepared, unexecuted)

1. **Before any merge:** owner selects eligible commercial hosting and a quiescence mechanism; configures GitHub `main` PR review, required exact-head checks, no direct/force pushes and no admin bypass; adds a Production environment reviewer, prevent-self-review and `main` branch restriction, subject to the repository plan. Replace `.github/workflows/database.yml`'s automatic `push: main` migration job with an explicitly approved, SHA-pinned `workflow_dispatch` job. Keep local database tests PR-only, make Production migration concurrency non-cancelling, assert `SUPABASE_PROJECT_ID = ftadewtkjlaotfdvtjcv` and expected ledger 62/pending 35 before `db push`, and compare the checked-out commit to the owner-approved release SHA. Review these changes as a separate release-control PR. No settings changed in D3A.
2. In Vercel team `onepiece11`, disable automatic Production **domain assignment** for `main`; stage an exact-SHA Production build and promote only after schema/bootstrap checks. Auto staging by itself still creates a reachable deployment URL. Choose and rehearse a project-wide edge **deny** with a narrow operator verification path, or equivalent, covering the production domain, APIs and historical/generated deployment URLs. A solvable challenge is insufficient for maintenance isolation. The documented All Deployments protection may require an eligible paid capability; check effective plan and configuration. Prove the operator's isolated verification route separately.
3. Establish a **direct Supabase write fence** for ordinary JWT clients, service-role jobs, external writers, kiosks and stale clients; inventory writer sources and test the fence on an isolated restore. A Vercel-only rule cannot close this route. Pause cron/background jobs, freeze credentials/sessions and prohibit old `main` API/registration/Team writes. Capture live no-write evidence and exact current refs; abort if any writer remains reachable. This mechanism has not been designed or tested in D3A and is the primary release safety blocker.
4. Owner supplies a dedicated Production `KIOSK_SESSION_SECRET` (server-only Secret, at least 32 characters, independent of `APP_PIN_PEPPER`), verifying presence without revealing value. Preserve the current pepper because existing credentials depend on it. Confirm Vercel system environment exposure (`VERCEL=1`) and its trusted forwarding-header contract at runtime. Test physical touch/keypad, pairing, inactivity, privacy/session renewal, revocation and print on the actual device; reuse prior browser evidence.
5. Under a separate D3B authorization and enforced fence: take a fresh coherent recovery point for DB and Storage; verify hashes and restore path; pin accepted source and migration list; run only the 35 approved migrations to ledger 97, verify grants/RLS and schema. Apply separately approved Raj/11-location operations only after exact live identity checks, with audit and postconditions. Stage the exact new Production build, verify its project binding and critical PIN/Team/Payroll/kiosk paths with controlled operator traffic, then promote and release the fences in a deliberate order. Watch error rates, unauthorized writes and role/credential state. Stop on ref drift, missing approval, schema or identity mismatch, failed fence, failed migration, lost recovery material or smoke failure.
6. Recovery: while fenced, stop jobs and promotion, retain audit and failure evidence, use the verified DB/Storage backup and a separately approved restore or forward fix. Vercel rollback changes application routing only; it cannot reverse schema 97, new credential state or role writes, and old `main` must never resume against incompatible schema. Keep ingress/writer fences until a schema-compatible app and data state are verified. Do not treat the D2 snapshot as a current cutover recovery point.

Owner decisions still required: release fence and governance implementation; Conan Payroll scope; Raj bootstrap and 11 location assignments; TestOwner downgrade, Tom/test accounts; credential recovery and forward-fix policy; commercial Vercel plan/alternative; physical-device acceptance. Vercel's current Hobby terms restrict use to personal/non-commercial purposes. No Production/DEV write, settings change, deployment, merge, push, full suite, CI rerun or backup deletion occurred in D3A.

Platform capability references: [Vercel request headers](https://vercel.com/docs/headers/request-headers), [Deployment Protection scope and plan limits](https://vercel.com/docs/deployment-protection), [staged Production promotion](https://vercel.com/docs/deployments/promoting-a-deployment), [WAF custom rules](https://vercel.com/docs/vercel-firewall/vercel-waf/custom-rules), [Hobby terms](https://vercel.com/legal/terms), [GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches), and [environment reviewers/plan limits](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments). These describe available mechanisms; the project's effective settings and a safe end-to-end release fence remain unverified.

---

## Stage D3A.1 — release isolation and manual workflow candidate

**Verdict: PARTIAL — SPECIFIC IMPLEMENTATION GAPS REMAIN. D3B NOT AUTHORIZED — NO PRODUCTION GO.** The existing D3A backup, identity files and accepted migration rehearsal are reused unchanged. Refs remain `origin/development = ec06ce95faa8d6bf0f8127b2a92b3bb2a8818ad4` and `origin/main = 5e5b7747693b6e81014eafdf299b87e56c3f033d`. The code worktree remains local and uncommitted.

### Writer paths and isolation contract

| Writer path | Proposed operator control | Local proof | Required live proof |
|---|---|---|---|
| Production alias, API and browser | Project-wide Vercel WAF deny, with a narrow operator verification path; hold automatic domain assignment | Synthetic denied state only | Denied on all hostnames, methods and paths, including API and new staged build |
| Historical/generated deployment URLs | Same project-wide edge deny; disable main build while landing the new workflow | No provider proof | Probe old/current/generated URLs from outside operator access |
| Direct Supabase REST/GraphQL and existing JWTs | Temporarily disable the Data API; do not count JWT revocation as an immediate fence | Official capability documented; synthetic stale-client denial | Confirm authenticated old JWT cannot mutate tables/RPCs; confirm operator can still migrate |
| Private recipe Storage | Temporarily deny authenticated image INSERT/DELETE through an audited, reversible policy/permission procedure | Existing migration shows these paths are writable; no local DB test | Confirm old JWT cannot upload/delete; record and recheck exact policy restoration |
| Auth and registration | Edge deny old app; disable new Auth signups; separately account for Auth user-update endpoints | Source and provider capability identified | Prove old app/admin and direct Auth mutation paths closed or explicitly contained |
| Kiosks/shared devices | Edge deny plus Data API/Storage fences; stop physical devices | Existing kiosk tests reused | Actual device cannot mutate during maintenance; sessions remain unusable for writes |
| `pg_cron` and other jobs | Pause the known `table_rotation_board_events_retention` job and inventory any additional jobs | Source shows the one scheduled deletion job | Query live job/activity state and restore exactly after acceptance |
| Service-role/external writers | Identify every key holder, pause integrations and jobs; restrict direct DB connections if relevant | No privileged-writer inventory proof | Verify no active unpaused writer, including clients bypassing Vercel |

**Strategy A remains a candidate, not a proven safe fence.** The actual Data API toggle covers the Data API only; it does not protect Storage, Auth, Realtime or direct Postgres by itself. Vercel Hobby has WAF custom rules, but current project rules, all-URL reachability, operator bypass and the precise reversible Storage/Auth restrictions still need live rehearsal. If any path cannot be closed, use Strategy B: a narrowly reviewed transition bridge for legacy registration/global PIN state, Team deactivation and Payroll policy, plus runtime tests of the other changed grants/policies. That bridge is not implemented, so neither strategy is release-ready.

### Local release-control change set

- On `feature/v2-d3a-trusted-attribution` at `.tmp/v2-d3a-security`, `.github/workflows/database.yml` removes automatic `push: main` migration execution. PR-only ephemeral database validation remains. The `workflow_dispatch` Production job uses the `production` environment, exact `main` SHA and matching owner-set approval variable, an owner-reviewed isolation receipt digest, fixed Production ref `ftadewtkjlaotfdvtjcv`, a hash-pinned set of the exact 97 approved migration files, and an exact remote 62-row ledger precondition. After `db push`, it checks all 97 versions. A wrong project, branch, SHA, file, receipt, or ledger fails before migration. The beta Management API read-only ledger response must have the expected shape or the job stops.
- Production migration concurrency uses one fixed group and `cancel-in-progress: false`: a second dispatch queues without interrupting an active migration. No job step opens traffic. A failure leaves external fences in the operator's blocked state; the workflow cannot itself prove or control them. The owner must configure GitHub Production reviewers, prevent self-review, main-only deployment branches, `D3B_APPROVED_RELEASE_SHA` and `D3B_APPROVED_ISOLATION_RECEIPT_SHA256`, plus protected `main`; with approval variables absent, the job fails closed. Never set those variables merely to satisfy the guard without reviewing live fence evidence.
- Initial workflow bootstrap: **before merging the workflow to default `main`**, the owner must stop automatic Vercel Production assignment and suppress an automatic main build or enforce project-wide WAF denial of any generated build URL. Only then merge the reviewed workflow. GitHub dispatch is available from default branch after merge; it is not an initial bootstrap mechanism before that merge. Keep old app on schema 62 and all writes fenced until the new workflow is present and release authorization is separately granted. If these pre-merge controls cannot be established, use a separately approved out-of-band operator process instead; do not merge and hope the race resolves.
- Future D3B order: (1) owner/provider configure and independently probe every ingress and direct-writer fence; (2) capture a fresh coherent DB/Storage recovery point; (3) approve exact main SHA and isolation receipt, then manually dispatch the guarded 62→97 migration; (4) verify ledger/grants/RLS and separately approved Raj/location operations; (5) stage the SHA-exact Production build without domain assignment and inspect its Production binding; (6) run critical operator-only PIN, Team, Payroll and physical-kiosk checks; (7) promote the staged build, then deliberately remove each fence and watch for unexpected writes/errors. On any failure, do not reopen; a rollback of Vercel routing alone cannot make old `main` compatible with schema 97.
- The trusted attribution candidate is preserved, with one targeted IPv6 canonicalization correction so alternate spellings share a quota fingerprint. Global and legacy PIN paths use the validated Vercel header; kiosk code is unchanged. Focused Vitest 18/18, local release guard tests 3/3, changed-file Prettier/ESLint and TypeScript typecheck passed; `git diff --check` passed. The local simulation covers unauthorized/wrong-project/wrong-SHA/wrong-ledger rejection, non-cancelling overlap, no automatic reopening, and an obsolete client blocked by modeled Data API/Storage fences. **OWNER CONFIGURATION / LIVE PROOF PENDING** for provider enforcement. No full suite, CI, build or 35-migration replay ran.

### Security decisions that cannot be declared complete locally

- B5 already uses central PostgreSQL admission. Many-IP guessing remains possible. The minimum existing-provider candidate is a Vercel WAF rule on the shared universal/legacy `POST /api/auth/passcode` path, keyed by the platform's JA4 digest rather than a caller-supplied device ID, with an IP companion threshold or challenge for suspicious traffic and separate registration coverage. Hobby documents one rate-limit rule, IP/JA4 keys and usage-based pricing after included requests. A JA4 key can also group legitimate restaurant devices or be changed by capable attackers; an API challenge may disrupt normal `fetch`. Owner must approve the policy and commercial plan, then test shared-device false positives and distributed hostile clients before this gate closes. No WAF setting was changed.
- Supabase Auth TOTP is an existing, no-new-provider second factor, but Raj's factor enrollment, secure recovery and privileged-operation scope require owner policy. Recommended sequence: in-person identity proof; Raj enrolls and verifies a TOTP factor on his existing Auth account before Overall Owner bootstrap; verify fresh `aal2`, recent MFA `amr` and live session on every sensitive server action; enforce the same requirement inside direct-callable organization/ownership/credential RPCs or RLS, not just in UI. Use short elevation, single-use challenges, audit events, factor revocation and a two-person offline recovery procedure. The current schema-97 RPC/RLS contract lacks those checks; a real DB enforcement migration would create a **revised target beyond 97** and require a focused new rehearsal/owner approval. No step-up code or migration was added, and this gate remains OPEN.

### Owner holds and next corrective work

| Item | Proposed disposition | Hold |
|---|---|---|
| Raj Overall Owner | Use the existing exact-ID, audited bootstrap after verified TOTP and separate authorization | Approval and step-up gate |
| Eleven River Oaks assignments | Use the existing private DPAPI manifest after live recheck | Approval; TestOwner downgrade, TestManager/TestStaff and Tom disposition |
| Conan Payroll | Retain narrower Assistant Manager scope | Owner must accept measured 24→2, 21→3, 3→0 reduction |

Production team `onepiece11` is confirmed on **Hobby** with `main` automatic domain assignment enabled. Hobby terms restrict commercial use, so the owner must choose an eligible plan or host before restaurant Production use; no purchase was made. `KIOSK_SESSION_SECRET` remains a future owner-controlled, server-only Production secret (minimum 32 characters, distinct from `APP_PIN_PEPPER`): generate it in an owner-controlled password manager, enter it directly as a sensitive Production variable, verify **name/presence only**, and exercise a staged Production runtime plus the actual kiosk without logging the value. Before D3B: prove the complete external fence and its recovery path, complete PIN edge admission and Overall Owner step-up, configure protected GitHub/Vercel controls, approve the identity/Payroll holds, take a fresh coherent recovery point, and sign off on physical hardware. No Production/DEV write, provider configuration, deployment, main merge, backup regeneration or D3B operation occurred.

Provider references: [Supabase Data API disable scope](https://supabase.com/docs/guides/api/securing-your-api), [Auth signup control](https://supabase.com/docs/guides/auth/general-configuration), [Supabase TOTP/AAL2](https://supabase.com/docs/guides/auth/auth-mfa/totp), [Vercel WAF rules](https://vercel.com/docs/vercel-firewall/vercel-waf/custom-rules), [WAF rate-limit Hobby limits](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting), [staged Production deployment](https://vercel.com/docs/deployments/promoting-a-deployment), and [Vercel Hobby terms](https://vercel.com/legal/terms).

---

## Stage D3A.2 — lean release hardening

**Verdict: PARTIAL — specific technical gaps remain; no Production GO.** The accepted development/main refs and both existing dirty worktrees were preserved. The owner accepts Conan's narrower Assistant Manager Payroll visibility (24→2 periods, 21→3 payments, 3→0 adjustments) as the V2.0 target; Raj remains the intended future Overall Owner on his existing Auth identity, organization membership and PIN. Existing identities/memberships stay in place. TestOwner, TestManager, TestStaff and Tom receive no unapproved privilege change; Tom's purpose remains open. Liquor Tap and #332 remain deferred.

### Local controls prepared

- The existing manual migration guard now also requires the owner-approved environment value `D3B_APPROVED_ENVIRONMENT=production`, in addition to exact manual event, main SHA, Production ref, isolation receipt, migration-file hash and 62→97 ledger. The GitHub job still requires the `production` environment and non-cancelling concurrency. Keep this variable scoped to the protected Production environment; configure one required owner/operator review, main-only restriction and protected `main`. The public repository's visibility was confirmed read-only; [GitHub documents environment reviewers for public repositories on current plans](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments) and [public branch protection on Free](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches). Actual settings were not inspected because authenticated GitHub API access returned 401. No push, workflow run or GitHub setting change occurred.
- New `vercel.json` sets `git.deploymentEnabled.main=false`, preserving other branches' default behavior. [Vercel documents this option](https://vercel.com/docs/project-configuration/git-configuration). It is local source only. First-release bootstrap: owner disables Production auto-domain assignment in Project Settings → Environments → Production → Branch Tracking, then lands **only** the `vercel.json` change on schema-62-compatible `main` (the old database workflow does not trigger on this file). Verify with a harmless later `main` push that automatic Git builds are suppressed before merging any schema-97 application or workflow code. A failed check stops the release; generated URLs must be accounted for. Later stage an exact-SHA Production build with no domain assignment and promote it only after schema/identity checks. No such merge or provider action occurred. [Staged-deployment procedure](https://vercel.com/docs/deployments/promoting-a-deployment).
- Targeted local release-guard tests **3/3 PASS** check wrong environment, source/project/ledger drift, non-cancelling overlap, denied stale client writes and a modeled authorized operator path. These are synthetic assertions only; the workflow has no traffic-reopening step. The real Vercel, Supabase and privileged-writer fences remain unverified.

### Minimum maintenance and compatibility contract

The short after-hours Strategy A cutover still requires, for its entire duration: project-wide deny of old Vercel pages/APIs and historical deployment URLs with a narrow operator path; verified Data API denial for existing JWTs; separate Storage INSERT/DELETE denial; Auth signup and credential-mutation containment; kiosk stop/denial; paused `table_rotation_board_events_retention` and any other jobs; and a complete pause or restriction of service-role/direct-DB writers. The [Data API toggle](https://supabase.com/docs/guides/api/securing-your-api) does not fence Auth, Storage or direct Postgres. Provider-only controls, reversible restoration and controlled operator verification must be probed later under separate authority. Until every path is proven, Strategy A is **not release-safe**.

If a path cannot be fenced, the smallest Strategy B bridge must first run safely on schema 62 and prevent legacy registration from producing credentials outside the new global registry, old Team deactivation from bypassing its audited credential lifecycle, and old-main Payroll assumptions from granting the wrong access. It must be deployed and tested before the 62→97 migration; simply showing maintenance in the new app is insufficient. No such bridge was implemented or deployed. If neither fence nor bridge can be proven, keep the release blocked.

### PIN and Overall Owner decisions

- Proposed **single** Vercel WAF rate-limit rule: in project `the-lineup` → Firewall → Configure → New Rule, match Method `POST` AND Request Path regex `^/api/auth/(?:passcode|register)$`, counting key **JA4 Digest**, Fixed Window **60 seconds**, limit **30 requests**, over-limit **429**. Start in Log to observe genuine shared-device volume, then enable 429 only after a controlled test of 30 allowed/31st blocked requests, normal shared-device sign-ins and a rotating-IP synthetic attack. The same `/api/auth/passcode` route handles universal and legacy entry; registration has its own stricter database quota. No identity-specific match or response is involved. Hobby currently permits one rate-limit rule; counts are regional and JA4 can group legitimate devices or vary under attack. Rule remains **OPEN** until owner configures it and verifies behavior and pricing. [Vercel rule operators](https://vercel.com/docs/vercel-firewall/vercel-waf/rule-configuration), [rate-limit limits and caveats](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting).
- A no-migration, application-only Overall Owner hold is **not safe**. `overall_roles` client writes are already denied, but schema 97 grants authenticated users direct `provision_organization` execution, `organizations` INSERT for Overall Owner, and `memberships.roles` UPDATE under RLS. A browser UI or Server Action lock cannot stop direct RPC/Data API calls after reopening. The PIN-reset route also uses service-role authority for cross-organization recovery. To let Raj perform ordinary work while freezing especially sensitive acts, propose one reviewed **post-97 forward migration** that blocks organization provisioning, direct organization creation and top-level ownership changes at SQL/RLS/RPC boundaries while preserving ordinary Team operations; pair it with a server-route hold for cross-organization credential recovery and focused direct-JWT negative tests. Overall-role grants remain operator-only via the existing audited bootstrap. This would revise target ledger **beyond 97** and require an updated manifest, focused restore/rehearsal and owner approval. No migration or partial TOTP/UI hold was added. Supabase TOTP/AAL2 remains the longer-term step-up design. Until that backend hold or fully enforced step-up exists, the sensitive-action gate stays **OPEN**.

Next, obtain owner approval for the exact backend hold/migration and provider setting window; implement and test that hold; then prove the complete writer fence or schema-62-compatible bridge, configure the single PIN rule and simple GitHub/Vercel controls, and accept the physical kiosk. A fresh coherent DB/Storage backup is needed once immediately before the separately authorized cutover. Existing encrypted recovery artifacts are preserved. No Production/Hosted DEV write, provider configuration, deployment, main merge, Storage download, repeat migration rehearsal or full CI/test campaign occurred in D3A.2.

## V2.0 integrated release candidate — 2026-11-15

This section supersedes D3A.2's proposed `vercel.json` Git-deployment suppression and ledger-97 target. The owner permits automatic builds with staged Production domain assignment. The local `vercel.json` suppression was removed. Vercel's documented Production auto-assignment toggle supports an unaliased staged build; the authenticated `onepiece11` CLI confirmed project `prj_vIbup0LAziHwNv1cbJ5sUSxqaoaJ` and an unconfigured live firewall. No provider setting changed.

The candidate adds forward migration `20261115143609_v2_009_sensitive_action_hold.sql`, bringing the exact manifest to **98** migrations (Production remains at **62**). Database triggers reject organization create/delete, Overall-role writes and Organization Owner membership changes for all ordinary/JWT/service-role sessions; only a direct `postgres` operator session without `auth.uid()` may perform the separately audited Raj bootstrap. Authenticated organization provisioning grants are revoked. Ordinary Team designation and staff assignment remain available. The passcode reset route now rejects multi-organization, Overall-role and Organization Owner target recovery and fails closed on sensitive lookup errors; same-organization staff recovery remains available. No new table or generated type is required.

Focused verification: migration 98 applied once to a disposable, no-network, tmpfs Postgres 17.6.1.166 container populated from the existing D2 Production backup; `0089` pgTAP passed **13/13**. Pre/post aggregate rows remained `auth.users=11`, `profiles=11`, `organizations=1`, `memberships=11`, `overall_roles=0`. The container was destroyed and temporary plaintext source files removed; existing encrypted backups were unchanged. The same 13/13 test and the affected historical organization-model suite 31/31 passed in rolled-back local transactions. The disposable restore's unavailable GraphQL extension ACL produced four non-core ACL errors; the focused schema/data/authorization checks passed. The previously rehearsed 35 migrations were not replayed.

**Production gate remains closed.** A Vercel WAF deny and Data API disable do not close direct Supabase Auth credential updates; Auth signup control covers only new users. An enforceable, reversible credential-mutation fence or a validated narrow compatibility protection, along with Storage and privileged-writer isolation, is still required before migration. Do not claim provider configuration or a PIN edge rule is live. The existing 76-image backup remains valid. Fresh coherent encrypted database/Storage recovery belongs immediately before actual cutover. The Raj bootstrap's historical private SQL header still expects ledger 97 and must be reconciled to 98 in the owner-only backup directory before execution; it has not been run. No Production/DEV writes, migration, identity assignment, deployment, main merge or new backup occurred in this pass.

Changed-code final pass: affected Auth/attribution Vitest 24/24, release guard 3/3, organization-model pgTAP 31/31, targeted Prettier/ESLint, TypeScript and `git diff --check` passed. GitHub PR CI is the one remaining integrated validation gate.

## Final owner policy correction — 2026-11-15

The owner expressly accepts four-digit PIN authentication for Overall Owner and rejects an added step-up or backend restriction solely for that risk. This supersedes the D3A.1/D3A.2 sensitive-action gate and the preceding integrated candidate's migration-98 and privileged-recovery holds. The candidate now retains the existing schema-97 authorization model: migration `20261115143609` and its pgTAP test were removed; the passcode reset route and historical organization-model expectations were restored. The exact release manifest and manual guard target **62→97**, excluding the shelved executor. Raj bootstrap's existing private ledger-97 script again matches the intended target, subject to live exact-ID checks. The old-writer maintenance fence, coherent cutover backup, reviewed integration, and staged Vercel promotion remain release requirements for migration compatibility and recovery. No Production write occurred in this correction.
