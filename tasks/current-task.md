# V2-004.001 — Per-Location Module Configuration Contract

Canonical docs: `docs/v2.0/features/004-location-module-configuration/001-module-configuration-contract/`
Parent Feature: Issue #252 · Program: Issue #248 · Subfeature Issue: #298 · Milestone #8
Branch: `feature/v2.0-004.001-module-configuration-contract` (from `origin/development` `fcc661df96b5af1c01ebb8f2f00ff42078e02979`) · PR #299
Environment: Cloud implementation; Local validation on the official Supabase stack and hosted DEV (`the-lineup-dev` only; Production never contacted)

## Implementation Checklist

- [x] Pre-flight: `development`/`main` SHAs verified against the remote; Issue #298 created and linked to #252 (no duplicate existed)
- [x] Investigation, decisions documented (PLAN.md)
- [x] Migration `20261105210000_location_module_configs.sql`; pgTAP `0062` 92/92; registry + contract + reader; Vitest +58
- [x] Cloud gates: format:check, lint, typecheck, check:local-paths, `npm test` (3078 passed), `next build --webpack`
- [x] Draft PR #299 into `development`
- [x] **Local:** official stack `supabase db reset` — 73/73 migrations; `supabase test db` — 62 files / 2012 assertions PASS (incl. 0039/0042/0045)
- [x] **Local:** CLI-generated types identical to committed file (only a pre-existing `__InternalSupabase` header differs)
- [x] **Hosted DEV:** preflight (72 migrations, identity, baseline) → dry run → single-migration apply (72→73), checksum matches, 0 config rows, advisors clean for new objects
- [x] **Hosted DEV:** real-JWT `MCR-01…10` 10/10; denied writes verified against stored state; 0 synthetic leftovers; counts/fingerprints identical
- [x] Defect fixed (test harness only): teardown could not delete a location archived via the append-only audit RPC; teardown now verifies tracked IDs and fails loudly; stored-state assertions added
- [x] Docs: EVIDENCE §7, STATUS, TEST_MATRIX, feature README/STATUS, ROADMAP, CURRENT_STATE
- [ ] Exact-head CI green on the final PR head, PR ready for review, regular merge into `development` (no squash), Issue #298 closed with evidence

## Current State & Next Step

V2-004.001 validation is COMPLETE; the remaining work is the merge bookkeeping above. **STOP after V2-004.001 closeout.** Do NOT start V2-004.002 (settings UI — owner decisions Q1–Q4 are open), V2-004.003, V2-004.004, V2-005 or V2-008.

Release gates carried forward: V2-004.004 must not be activated against existing ACTIVE locations until they have owner-approved explicit module rows (a missing row is never "enabled"); account recovery (passcode reset, hosted in Team) must stay reachable when Team is disabled.
