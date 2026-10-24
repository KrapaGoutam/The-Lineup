# Table Rotation V2 Part 1 — Test Matrix (living)

**Target:** DEV only (`opmujepkemwcdxxorhfd`). **Acceptance IDs:** [`PART1_ACCEPTANCE_CRITERIA.md`](PART1_ACCEPTANCE_CRITERIA.md).
**Status:** `PASS` · `FAIL` · `BLOCKED` · `PENDING` (not run — never counted as pass).

Evidence legend: **R** = `tests/real/table-rotation-v2.db.real.test.ts` (hosted DEV, real JWT per user; `npm run test:real`) · **B** = `tests/real/ui/*.real.spec.ts` (Playwright, three independently signed-in browser contexts against a DEV-pinned app; `npm run test:real:ui`) · **P** = pgTAP `supabase/tests/database/0025_…` (+ updated 0006/0007/0013/0014/0019/0021/0024; `npx supabase test db`) · **U** = Vitest.

## Automated suites (latest run)

| Suite                                          | Command                                       | Result                                              |
| ---------------------------------------------- | --------------------------------------------- | --------------------------------------------------- |
| Real-mode DB/RPC (hosted DEV)                  | `npm run test:real`                           | **40/40 PASS**                                      |
| Real-mode browser (3 contexts, DEV-pinned app) | `npm run test:real:ui`                        | **15/15 PASS** (14 scenarios + extended A/B/C)      |
| pgTAP (local Supabase, all files)              | `npx supabase test db`                        | **25 files / 343 assertions PASS** (new `0025`: 46) |
| Migrations from scratch                        | `npx supabase db reset`                       | **35 migrations apply cleanly**                     |
| Vitest                                         | `npm test`                                    | **428/428 PASS**                                    |
| Demo-mode e2e (what CI runs)                   | `npx playwright test --project=desktop`       | **all PASS** after the date-pinning fix below       |
| lint · typecheck · format                      | `npm run lint` / `typecheck` / `format:check` | **PASS**                                            |

