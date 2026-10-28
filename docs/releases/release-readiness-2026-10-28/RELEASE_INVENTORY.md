# Release inventory — `main` → `development` (2026-10-28)

## Manifest

```text
Current Production:   main @ d08eb4e0b7331859b0f80d4ad89c2a15c9db71be
Candidate:            development @ efd7d4cbcd06a32956ca5d0411687fb2d7f96e12 (code state)
Merge base:           68ef9447b37a5cc65432ca9aa9e01a2ec817c36c
Ahead / behind:       105 ahead (58 non-merge commits: 43 KrapaGoutam, 15 Claude) / 1 behind
Changed files:        264 (+62,197 / -532): src 161 (+37,642/-232), tests + pgTAP 57 (+15,727/-84),
                      migrations 13 (+4,626), docs/tasks 28, config/deps 5
New migrations:       13 (20261026150000 .. 20261028100100); PROD has 41, head 20261026120000
Infrastructure/config: next.config.ts (serverActions.bodySizeLimit 8mb), scripts/bar-inventory/ (pgTAP vector generator, test-only)
                      No workflow, middleware, Vercel or env change.
Dependency changes:   next 16.3.4->16.4.3, eslint-config-next 16.3.4->16.4.3, zod 4.5.4->4.6.7,
                      + fflate 0.8.3, read-excel-file 9.3.12, write-excel-file 4.1.1 (exact-pinned, MIT)
```

## Feature groups

| Feature                                | PRs (merge commits into `development`)                                                                                                                                                      | Migrations                                                                                                                                        | Final gate                                                                                                                                                                                            | Status | Release risk                                                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Table Allocation same-server repeat    | #166 / #167 (`a9a1edf`)                                                                                                                                                                     | `20261026150000`                                                                                                                                  | Hosted DEV DB 92/92 (5 files), hosted UI 28 on a production build, pgTAP 0032; report `docs/features/same-server-repeat-table/`                                                                       | GO     | Low–medium: replaces `board_assign` + adds `board_end_previous_and_assign`; old app tolerates it                                                   |
| Bar Inventory V1 (BI-0 → BI-11)        | #168 → PRs #170–#187 (BI-0 `92a5ae4`, BI-1 `92024d3`, … BI-11 `951faa7`)                                                                                                                    | `20261026170000` catalog, `…180000` stock ledger, `…190000/190100/190200` FK hardening, `20261027120000` import commit, `20261027130000` realtime | BI-10 hosted DEV (DB 38/38, UI 23/23) and BI-11 final gate: **GO** with two owner decisions (AC-EXP-4, light-theme contrast); Playwright desktop 241 / tablet 241 / phone 239 (+2 skips) at that time | GO\*   | Medium (largest new surface: 10 tables, many RPCs, import/export, Realtime); entirely new tables, no existing data touched. \*owner decisions = C1 |
| Vendor Order Drafts V1 (VOD-0 → VOD-4) | #190 → PRs #191–#202 (VOD-1 `876be20`, VOD-1.1 `f6bab25`, VOD-2 `292ca1a`, VOD-3 `64e3007`, #200 `f3b0e0d`, VOD-4 `3f6509b`)                                                                | `20261027195142` order drafts, `20261027210000` Order Qty save fix                                                                                | VOD-4 hosted DEV final gate **GO** (roles/RLS, two-context PT409, Mark Sent without inventory mutation, Sent history paging, real WebKit host-tablet 20/20 each project); pgTAP 0039/0040             | GO     | Low–medium: new tables only                                                                                                                        |
| Dependency / security bump             | #188 (`0699498`)                                                                                                                                                                            | none                                                                                                                                              | Playwright 241/241/239 + CI green on exact head; clears the `next` Server Actions DoS and `zod` memory advisories flagged by BI-11                                                                    | GO     | Low                                                                                                                                                |
| Tasks V1.1 (T-0 → T-6)                 | #189 plan; T-1 #203 (`cf3ae39`), T-2 #205 (`46ea022`), T-3 #207 (`3a442a6`), T-4 #209 (`796cff3`), T-5 #211 (`53c94d2`), T-6 #213 (`711a683`) + docs-sync PRs #204/#206/#208/#210/#212/#214 | `20261028090000` notification scope, `20261028100000` enum value, `20261028100100` reminder engine                                                | T-6 **GO** on this exact code: WebKit/desktop 289/289, server-mobile 287 + 2 skips, pgTAP 42 / 1297, hosted DEV 19/19, TS-050, real-mode popup 3/3, Vitest 1689                                       | GO     | Low–medium: default landing changes (Tasks), ordinary-task notifications stop (intended), reminder sweep runs on each Tasks load                   |
| Hydration-marker fix                   | #213 (inside T-6)                                                                                                                                                                           | none                                                                                                                                              | regression test + 110/110 loaded WebKit runs                                                                                                                                                          | GO     | Low                                                                                                                                                |
| Documentation / handoff only           | #170, #181, #189, #191, #192, #194, #197, #199, #202, #204, #206, #208, #210, #212, #214; two reconciliation merges of `origin/development` (`a0fb0ab`, `be5e367`)                          | none                                                                                                                                              | n/a                                                                                                                                                                                                   | n/a    | None                                                                                                                                               |

