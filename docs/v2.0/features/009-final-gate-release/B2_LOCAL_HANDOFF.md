# V2-009 B2 local security review handoff

## Boundary and baseline

Branch `fix/v2-009-b2-rls-anon-hardening`, isolated at `.tmp/v2-009-b2-security`, based on `development` commit `6570a1994b566a2f33ec7647f63ffe7c180801e0` (merged PR #327). The verified project-owned local Supabase database started at ledger 93 and now has 95 migrations, latest `20261114162724`. No hosted database, remote branch, PR, merge, deployment, credentials, `main`, or shelved V2-008 executor was changed.

Local implementation commits: F-1 `45534f4` (`fix: revoke unnecessary anonymous database grants`); F-2 `dc990aa` (`fix: scope direct allocation records to authorized locations`). Review both commits and this documentation handoff against the stated base.

## Changes for independent review

1. F-1 migration `20261114162527_v2_009_b2_anon_privilege_hardening.sql` and pgTAP `0085`: current `anon` access revoked from `location_memberships`, seven named sequences, and two trigger functions (including their explicit `PUBLIC` EXECUTE grants). `postgres` explicit public defaults for future tables, sequences, and functions no longer grant `anon`. Authenticated, GraphQL, Storage, and schema-usage compatibility is retained.
2. F-2 migration `20261114162724_v2_009_b2_direct_location_rls.sql`, pgTAP `0086`, and real JWT test: restrictive gates for floor templates, seatings, and seating links follow the canonical board helper and actual stored location; Overall tiers receive target-scoped SELECT only. The assignment SELECT policy separates active same-location roster access from Owner/GM and Overall administrative visibility. Existing write policies and helpers remain.

## Evidence

Old-schema regression-first run: F-1 13/21 and F-2 32/56 failed as expected. The F-2 fixture corrected two expected roster counts after that run. Current tests: new pgTAP 78/78; existing registration/location/allocation/kiosk pgTAP 433/433; new local GoTrue/PostgREST JWT tests 5/5; existing allocation JWT suites 45/45. `npm run check`, `git diff --check`, and `next build --webpack` passed. `npm run build` hit the known Turbopack external `node_modules` junction resolution problem in this worktree. No full-suite campaign was run, consistent with the B2 owner instruction. Synthetic B2 users and organizations were removed; ledger is 95.

## Explicit V9-X2 follow-up

The local migration role (`postgres`) could not change `supabase_admin` default ACLs; its attempted `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` failed atomically before either migration applied. The owner then approved revoking current grants and `postgres` defaults only, without privilege escalation. The read-only detector in pgTAP `0085` confirms the remaining `supabase_admin` explicit public `anon` defaults: tables have eight grant types, sequences three, functions one. These are future-object defaults, not evidence that the audited current objects remain exposed. **F-1 is not fully hardened.** Before Production release, obtain a separate owner-authorized Supabase-admin operation to revoke these defaults and verify effective privileges on future public objects. Do not change global `PUBLIC` function defaults, GraphQL, Storage, or required schema usage.

## Claude Code Sonnet 5.5 review request

Review both local commits and the final diff from base `6570a1994b566a2f33ec7647f63ffe7c180801e0` read-only. Prioritize effective `anon` privileges; default ACL ownership; `PUBLIC` trigger EXECUTE; RLS policy composition and `WITH CHECK`; actual parent/table location for seating links; organization and location isolation; Overall Assistant Manager/Manager/Owner SELECT with no new direct write; Owner/GM board authority versus assignment administration; compatibility of registration, staff assignment, kiosk, GraphQL, and Storage. Check regression evidence and the unresolved `supabase_admin` default ACL before recommending any hosted rollout. Do not push, open a PR, merge, or apply hosted migrations as part of review.
