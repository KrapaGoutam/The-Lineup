# Canonical Table Input Resolution — Final Handoff

Feature: Canonical Numeric Table Input Resolution

Issue: #157 CLOSED
Implementation PR: #158 MERGED
PR head: caef5aa3a96722d39fcf586282b2eb375457dcc6
Merge commit: f8fa191b66b363a344bc51fc9a75dc045e7fb082
Docs closeout: PR #159 (docs-only, `docs/canonical-input-closeout`) -> development, merge commit after CI

Phases: R0 ✅ R1 ✅ R2 ✅ R3 ✅ R4 ✅ R5 ✅ R6 ✅ R7 ✅

Resolution:
1 -> T1 when T1 registered
T1 -> T1
99 -> free text when T99 absent
01 -> T01 only if T01 exists; never collapse to T1
combined labels resolved per component

Migration: 20261026120000
DEV migration: APPLIED
PROD migration: NOT APPLIED

Tests:
pgTAP: 31 files / 646 assertions
Vitest: 74 files / 715 tests
Demo Playwright: 507 passed
Hosted DEV DB: 78 passed
Hosted DEV UI: 30 passed
Build: PASS
Lint: PASS
Typecheck: PASS
Format: PASS
Exact-head CI (application, browser-smoke, Database, Vercel): PASS; deploy-migrations skipped

XM-024 (transient / non-reproduced observation): failed once in the first of three full hosted UI runs; passed in the next two full runs, an isolated rerun and exact-head CI. No product defect found.

Pre-existing DEV old-contract rows: active synthetic labels `1` and `2` (today's DEV board) — not modified.

GitHub:
#157: Closed, Project #4 Done, milestone "Table Allocation V2 — Part 2"
#153, #133: Closed, Done
PR #158: merged (merge commit)

Roadmap: updated (DONE incl. #157; PLANNED #154, #155; NEXT release-readiness audit)
Backlog: #154 planned, #155 planned, release-readiness audit queued

development merged: YES
main merged: NO
DEV touched: YES
PROD touched: NO
PROD migrations: NO

NEXT PHASE: Release-readiness audit (includes the read-only numeric-label query in docs/features/table-input-canonical-resolution/PLAN.md, per real location; owner decides on development -> main)

DO NOT: merge development -> main, deploy Production, apply PROD migrations, begin #154, begin #155, `git add -A`, stage `docs/testing/` or `*.code-workspace`
