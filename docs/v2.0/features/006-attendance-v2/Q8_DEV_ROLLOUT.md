# V2-006 owner-authorized DEV rollout

2026-11-10: **DEV validation PASS; staged scope ready for integration.** The
single feature PR into `development` must pass all CI and Preview checks before
merge. GitHub's PR/merge record is the integration receipt. Issue #254 may close
only after that merge. Native financial activation is **OFF**; backend module
enforcement is **STAGED**. Production and `main` were not contacted or changed.

## Authorization and scope

The owner explicitly approved Q8: DEV identity verification, recoverable backup,
isolated recovery, representative migration rehearsal, four hosted migrations,
authenticated/browser acceptance, operation-created synthetic cleanup, existing
branch push, one PR and merge to `development` after mandatory checks/reviews.
Staged closeout with native financial activation OFF was explicitly accepted.

Manual source transitions on the first **location-local calendar day** of a
payroll month and scoped organization/assigned-location manager classification
are approved, subject to existing safety checks. No extra Shift Manager authority
was granted. Q5/Q7, native financial activation, real payments, backend enforcement
activation, Production, main and protection bypass remain outside authorization.

## Backup and recovery before migration

Verified `opmujepkemwcdxxorhfd`, `the-lineup-dev`, us-east-2, ACTIVE_HEALTHY,
PostgreSQL 17.11.0.003. Actual starting ledger: 82, latest `20261109120000`.

Fresh encrypted backup `dev-20261110T183251Z.zip.dpapi`, 445,718 bytes, captured
18:31:37–18:32:51 UTC. SHA-256:

```text
40e5f3cd9d47ce4bfeb94fb70723bb8a4dea1925c5c63d9119f572c01f27400f
```

Owner-only private destination: `%LOCALAPPDATA%\TheLineup-DEV-Backups\V2-006-20261110`.
Six dump components plus manifest were decrypted and hash-verified. Retain for
at least seven days after successful DEV acceptance (through 2026-11-17 UTC);
preserve earlier backups. Recovery uses the same Windows owner profile/machine
(DPAPI CurrentUser). It does not restore Storage object bytes, platform settings,
login passwords or external secrets. Storage has 34 object metadata rows; Vault
has zero secrets. This is qualified database recovery, not a full service clone.

Isolated restoration used the exact PostgreSQL image, no network/published ports
and RAM-backed PGDATA. All **111 table counts**, public/Auth/Storage FK checks,
identity orphan checks and canonical functions/policies/grants matched DEV at 82.
All four exact migrations then passed against representative locked legacy
Payroll, confirmed payment, adjustment, rates and finalized Tips. Financial
fingerprints were unchanged (only additive source/identity fields excluded from
the two affected legacy table projections). This fixture existed only in the
isolated recovery database. It proves populated compatibility without altering
confirmed hosted records.

## Exact deployment

Pinned Supabase CLI 2.76.8, explicit DEV link and dry-run listing exactly these
four hash-verified repository files. No seeds or unrelated migrations applied.

| Migration                                                  | SHA-256                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `20261110000000_attendance_v2_foundation.sql`              | `40bb802beb7ff13a70820d274794d15da2107c3bfdaa78a2439fe0dbd024c63e` |
| `20261110010000_attendance_corrections.sql`                | `a7556ae715e2d34ff712eee7940e38e90e7e6c3a7a1ec8c49f1032f5ca8bdb15` |
| `20261110145124_attendance_native_payroll_identity.sql`    | `fb0fe460b803fab6459a101bc63ce990786755871631ac5bd36eda40fb610381` |
| `20261110160147_attendance_native_confirmation_guards.sql` | `8519df2bd5f325890150bd1a682a630f896d095848673463498bc76821686192` |

Hosted DEV now has **86** ledger entries, latest `20261110160147`. Canonical
functions, policies, table grants, RLS flags, indexes, validated constraints and
ledger match the rehearsed result exactly. No financial activation or enforcement
setting changed. Hosted Payroll/Tips contained zero historical rows at baseline;
do not misrepresent this as a populated hosted financial-history test.

## Authenticated acceptance

**26 checks PASS** using five operation-created Auth users, two synthetic tenants
and six synthetic locations. Actual JWTs prove owner/assigned-manager authority,
anonymous/foreign/staff denial, self isolation, Overall actor behavior, retry
idempotency, open-session transition refusal, unresolved payable NULL, audited
classification/correction, stale version rejection, direct forged snapshot and
consumption write denial, disabled clock refusal and immediate revocation.
Native generation refuses with activation OFF. A synthetic legacy Neon-shaped
locked snapshot and staff self-read retain compatibility; no payment was created.

Desktop 1280×800 Chromium, tablet 820×1180 WebKit and mobile 390×844 Chromium each
passed the real DEV report, timezone/readiness, reason/review/save correction,
disabled/external/unconfigured rendering, legacy Payroll snapshot view and staff
self-only view. Browser runtime had no Neon credential; no external Neon database
was contacted. These are DEV-backed local application tests; hosted Preview
acceptance is a separate delivery gate.

The WebKit run exposed a 19px page overflow from an absolute, visually hidden
table column label. Positioning the existing scrolling wrapper contains it while
preserving the accessible label and table scrolling. Fully loaded WebKit geometry
now stays 820px wide. The existing local browser scenario includes this regression
assertion. A cold-load harness timeout was raised to accommodate real hosted
round trips; the application did not change for that harness issue.

## Delivery and deferred scope

Prior local review/repairs remain in `FINAL_CONSOLIDATED_CLOSEOUT.md` (historical
missing-Q8 statements are superseded here). Local closeout `3cca2ed` preserved:
pgTAP 3,079, JWT 12, concurrency 25, Attendance browser 42, Payroll browser 15,
types/check/build. After the containment fix Vitest again passed 3,837 with seven
existing skips; `npm run check` and production webpack build passed. The existing
manager correction scenario passed with the new overflow assertion in WebKit
(1/1); the local tablet project now explicitly selects WebKit. Exact-head remote
CI receipts belong to the feature PR. No new database change followed the four
approved migrations.

Preview project `prj_vIbup0LAziHwNv1cbJ5sUSxqaoaJ`, team
`team_i8igGalPA54kRnKVsTRPVErz` was verified through existing CLI access. Both
inherited Preview and `development` overrides bind the public Supabase URL to
DEV and demo mode false; no feature-specific overrides exist. The connectors lack
team/write scope, so the existing authenticated CLIs perform authorized delivery.
GitHub reports development has no classic protection or active branch rules;
all application/browser/database/Vercel checks are still mandatory.

- [#319](https://github.com/KrapaGoutam/The-Lineup/issues/319): native Payroll manager/staff UI, identity-aware periods/rates and guarded operations. Current Payroll UI remains Neon-oriented.
- [#320](https://github.com/KrapaGoutam/The-Lineup/issues/320): native financial activation readiness, Q5/Q7 and operating policies; Tips warning-only dependency, DST ambiguity, module-off recovery and self-RLS roster ordering. This grants no activation authority.
- Existing #255/#256/#257 and #304 retain kiosk, compatibility, release and backend-enforcement scope. They were not started or closed by this operation.

Private handoff receipts contain encrypted-backup/recovery results, canonical
catalog comparisons, exact CLI logs, fixture manifests and authenticated/browser
results. They contain no committed credentials or generated artifacts. Cleanup
and final integration receipts must be recorded before final closure.