Everything in the delta belongs to an approved, individually gated cycle; nothing is unattributed.

## User-visible behavior changes to expect in Production

1. The app opens on **Tasks → Today** for every role (was Table Allocation); `?tab=` addresses a module.
2. Owner / Manager / Assistant Manager get **All Staff / My Tasks / person** on Today.
3. Ordinary task assigned / reassigned / completed / due-soon / overdue **notifications stop** (history in `task_events` unchanged; existing rows kept).
4. **Opening reminders** (open, +15, +30) and the shell popup appear when required Opening work is incomplete; staff see a generic reminder.
5. **Bar Inventory** module (management; staff cannot open it) and **Vendor Order Drafts**.
6. Table Allocation: same-server repeat table dialog (End Previous + Assign) instead of a conflict.

## Open PRs and the release

| PR                                                     | Classification                                                                                                                                              |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #165 (docs, → `development`)                           | Stale previous-release docs; conflicts with current `STATUS.md` / `current-task.md`. **Not part of the release.** Optional owner/follow-up: rebase or close |
| #130, #53, #7, #6, #5, #2, #1 (Dependabot → `main`)    | Unrelated, unvalidated, **must not be merged with this release** (TypeScript 7 / @types/node 26 majors are not validated)                                   |
| #51, #49 (docs → `main`), #32 (feature → `main`)       | Stale, superseded (tracked #114 / #116); not part of the release                                                                                            |
| #16–#28 (stacked feature PRs between feature branches) | Stale stacked history (#116); not part of the release                                                                                                       |

The release source is `development` only.

## Open issues relevant to the release

| Issue                                       | Class                                                                                                                   |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| #154                                        | Closed (T-6)                                                                                                            |
| #169                                        | Open; delivered (T-2). **Close after successful Production verification**                                               |
| #168                                        | Open umbrella for Bar Inventory V1; **close after Production verification** (owner decisions C1 recorded first)         |
| #164                                        | Open; deferred Table Allocation UI checks (`1`→`T1`, conflict + Cancel, Realtime) — fold into the Production smoke      |
| #111, #112, #113                            | Open P1 infrastructure; not repaired (mitigated by the migrations-first manual procedure). Not product blockers         |
| #106                                        | Open P1 security; pre-existing in PROD, unchanged by this release (previous audit classified it as a release follow-up) |
| #155, #119–#121, #124–#128, #115–#118, etc. | Backlog / follow-up; not in this release                                                                                |

Recipes: **not started** (no code). Part 2 (multi-org / location / attendance): **not started** (no code).
