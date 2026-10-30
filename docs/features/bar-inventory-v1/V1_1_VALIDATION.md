# Bar Inventory V1.1 validation and handoff

Status: implementation and pre-PR gates PASS; CI/merge pending. Owner-approved E1–E5 scope is
recorded in [ENHANCEMENT_V1_1.md](ENHANCEMENT_V1_1.md).

## Baseline and scope

Fetched development: e4cffa8faad478164381899b4588748018c194b6 (the handoff's
full SHA differed; no reset or rewrite). Main baseline:
9e0be4b4eb7b7be2f32a6e57c9b773d7cf776b05. One feature branch:
feature/bar-inventory-bulk-edit-freshness. No Production, main or Recipes/R-2g
mutation. No Tasks/notifications, FIFO or POS implementation.

## Database rollout

DEV independently verified as the-lineup-dev, opmujepkemwcdxxorhfd, us-east-2.
The linked ref was rechecked before remote changes; every migration had a local
test and remote dry-run before DEV application. CLI remains pinned at 2.76.8.
Migration count: 56 → 61.

- 20261029005940_bar_inventory_freshness: date groups/rules, scoped SELECT RLS,
  controlled save RPCs, existing audit extension, Realtime publication.
- 20261029010431_bar_inventory_bulk_count: strict all-row preflight, deterministic
  locks and existing quantity-adjustment calls inside one transaction.
- 20261029010756_bar_inventory_saved_views: personal profile/location/table
  preferences, unique names/defaults, controlled save/delete, own-profile RLS.
- 20261029012324_bar_inventory_v1_1_deferred_tenant_fks: preserve the existing
  deferred tenant teardown invariant without editing applied migrations.
- 20261029014613_bar_inventory_calendar_year_range: explicit four-digit calendar
  years preserve their century; YY remains 2000–2099.

## Current verification evidence

- New hosted DB suite: 10/10 PASS, including real simultaneous-manager batch race.
- Hosted regression: 89/90 initially; stock/ledger Realtime event delivery failed
  once, then passed independently. Extended four-table Realtime delivery and
  Staff/foreign-tenant silence also passed. No timeout/assertion was weakened.
- Full local pgTAP after all migrations: 48 files / 1,538 assertions PASS.
  New V1.1 files: 34 freshness + 20 atomic count + 21 personal-view assertions.
- Browser matrix: 250 PASS / 2 existing phone-card skips, 14 specs × 3 projects:
  Chromium 84, real WebKit host-tablet 84, server-mobile 82 + 2 skips.
- New browser coverage: six V1.1 flows per project, 18 successful flows in matrix.
- Focused Bar Inventory Vitest: 36 files / 760 tests PASS.
- Full Vitest: 155 files / 2,002 tests PASS.
- npm run check: format, lint, route types and TypeScript PASS.
- DEV-pinned production build and explicit-empty-public Supabase build PASS.
  Both final bundle scans contain zero PROD references. Windows PowerShell's
  empty-variable removal initially allowed a .env.production.local fallback;
  the scan caught it before any server started. Node child-process environment
  entries preserved the intended empty strings and the corrected build passed.
- Hosted browser: 1 spec / 4 tests PASS on the final DEV-pinned production build.
  Real manager/Staff sign-in, stale batch recovery, normal ledger, fresh-browser
  saved-view restoration, save-as/update/default, date groups/rules, Dashboard
  drill-down and phone viewport containment were exercised.
- Final targeted precedence/count checks: 6/6 across the three devices PASS,
  including the unfiltered All Inventory tile taking precedence over defaults.
- Staged-file secret/personal-path scan: 61 files, zero findings. Existing
  tracked-local-path and nonproduction environment guards PASS.
- DEV/repository parity: 61/61 migration versions, latest 20261029014613.

## Defects found and corrected

The broader database regression caught non-deferred new tenant FKs; the additive
correction restored the established invariant. The year-range review prevented
four-digit manager input outside the 2000s from being rejected or edited into a
different century. Phone column controls were contained within the viewport.

A 10px tablet overflow reproduced on the untouched starting development commit
using its original test in an isolated worktree. The desktop navigation's
secondary group now scrolls within its available width, retaining primary and
Settings reachability. The previously failing WebKit case passes. No Recipes
component, business rule, data or image pipeline was changed.

## Cleanup

New hosted suites use task-owned organizations, locations, memberships, profiles,
Auth users and catalogs. Independent post-teardown queries verified zero
tenant rows in stock, ledger, date groups, rules, views, audit and catalog, plus
zero profiles/Auth users. Both DB and UI cleanup reports are retained in ignored
artifacts/bar-inventory-v1-1. A separate read-only scan found zero new V2 Harness
organizations or synthetic Auth users since this task began. No Storage objects
were created. Final hosted browser rerun: 4/4 PASS, all cleanup counts zero.

## Completed implementation integration

[PR #226](https://github.com/KrapaGoutam/The-Lineup/pull/226) targeted development
and merged on 2026-10-29 UTC using a merge commit. Its exact head was
`6c5b447235c53a18e64403853a0bc4c9253d0f0a`: application, browser-smoke,
migrations-and-policies and Vercel all passed. Production migration deployment
was correctly skipped on the PR. CI runs: `40805223722` and `40805223481`.

Fetched development was verified at merge commit
`12cef00977385563159bb12296868fcdeb1a091b`, containing the implementation head.
Main remained `9e0be4b4eb7b7be2f32a6e57c9b773d7cf776b05`; the implementation working
tree was clean. This documentation closeout records those completed gates on the
same feature branch and receives its own exact-head application/browser checks.
No further application or database change is pending. Recipes V1 R-2g has not
started and remains the next independent checkpoint.
