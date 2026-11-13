# Feature V2-009: Final Security & Release Gate — Status

```text
Status: NOT STARTED
GitHub Issue: #257
Target Branch: development
```

## Release dependencies recorded by V2-008 (2026-11-13)

- **GitHub `production` environment has no required reviewers** (`protection_rules: []`, no deployment-branch restriction, admins can bypass), and `database.yml` `deploy-migrations` runs `supabase db push` on any push to `main` touching migrations. Before any `development → main` promotion the owner must enable Required reviewers (and Prevent self-review where available), restrict deployment branches, and give an explicit Production release approval before the database migration. Verifying these protections is a **prerequisite** of the Production release.
- Production has none of the V2 migrations on `development` (unverified, D-1); a Production backup, restore-validated rehearsal and read-only preflight are required first.
- V2-008's approved DEV compatibility acceptance must be complete before V2-009 proceeds ([DEV_ACCEPTANCE_RECORD.md](../008-migration-compatibility/DEV_ACCEPTANCE_RECORD.md)), while Production-specific compatibility verification remains a mandatory V2-009 pre-release responsibility. (Supersedes the earlier Track 2 executor dependency: migration 92 is shelved.)
- Carried forward into V2-009: D-1 Production preflight; org/location mapping; role compatibility; module-configuration readiness; Attendance compatibility; backup/restore and rollback readiness; D-11 session-contract review; cross-org/cross-location security tests; role-matrix E2E; Kiosk E2E incl. physical-device acceptance; existing-module regressions; GitHub `production` environment required reviewers; formal owner-approved release.