Pre-existing, unrelated: four attendance/dashboard e2e specs were hard-wired to September and failed on the base commit once the calendar month changed (verified by running them against `3403058`'s `src`). They now pin the browser clock to the fixture month.

## The 30 required scenarios

"DB" = RPC/RLS behaviour proven by R/P. "UI" = observed in a browser (B). A scenario is PASS when every applicable level passed; where a scenario has no distinct UI surface the note says so.

| #   | Scenario                                                          | Actor            | Result                                                                                                                                                        | Evidence                   | Status                                  |
| --- | ----------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | --------------------------------------- |
| 1   | Assign A→1, switch Grid→Floor→Picker→Servers (→Dashboard)         | owner            | All views agree immediately; Servers "1 table"; Dashboard 1                                                                                                   | B S01/S12/S30, R extended  | **PASS** (DB + UI)                      |
| 2   | A receives 1 and 5                                                | owner / manager  | Both active, both claimed; Servers "3 tables" with T5, T10, T11                                                                                               | R `S02`, B S02             | **PASS** (DB + UI)                      |
| 3   | B receives 15, then A receives 15                                 | owner            | B→15 ENDED (kept), A→15 ACTIVE, one claim; unconfirmed attempt refused. Grid typing sends the confirmation                                                    | R `S03`, P §3, B extended  | **PASS** (DB + UI)                      |
| 4   | Grid 15→B, later 15→A; views converge                             | owner            | Converges through Grid typing (extended scenario) and Floor Transfer. **Picker deliberately does not take a held table** (unchanged product rule, see report) | B extended, R              | **PASS** (with noted Picker rule)       |
| 5   | Floor assigns Table 7→B; Grid and Servers reflect it              | manager          | Floor assigns are visible in Grid/Servers/Dashboard                                                                                                           | B S01, S11                 | **PASS** (UI)                           |
| 6   | End Table from Floor; all views reflect available/ended           | manager          | T1 ended; Floor "available" in both browsers; Grid keeps history                                                                                              | B S07                      | **PASS** (DB + UI)                      |
| 7   | Owner assigns; TestManager Ends it (**D-01**)                     | owner → manager  | Succeeds; `assigned_by`=owner, `ended_by`=manager, event actor=manager; also End+Assign, Undo, Redo cross-actor; in the browser the owner sees it live        | R `S07`×4, P §2, B S07     | **PASS** (DB + UI)                      |
| 8   | Transfer A→8, then 8→B (**D-07**)                                 | manager          | No client error; source ended, destination active; Servers "2 tables"; Undo ×2 restores                                                                       | R `S08`, U sparse, B S08   | **PASS** (DB + U + UI)                  |
| 9   | Rapid reassignment A→10, B→10, C→10                               | owner / manager  | A,B ended; only C active                                                                                                                                      | R `S09`                    | **PASS** (DB)                           |
| 10  | Concurrent managers reassign Table 15                             | two managers     | Exactly one active entry and one claim                                                                                                                        | R `S10`                    | **PASS** (DB)                           |
| 11  | Browser A changes Table 3; browser B sees it without refresh      | two sessions     | Fresh-loaded page still receives the update                                                                                                                   | B S11                      | **PASS** (UI)                           |
| 12  | Assign in Grid/Floor and immediately switch                       | owner            | Next view already shows it                                                                                                                                    | B S01/S12/S30              | **PASS** (UI)                           |
| 13  | Owner logs out; another user logs in (**D-04**)                   | owner → server   | No demo roster, no previous user's identity at any DOM mutation; real state immediately                                                                       | B S13 (+ negative control) | **PASS** (UI)                           |
| 14  | Clear Cell changes only the intended assignment                   | manager          | Only that cell; siblings kept                                                                                                                                 | R `S14`, B S14             | **PASS** (DB + UI)                      |
| 15  | Undo Clear Cell restores it (**D-06**)                            | manager          | Restored exactly (status, assigner); Redo clears again; second browser converges                                                                              | R, P §8, B S15             | **PASS** (DB + UI)                      |
| 16  | Clear Board ends the intended active assignments                  | manager          | All four held tables released                                                                                                                                 | R `S16`, B S16             | **PASS** (DB + UI)                      |
| 17  | Undo Clear Board, no duplicate round sequence (**D-05**)          | manager          | Everything restored; no duplicate sequence                                                                                                                    | R `S17`, P §8, B S17       | **PASS** (DB + UI)                      |
| 18  | Redo Clear Board clears again                                     | manager          | Cleared; Undo again stable                                                                                                                                    | R `S18`, B S18             | **PASS** (DB + UI)                      |
| 19  | Combined Tables 5+6                                               | owner            | Both claimed; partial takeover refused; whole takeover displaces the whole                                                                                    | R                          | **PASS** (DB; no dedicated UI scenario) |
| 20  | Refresh preserves authoritative state                             | any              | Same state after reload (and after the extended scenario)                                                                                                     | B S20, extended            | **PASS** (UI)                           |
| 21  | New service session does not inherit previous assignments         | owner            | Yesterday's claim not visible today; table reusable; history intact                                                                                           | R `S21`                    | **PASS** (DB)                           |
| 22  | Historical edit blocked                                           | owner            | "previous day's service"                                                                                                                                      | R `S22`, P §4              | **PASS** (DB)                           |
| 23  | Today's session against an old assignment rejected (**D-02**)     | owner / staff    | All nine ID-bearing RPCs reject; nothing changed; structural FK/identity checks                                                                               | R `S23`+3, P §4            | **PASS** (DB)                           |
| 24  | Staff cannot forge/update/delete `board_events` (**D-08**)        | server (+ owner) | `42501` for insert/update/delete even for owner; events unchanged                                                                                             | R `S24`, P §5              | **PASS** (DB)                           |
| 25  | Server with active tables cannot be removed                       | manager          | Blocked with a clear message in the Grid; pause allowed; after End removal works                                                                              | R `S25`, P §7, B S25       | **PASS** (DB + UI)                      |
| 26  | Skip does not End existing tables                                 | owner            | Table stays active/claimed                                                                                                                                    | R `S26`, U                 | **PASS** (DB, U)                        |
| 27  | Reorder changes order, not ownership                              | manager          | Servers order changes, claims unchanged, Undo restores                                                                                                        | R `S27`, U, B S27          | **PASS** (DB + UI)                      |
| 28  | Network reconnect rehydrates, no duplicates                       | any              | Offline context catches up on reconnect (re-join refetch)                                                                                                     | B S28, U realtime          | **PASS** (UI + U)                       |
| 29  | Back/Forward cannot overwrite newer state with stale client state | any              | Newer table visible after back/forward                                                                                                                        | B S29                      | **PASS** (UI)                           |
| 30  | Rapid view switching never diverges                               | any              | 4× full cycle, state identical                                                                                                                                | B S01/S12/S30              | **PASS** (UI)                           |

## Extended live-service scenario (A/B/C)

Driven through the Grid exactly as typed, verified from a second signed-in browser.

| Step                   | Expected final           | Actual                                                                                                                                                        | Status                      |
| ---------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Row 1 A→T1 B→T15 C→T16 |                          |                                                                                                                                                               |                             |
| Row 2 A→T15 B→T11 C→T2 |                          | A's T15 ended B's T15 atomically                                                                                                                              |                             |
| Row 3 A→T7             | A→1,15,7 · B→11 · C→16,2 | Floor ✔ · Picker (map popup) ✔ · Servers 3/1/2 tables ✔ · Dashboard Active tables 6 ✔ · Grid keeps B's T15 ENDED, A's T15 active ✔ · reload unchanged ✔ | **PASS** (B extended; DB R) |

## Defect closure

| Defect | Evidence                                                   | Status   |
| ------ | ---------------------------------------------------------- | -------- |
| D-01   | R `S07`×4 · P §2 · B S07                                   | **PASS** |
| D-02   | R `S21–S23`+structural · P §4                              | **PASS** |
| D-03   | U `use-board-realtime` (7) · B S11                         | **PASS** |
| D-04   | B S13 (negative control: old sign-in code fails the suite) | **PASS** |
| D-05   | R `S16–S18` · P §8 · B S16–S18                             | **PASS** |
| D-06   | R `S14/S15` · P §8 · B S14/S15                             | **PASS** |
| D-07   | U `V2 sparse boards` · R `S08` · B S08                     | **PASS** |
| D-08   | R `S24` · P §5                                             | **PASS** |

## Additional checks

| Check                                                                                   | Evidence   | Status |
| --------------------------------------------------------------------------------------- | ---------- | ------ |
| Anonymous cannot execute board RPCs                                                     | R, P §6    | PASS   |
| Other-organization member / foreign session / foreign location rejected                 | R, P §6    | PASS   |
| Deactivated member and deactivated org creator rejected (membership-only)               | R          | PASS   |
| Staff can join an open floor but cannot open the day; a previous day can't be opened    | R          | PASS   |
| Direct DML on entries/rounds/members/ledger/sessions denied for owner/manager/staff     | R          | PASS   |
| Finalized tips lock every role; reopening unlocks                                       | R, P       | PASS   |
| Table 15 active at two locations of one organization, independently                     | R          | PASS   |
| Concurrent unconfirmed assignments: one wins, one refused, one claim                    | R          | PASS   |
| Concurrent Undo serialized                                                              | R          | PASS   |
| Optimistic trailing row ("round-N") resolves to the real row (no "row is not on board") | B extended | PASS   |
| No unexpected page errors across contexts                                               | B          | PASS   |
