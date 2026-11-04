# Subfeature V2-002.004: Staff Assignment Management — Evidence

Issue: #279 · PR: #280 (open; not merged)

## Baseline

- Starting `origin/development`: `4d78eba63ec846198bd3cd654d99221f3f8b7c71`
- Starting `origin/main`: `5e5b7747693b6e81014eafdf299b87e56c3f033d`
- Branch: `feature/v2.0-002.004-staff-assignment-management`
- V2-002.003 / PR #278 verified merged (merge commit `4d78eba`).

## Environment

Claude Code Cloud. Supabase credentials used: **NO**. Production contacted: **NO**. Docker daemon: unavailable. WebKit: not installed.

## Source files

New: `domain/staff-assignment.ts(+test)`, `actions/staff-assignment-actions.ts(+test)`, `components/{staff-assignment-source,staff-assignment-demo,location-role-select,staff-badges,staff-multi-location-editor,employee-assignments-dialog,location-staff-management,organization-staff-assignments}` (+tests), `tests/e2e/staff-assignment-management.spec.ts`.
Modified: `components/location-administration.tsx` (Staff tab, Staff Assignments button, source wiring).
Docs: this folder, `docs/v2.0/CURRENT_STATE.md`, `tasks/current-task.md`.

## Verification actually run (Cloud)

| Gate                                                                    | Result                                                                                                                                                     |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check`                                                  | pass                                                                                                                                                       |
| `npm run lint` (`--max-warnings=0`)                                     | pass                                                                                                                                                       |
| `npm run typecheck`                                                     | pass                                                                                                                                                       |
| `npm test`                                                              | 188 files; 2,551 passed, 7 skipped (pre-existing)                                                                                                          |
| `NEXT_PUBLIC_DEMO_MODE=true npx next build --webpack`                   | pass                                                                                                                                                       |
| `npm run check:local-paths`                                             | ok                                                                                                                                                         |
| Playwright (mocked demo) new + location-administration + settings specs | desktop and server-mobile pass; host-tablet (WebKit) cannot launch in Cloud — same failure for pre-existing specs; equivalent 1024×768 Chromium run passes |
| `supabase test db` (pgTAP)                                              | **NOT RUN — Local database unavailable in Cloud**                                                                                                          |
| Hosted DEV                                                              | **NOT VERIFIED IN CLOUD — CODEX LOCAL HANDOFF REQUIRED**                                                                                                   |

## Migration decision

Closeout added ONE additive forward-only migration, `20261104010000_staff_roster_reader.sql` (read-only `public.list_organization_staff`; see PLAN §13). No existing table, policy or applied migration changed. Otherwise reuses `memberships`, `profiles`, `locations`, `location_memberships`, `apply_location_assignment_changes`.

## Codex Local handoff (required before merge)

1. Fetch the PR branch; verify head SHA matches the PR.
2. Isolated worktree; `LINEUP_SUPABASE_ACCESS_TOKEN` → DEV only; verify project `opmujepkemwcdxxorhfd`; never contact `ftadewtkjlaotfdvtjcv`.
3. Run `npx supabase test db`, including the existing assignment atomicity/authorization regressions.
4. Authenticated integration with synthetic fixtures: Org GM assigns/updates/deactivates/reactivates; multi-location batch; unauthorized batch (Webster authorized + NASA unauthorized) leaves zero partial writes; Jack/Sam/Tom/Jerry matrix unchanged.
5. **Verify roster visibility for an Overall Owner/Manager who is not a member of the administered organization** (PLAN §13). If RLS returns an empty roster, document the defect, add a regression test and fix on the SAME branch with a verified policy change.
6. Run the iPad (WebKit) Playwright project.
7. Re-run exact-head CI if the branch changes; merge with a merge commit only after all gates pass; leave `main`/Production untouched.

## Closeout (roster visibility fix)

- WebKit: `npx playwright install --with-deps webkit` fails in Cloud — download of `webkit-ubuntu-24.04.zip` from `playwright.download.prss.microsoft.com` is rejected with HTTP 403 by the environment network allowlist. No workaround attempted. iPad/WebKit project: **NOT RUN** (retained for Codex Local); Chromium 1024×768 tablet coverage unchanged.
- Hosted DEV: no approved DEV-only workflow or credentials exist in Cloud (`database.yml` only deploys to production on push to `main`, which is not touched). **PENDING_CODEX_LOCAL**.
- Cloud gates after the fix: `git diff --check`, format, lint, typecheck clean; `npm test` 188 files / 2,555 passed / 7 skipped; `next build --webpack` compiled; `check:local-paths` ok; `check-nonprod-env --scan .next` passed.
