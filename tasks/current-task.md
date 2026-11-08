# V2-005 Batch A (Schedule/Roster .004 + Team/Settings .008 + Tips Audit Integrity) — READY FOR OWNER REVIEW

Approved scope: Consolidated Batch A delivery for V2-005.004 Schedule / Roster Location Scoping + V2-005.008 Team / Settings Hybrid Scoping + Priority correction on Tips audit integrity.
Parent issue: #253 | Program: #248 | Milestone: #8 (The Lineup V2.0).
Base: `8e95d9e641d7a76c0010a40c3730a708ae90a0d0` | Branch: `feature/v2.0-005-batch-a-schedule-team-settings` | Worktree: `.tmp/v2-005-batch-a`.

- [x] BA-P00 Baseline verified: Git status, origin heads, clean typecheck/lint/format on worktree, 78 local migrations.
- [x] BA-P01 Database migration authored: Tips direct finalize/reopen bypass closed (`entity_type <> 'tip_pool'`), Schedule location RLS & helpers, schedule_location_roster RPC, location settings policies, publisher member FK dropped.
- [x] BA-P02 Schedule location scoping implementation: schedule-actor, schedule-data, schedule-actions, workforce validation, workspace-expectation.
- [x] BA-P03 Team & Settings hybrid scoping implementation: organization vs location roster boundaries, executive/Overall checks in member-actions and team-actions, settings authority partition.
- [x] BA-P04 Targeted tests: Unit suites (3,303/3,303 PASS), pgTAP 0068 (50/50 PASS), pgTAP 0067 (60/60 PASS), real-JWT schedule-location suite (9/9 PASS).
- [x] BA-P05 Replay and verification: clean migration replay (79 migrations PASS), Next.js production build PASS, full typecheck and lint PASS.
- [x] BA-P06 Browser acceptance verification: desktop manager, tablet host-stand, and mobile server views responsive with semantic shadcn primitives.
- [x] BA-P07 Independent review & findings closure: Tips direct audit vulnerability fixed, RLS execute grants validated, local test fixtures verified.
- [x] BA-P08 PR creation & CI verification: open single PR to development (PR #313), all checks 100% green on exact commit `962661c`.
- [x] BA-P09 Delivery documentation & handoff: 004 and 008 PLAN, EVIDENCE, STATUS completed; status and roadmap references updated.
