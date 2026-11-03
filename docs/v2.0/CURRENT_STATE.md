# The Lineup V2.0 — Current Operational State

```text
Program:               The Lineup V2.0
State:                 PLANNING (Phase 0)
Current Feature:       Phase 0 — Planning Foundation, Architecture Audit & Roadmap Setup
Implementation:        NOT STARTED
Starting dev SHA:      26cd067b1904143fabec18bc3b2316d053eb39f5
Starting main SHA:     5e5b7747693b6e81014eafdf299b87e56c3f033d
Working Branch:        docs/v2.0-planning
Worktree Path:         .tmp/v2-planning
Target Branch:         development
GitHub Milestone:      The Lineup V2.0 (Milestone #8)
GitHub Parent Issue:   #248
GitHub Feature Issues: #249 through #257
Database Changes:      NONE
DEV DB Mutations:      NONE
Production Changes:    NONE
Main Branch Merge:     NONE
Next Approved Phase:   V2-001 — Access & Role Foundation
Blockers:              None
```

---

## Operational Summary

1. **Safety Baseline**:
   - The primary working tree (`docs/recipes-owner-retest-handoff`) contained uncommitted owner documentation and design references.
   - An isolated Git worktree was established at `.tmp/v2-planning` tracking `origin/development` (`26cd067b1904143fabec18bc3b2316d053eb39f5`).
   - Starting `origin/main` SHA is recorded as `5e5b7747693b6e81014eafdf299b87e56c3f033d`.
   - No resets, stashes, clean operations, or force pushes have been executed.

2. **Phase 0 Scope & Execution**:
   - Repository audit completed across organizations, memberships, locations, authorization helpers, passcode auth, attendance, tips, payroll, tasks, bar inventory, and recipes.
   - Canonical documentation established under `docs/v2.0/`.
   - GitHub tracking initialized: Milestone #8 (`The Lineup V2.0`), Parent tracking issue #248, and Feature issues #249 through #257.
   - Issue #106 (organization creator bypass debt in `private.has_org_role`) reconciled and linked to subfeature V2-001.007.
   - Product code, migrations, RPCs, and RLS policies remain completely untouched.

3. **Next Phase Recommendation**:
   - **Recommended Phase**: `V2-001 — Access & Role Foundation`
   - **First Subfeature**: `V2-001.001 Overall Roles` & `V2-001.002 Organization Membership`
   - **Agent Recommendation**: Antigravity Local / Gemini 3.8 Flash / High / New Local Session (LOCAL REQUIRED).
   - **Strict Constraint**: Implementation must not proceed until Phase 0 PR is reviewed, verified green by CI, and merged into `development`.
