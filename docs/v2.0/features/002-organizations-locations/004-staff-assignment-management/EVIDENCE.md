# Subfeature V2-002.004: Staff Assignment Management — Evidence

Issue: #279 (closed) · PR: #280 (merged)

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

### Database workflow (isolated CI Supabase — NOT hosted DEV)

- Verified commit: `fcb177d07c456d62537df9466b63210be8384da2`
- Run: https://github.com/KrapaGoutam/The-Lineup/actions/runs/41848841678 (`Database` / `migrations-and-policies`: **success**; `deploy-migrations`: skipped, as designed for non-`main` events)
- Steps: `supabase start` ✓, `reset` (all migrations incl. `20261104010000`) ✓, `test` ✓ — the log shows `0058_staff_roster_reader.test.sql` executed and `supabase test succeeded`. The per-assertion summary line is not in the retained log tail; Codex Local should re-run to record counts.
- Application CI for the same commit: run https://github.com/KrapaGoutam/The-Lineup/actions/runs/41848841677 (`application`, `browser-smoke`): **success**.
- This validates the migration and policies on an ephemeral database only; it is not evidence about hosted DEV.

### Codex Local continuation (short)

```text
Repository: KrapaGoutam/The-Lineup
PR: #280   Branch: feature/v2.0-002.004-staff-assignment-management
Verified code head: fcb177d07c456d62537df9466b63210be8384da2 (docs-only commits may follow; confirm `git log origin/<branch>`)
Cloud tests: Vitest 188 files / 2,555 passed / 7 skipped; format, lint, typecheck, build, local-paths, nonprod-env scan green; Playwright desktop (CI) + mobile + 1024x768 Chromium green
Database CI: success (run 41848841678), includes new pgTAP 0058
WebKit: NOT RUN — playwright.download.prss.microsoft.com blocked (HTTP 403) in Cloud
Unfinished DEV gate: PENDING_CODEX_LOCAL
```

1. `git fetch origin --prune`; check out the existing PR branch in an isolated worktree (do not re-branch from `development`).
2. Map `LINEUP_SUPABASE_ACCESS_TOKEN` → `SUPABASE_ACCESS_TOKEN` for DEV-only commands; verify project ref `opmujepkemwcdxxorhfd`; never contact `ftadewtkjlaotfdvtjcv`.
3. Apply migration `20261104010000_staff_roster_reader.sql` to DEV; confirm `supabase gen types` produces no diff against the hand-edited `list_organization_staff` entry in `src/types/database.generated.ts`.
4. Authenticated checks with synthetic fixtures: Overall Owner/Manager without membership lists the roster and assigns; Org GM does the same in own org and is denied in another; Overall Assistant Manager denied; mixed-org batch leaves zero partial writes.
5. `npx playwright install --with-deps webkit` locally, then run the `host-tablet` project for `staff-assignment-management`, `location-administration` and `settings` specs.
6. Fix any issue on the same branch, re-run exact-head CI, then merge PR #280 with a **merge commit** into `development` only.

## Codex Local validation (2026-11-04)

- Source/checkout/final PR head before closeout docs: `242ba18e78201ca299fb55554db96e7ec7de2e5f` (the only commit after `fcb177d` was docs-only).
- DEV identity was verified as `opmujepkemwcdxxorhfd`; the Production database `ftadewtkjlaotfdvtjcv` was not queried or mutated.
- `supabase migration list --linked` and `supabase db push --dry-run --linked` showed exactly one pending migration: `20261104010000_staff_roster_reader.sql`.
- The migration was applied to DEV and the follow-up migration list showed local/remote synchronization through `20261104010000`.
- Linked type generation confirmed the hand-edited `list_organization_staff` signature matches DEV. The generator added only its version-header metadata after formatting; that unrelated generator drift was not retained.
- Six existing synthetic, transactional database suites were executed against hosted DEV and rolled back: `0051`, `0052`, `0053`, `0054`, `0055`, `0058`. Final planned assertions were 22 + 24 + 24 + 26 + 28 + 25 = **149 passed**.
- Coverage includes Overall Owner/Manager without org membership, Org Owner/GM, ordinary/foreign/inactive/revoked users, invalid org, safe roster fields, assign/update/deactivate/reactivate, multi-location save, duplicate prevention, no sibling-branch grants, creator-bypass regression, and mixed-authority batch atomicity with zero partial writes.
- The Supabase security advisor reports the expected generic warning for authenticated-callable `SECURITY DEFINER` RPCs. For this function it is intentional and mitigated by `auth.uid()`, explicit in-function authority checks, authenticated-only execute grant, empty search path, narrow return fields, and the dedicated authorization tests.
- WebKit/iPad: the first 12-worker run passed 11/12; one test timed out during initial `page.goto` before authentication. The isolated rerun passed, then the complete three-spec gate passed **12/12 serially** on the real `host-tablet` WebKit project in 1.4 minutes. Playwright captured screenshots for each passing scenario under ignored `test-results/`.
- Exact-head CI on `242ba18e`: application pass, browser-smoke pass, Database pass (log explicitly shows `0058_staff_roster_reader.test.sql ... ok` and `Result: PASS`), Vercel pass.
- Merge closeout: PR #280 merged into `development` at `b08efeee933507dcd4d7e475f2ebab957d47453e` on 2026-11-04. Post-merge fetch verified `origin/development` equals the merge SHA and `origin/main` remains `5e5b7747693b6e81014eafdf299b87e56c3f033d`. Production was untouched.
