# Subfeature V2-001.006: Canonical Authorization Resolver — Status

```text
Status:               IN_PROGRESS
Branch:               feature/v2.0-001.006-authorization-resolver
GitHub Issue:         #269
PR:                   (Pending)
Milestone:            The Lineup V2.0 (Milestone #8)
Parent Feature:       #249 ([V2-001] Access & Role Foundation)
Parent Milestone:     #248 (The Lineup V2.0)
Starting Dev SHA:     773ac7e8ee28fd0d99422f7a561709338a8a2755
Starting Main SHA:    5e5b7747693b6e81014eafdf299b87e56c3f033d
Worktree:             .tmp/v2-auth-resolver
Target Branch:        development
Outcome:              Canonical Pure Domain Resolver & Server-Authoritative Loader
Migration:            NO NEW SCHEMA MIGRATION REQUIRED
Hosted DEV Status:    VERIFIED BASELINE (opmujepkemwcdxxorhfd)
CI Status:            Pending
Blockers:             NONE
Next Subfeature:      V2-001.007 — RLS / Server Security Hardening
Production Touched:   NO
Main Touched:         NO
```

---

## Subfeature Progress

- [x] Pre-flight checks: baseline SHAs recorded (`773ac7e` dev, `5e5b774` main), isolated worktree created (`.tmp/v2-auth-resolver`)
- [x] Hosted DEV baseline verified (`overall_roles`, `memberships`, `locations`, `location_memberships`, `location_role` through migration `20261103020000` on `opmujepkemwcdxxorhfd`)
- [x] Subfeature issue created: #269
- [x] Architecture plan & test matrix documented (`PLAN.md`, `TEST_MATRIX.md`, `STATUS.md`, `EVIDENCE.md`)
- [x] Decision confirmed: NO NEW SCHEMA MIGRATION REQUIRED (existing tables and readers provide all needed state)
- [ ] Pure domain resolver implementation (`src/features/auth/domain/access-resolver.ts`)
- [ ] Pure domain resolver unit tests (`src/features/auth/domain/access-resolver.test.ts`)
- [ ] Server-authoritative data loader implementation (`src/features/auth/data/access-resolver.ts`)
- [ ] Server-authoritative data loader unit tests (`src/features/auth/data/access-resolver.test.ts`)
- [ ] Regression test verification (V2-001.001 - V2-001.005 and operational modules)
- [ ] Local quality gate: format, lint, typecheck, full unit tests, full pgTAP, Next.js build
- [ ] Hosted DEV read-only verification
- [ ] PR opened, exact-head CI green
- [ ] Merge commit into `development` and closeout tracking
