# V2-005 Closeout — Readiness Audit and Evidence

Date: 2026-11-09. Auditor: Claude Code (Sonnet 5.5, new session). Method: read-only. No hosted write, no configuration write, no enforcement change, no Production contact.

## C0 — Post-merge verification

| Check                    | Result                                                                                                                                                                                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR #316                  | MERGED 2026-11-09T19:37:43Z by a regular merge commit                                                                                                                                                                                                                               |
| Merge commit             | `c9e78dac48c932c2735988194f62db2b76a28702`; parents `75a4d3c2` (#315 merge) + `4c3e7223` (reviewed head)                                                                                                                                                                            |
| `origin/development`     | `c9e78dac` (equals the merge commit)                                                                                                                                                                                                                                                |
| `origin/main`            | `5e5b7747693b6e81014eafdf299b87e56c3f033d` — unchanged                                                                                                                                                                                                                              |
| Merge tree vs PR head    | **identical** (`35665c4d…`), so the exact-head receipts apply to the merged code                                                                                                                                                                                                    |
| Exact-head CI (`4c3e72`) | application, migrations-and-policies, browser-smoke, Vercel: SUCCESS; `deploy-migrations`: SKIPPED (by design). No separate CI run exists for the merge commit (CI triggers on `pull_request`); that is not a failed run                                                            |
| Preview deployment       | `dpl_DQm4UB7vUQ3BX3CMpP3HJ7pTVohU`, target Preview, branch `development`, commit `c9e78dac`: **READY**                                                                                                                                                                              |
| Preview bundle refs      | Fetched the home/login HTML and its 10 JS chunks: DEV project ref present in 1 file, **Production ref in 0 files**                                                                                                                                                                  |
| Hosted DEV ledger        | **82**, latest `20261109120000`, version md5 `e58413c5ba67b1c6e22ec9e53b1c1104`; repo has 82 migration files. No pending migration                                                                                                                                                  |
| Enforcement switch       | `module_enforcement_settings.mode = staged`; `activation_reference` and `activated_at` null                                                                                                                                                                                         |
| Module configurations    | **0 rows** (no duplicates, 0 orphaned)                                                                                                                                                                                                                                              |
| Data drift               | products 148, stock rows 236, adjustments 123, date lots 47, recipes 32 — equal to the post-apply evidence. New storage tables (areas, shelves, placements, date-group imports) hold 0 rows. The stock-row digest was not recomputed (its formula is not recorded); row counts only |
| Issues                   | #248, #252, #253, #304 all OPEN, consistent with the docs                                                                                                                                                                                                                           |
| Branches / PRs           | No prior closeout branch or PR existed. This PR is the only closeout artefact                                                                                                                                                                                                       |

Not re-run (by instruction, no new finding invalidates them): the 3,517-test Vitest suite, pgTAP, real-JWT suites, browser suite, migration rehearsal.

## C1 — Module configuration readiness (fresh DEV read, 2026-11-09)

```text
Organizations:                         30
Locations, active and not archived:    44
Locations, inactive:                    0
Locations, archived:                    0
location_module_configs rows:           0
Duplicate (location, module) rows:      0
Rows pointing at a missing location:    0
Configurable modules (enum):            9  table_allocation tasks schedule tips team attendance payroll bar_inventory recipes
Locations with all 9 rows:              0
Locations with incomplete config:      44  (each is missing all 9)
Backend activation readiness:          NOT READY (0/44)
```

The 44 are not 44 restaurants. Composition (names and ids are in the private, git-ignored matrix, not here):

| Group                     | Orgs |    Locations | Notes                                                                   |
| ------------------------- | ---: | -----------: | ----------------------------------------------------------------------- |
| Non-harness DEV sites     |    2 |            2 | "Manual Preview" (28 stock rows) and "The Monk's DEV" (32 stock rows)   |
| `V2 Harness <hash>` pairs |   14 | 28 (A and B) | Leftover test-harness fixtures; each carries 1–13 stock rows per branch |
| `V2 Harness Other <hash>` |   14 |           14 | Leftover single-location cross-organization fixtures; 0 stock rows      |

**Finding C1-F1 (not a code defect):** 42 of the 44 gate-counted locations are residue of earlier test harnesses. The activation gate counts every active, unarchived location, so reconciling "all 44" would mean approving values for 42 throwaway fixtures. The owner decision R1 already allowed for "which of them are throwaway test fixtures". Retiring fixtures is a separate, owner-approved action (archiving goes through the audited lifecycle path; locations are append-only). It was **not** attempted.

**Finding C1-F2:** With zero configuration rows, every optional module is `Missing` and hidden for every account (V2-004.003 navigation policy). Bar Inventory, and therefore Cooler Layout and All authorized branches, is not reachable on hosted DEV by any actor until `bar_inventory` is explicitly Enabled at the location under test. Hosted authenticated acceptance is therefore blocked on a configuration decision, not on a defect.

## Reproduction

Read-only script (SELECT only, `read_only: true`, DEV ref hard-coded, Production refused) through the Management API plus the existing `scripts/module-enforcement-readiness.mjs --summary` semantics. Raw output is kept outside the repository because it contains organization and location names.
