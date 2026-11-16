# V2.0.2 Attendance Configuration — handoff

Project: The Lineup. Agent: Codex Local. Worktree: `.tmp/v2-0-2-attendance-configuration`. Branch: `feature/v2-0-2-attendance-configuration`. Base: synchronized `development` `dc2cc8f5f1fddbe0d52b6f0a75534f0e8fa9bd62`. Local HEAD: `dc2cc8f` at start; uncommitted feature work in progress.

Owner approved the exact non-force `development` fast-forward from `17d9eb7` to `dc2cc8f`; it was pushed. No approval yet for development/main merge, hosted migration, or Production configuration.

Batch A: complete. Supabase CLI migration `20261116180009_v2_0_2_internal_attendance_default.sql` sets only the locations column default. Existing provisioning RPC and grants are unchanged. `0057`, `0073`, `0089` pgTAP pass, 154 assertions, against separate local stack with 98 migrations applied from scratch. Additional module/native-financial/kiosk pgTAP `0062`, `0076_native`, `0077`, `0078`, `0079` pass, 472 assertions. No hosted database write.

Batch B: complete locally. New `location-attendance-settings.tsx` is inside the existing branch dialog; the existing action now requires a reason and expected timestamp and exposes conflict codes. Six focused Vitest files pass, 94 tests. Existing branch manager dialog Playwright passes desktop/tablet/mobile, 3/3; live settings browser acceptance remains for hosted DEV.

Batch C: complete locally. `npm run check` passes format/lint/typecheck; full Vitest passes 317 files, 4,258 passed, 7 skipped; `npm run build` passes. Five additional pgTAP files pass, 472 assertions. An initial 12-case Playwright run reported all cases passing but its temporary server did not exit; the focused 3-viewport rerun against a separately managed server exited cleanly, 3/3. Diff review found no tenant, access, scope, or accidental data-write issue; exact-head CI remains. No PR, hosted migration, or existing-branch configuration yet. DEV/Production migration and attendance values require fresh read-only verification before any write.

Next: commit and open the feature PR. Wait for exact-head CI and owner approval before merging into development. No shared-branch merge or hosted write without the brief's explicit gate.

Recovery: read this file first; verify branch, HEAD and worktree state; preserve uncommitted changes; resume first incomplete checklist item in `tasks/current-task.md`; reuse test/CI evidence; never repeat completed batches or migrations. Do not store credentials or PINs here.
