# Tasks acceptance matrix

Local implementation acceptance below is verified. PR/exact-head CI delivery remains pending.

- Assigned A permitted reads/work; dual A/B isolated switching; Manager operates A.
- All Overall tiers operate without fabricated memberships and retain real actor history.
- A-only, org-only, foreign, revoked assignment/session, inactive/archived denied with unchanged state.
- Forged actor/location, foreign task/template/series and dual-authorized wrong-workspace IDs refused.
- Staff management denied; canonical Owner/Manager/Assistant capability separation preserved.
- Child definitions/history/notification rows and counts cannot leak unauthorized locations.
- Generation drops revoked workforce; service day/due time/DST/history retained.
- Own-recipient dismissal survives module/access removal; foreign IDs change nothing.
- Disposable ACTIVE Enabled/Disabled; restore STAGED; zero fixture residue.
- Authenticated desktop/tablet/mobile switching, history, Overall writes and stale context.
- Full check/test/build, replay/pgTAP, independent review and exact-head CI.

## Executed receipts

| Gate                                                                                                                                        | Result                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `npm.cmd run check`                                                                                                                         | PASS: Prettier, ESLint zero warnings, Next typegen/TypeScript      |
| `npm.cmd test`                                                                                                                              | 241 files; 3,261 PASS / 7 existing SKIP                            |
| `npm run build` (local environment wrapper)                                                                                                 | PASS; production runtime used for authenticated browser acceptance |
| `supabase db reset --local --workdir .tmp/tasks-db`                                                                                         | PASS; 77 migrations on disposable project only                     |
| `supabase test db --workdir .tmp/tasks-db`                                                                                                  | 66 files / 2,198 PASS, including readiness/scoped mark-read ACLs   |
| `node .tmp/run-tasks-local.mjs node_modules/vitest/vitest.mjs run --config vitest.local.config.ts tests/local/tasks-location.local.test.ts` | 17/17 PASS; actual end-user JWTs and persisted-state assertions    |
| `node .tmp/run-tasks-local.mjs node_modules/@playwright/test/cli.js test --config playwright.tasks-local.config.ts`                         | 18/18 PASS on production build; desktop/tablet/mobile              |
| Independent read-only review                                                                                                                | Four findings fixed; re-review found no remaining concrete defect  |
| Local-path check / nonproduction build scan                                                                                                 | PASS                                                               |

JWT17 explicitly covers location datasets/counts/reminders/history, genuine Overall actors, workforce eligibility, role independence, wrong-workspace/foreign IDs, unchanged-state refusals, direct-DML actor forgery, revoked assignment/membership/session, inactive/archive, own dismissal after revocation, ACTIVE reminder rows/counts and dismissal, revoked generation with historical retention, DST due instants, Manager/Assistant authority limits and STAGED restoration.

Browser18 covers dual-location dataset switching; organization Staff promoted only at A receiving management controls and successful persisted A creation while B stays Staff; each Overall tier's creation and rendered real audit actor without memberships; and stale-cookie completion refusal with unchanged persisted task. Each runs on desktop Chromium, tablet WebKit and mobile Chromium. The initial development-server run passed 12 and stopped on a Next development issue badge intercepting mobile navigation; the complete production-runtime rerun passed all 18.

Credentials are process-injected from the disposable CLI status, never committed or printed by the runner. `.tmp/tasks-db` uses project `lineup-tasks-scoping`, API 56321 and DB 56322; existing local stacks are not reset. Legacy dblink test copies adapt their published port inside this disposable directory only; tracked CI fixtures retain their original port. No hosted-JWT test is run under this task.

Final additions: atomic mark-all cleared 1,005 own A rows with B and another recipient unchanged; unauthorized B mark-all denied. Old-schema authenticated browser compatibility PASS (1/1) against 76 migrations; no tasks/checklists/events/notification writes. A synthetic nonempty 76-to-77 upgrade preserved historical task fields, assignments, timestamps, event payloads and notification contents; source locations backfilled. SQL lint of public/private reported no errors. Final disposable database inventory is 77 migrations, STAGED, zero organizations/profiles/Auth users/tasks/notifications/Overall roles/module configurations and zero unvalidated FKs. Fixture teardown removed the upgrade data.

Implementation-head CI `ab8780b1e31016ea417b0013c519212a32baa2a3`: all five gates SUCCESS, full desktop browser337/337 PASS. See EVIDENCE CP-T08 for immutable run links. Final documentation head is checked again before delivery; the final SHA/check receipt is recorded in the owner report and local handoff.
