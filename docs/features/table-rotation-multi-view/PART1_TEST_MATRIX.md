# Table Rotation V2 Part 1 — Test Matrix (living)

**Target:** DEV only (`opmujepkemwcdxxorhfd`). **Acceptance IDs:** [`PART1_ACCEPTANCE_CRITERIA.md`](PART1_ACCEPTANCE_CRITERIA.md).
**Status:** `PASS` · `FAIL` · `BLOCKED` · `PENDING` (not run yet — never counted as pass).

Evidence legend: **R** = `tests/real/table-rotation-v2.db.real.test.ts` (hosted DEV, real JWT per user; run `npm run test:real`) · **P** = pgTAP `supabase/tests/database/0025_…` (+ updated 0006/0007/0013/0014/0019/0021/0024; run `npx supabase test db`) · **U** = Vitest · **B** = browser (Playwright / manual, two or more authenticated contexts).

## Automated suites (latest run)

| Suite                                | Command                 | Result                                                                |
| ------------------------------------ | ----------------------- | --------------------------------------------------------------------- |
| Real-mode DB/RPC (DEV)               | `npm run test:real`     | **40/40 PASS** (final migration set, 2026-10-23)                      |
| pgTAP (local Supabase, all 25 files) | `npx supabase test db`  | **PASS — 25 files, 343 assertions** (incl. new `0025`, 46 assertions) |
| Migrations from scratch              | `npx supabase db reset` | **PASS — 35 migrations apply cleanly, seed runs**                     |
| Vitest (domain/unit)                 | `npm test`              | see implementation report                                             |

## The 30 required scenarios

"DB" = database/RPC behavior proven by the real-mode suite; "UI" = the same behavior observed across the five views in a browser. A scenario is **PASS** only when every applicable level passed.

| #   | Scenario                                                                | View / action       | Actor           | Expected                           | Actual (DB level)                                                                                            | Auto/Manual | Evidence                                       | Status                   |
| --- | ----------------------------------------------------------------------- | ------------------- | --------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------- | ---------------------------------------------- | ------------------------ |
| 1   | Grid assigns A→1, switch Grid→Floor→Picker→Servers                      | Grid then all views | owner           | All agree                          | Entry + claim agree (R: extended scenario)                                                                   | Auto + B    | R `Extended…`                                  | PENDING (UI)             |
| 2   | A receives 1 and 5                                                      | Grid                | owner           | Both active                        | Both active, 2 claims                                                                                        | Auto        | R `S02`                                        | PASS (DB)                |
| 3   | B receives 15, then A receives 15                                       | Grid reassign       | owner           | B→15 ENDED, A→15 ACTIVE            | B ended (kept), A active, one claim; unconfirmed attempt refused                                             | Auto        | R `S03`, P §3                                  | PASS (DB)                |
| 4   | Grid 15→B, Picker later 15→A, views converge                            | Grid/Picker         | owner           | Converge                           | Same RPC path; one claim                                                                                     | Auto + B    | R `S03`                                        | PENDING (UI)             |
| 5   | Floor assigns Table 7→B, Grid + Servers reflect                         | Floor               | owner           | Reflect                            | (Floor uses the same `board_assign`)                                                                         | B           | —                                              | PENDING (UI)             |
| 6   | End Table 1 from Floor                                                  | Floor End           | manager         | Available/ended everywhere         | Entry ended, claim released                                                                                  | Auto + B    | R `S07`                                        | PENDING (UI)             |
| 7   | Owner assigns Table 10; TestManager Ends it (**D-01**)                  | RPC / Floor         | owner → manager | Succeeds                           | Succeeds; `assigned_by`=owner, `ended_by`=manager, event actor=manager; also staff, End+Assign, Undo/Redo    | Auto        | R `S07` ×4, P §2                               | PASS (DB)                |
| 8   | Transfer A→8, then 8→B (**D-07**)                                       | Floor Transfer      | manager         | No crash                           | DB: source ended, dest active, valid event, undoable ×2. Client reducer: sparse destination no longer throws | Auto        | R `S08`, U `V2 sparse boards`                  | PASS (DB, U); UI PENDING |
| 9   | Rapid reassignment A→10, B→10, C→10                                     | Grid                | owner/manager   | Only C active                      | A,B ended; C active                                                                                          | Auto        | R `S09`                                        | PASS (DB)                |
| 10  | Concurrent managers reassign Table 15                                   | RPC                 | two managers    | Exactly one final owner            | Exactly one active entry + one claim; others ended                                                           | Auto        | R `S10`                                        | PASS (DB)                |
| 11  | Browser A changes Table 3, browser B receives it without refresh        | Realtime            | two sessions    | Live update                        | —                                                                                                            | B           | —                                              | PENDING (UI)             |
| 12  | Assign Table 4 in Grid, immediately Floor                               | view switching      | owner           | Floor shows it                     | —                                                                                                            | B           | —                                              | PENDING (UI)             |
| 13  | Owner logs out; TestServer1 logs in — no demo/stale state (**D-04**)    | login               | owner → server  | No demo roster / stale owner state | —                                                                                                            | B           | —                                              | PENDING (UI)             |
| 14  | Clear Cell changes only the intended assignment                         | Grid                | manager         | Only that cell                     | Only m1's cell; m2's kept                                                                                    | Auto        | R `S14/S15`, P §8                              | PASS (DB)                |
| 15  | Undo Clear Cell restores it (**D-06**)                                  | Undo                | other actor     | Restored                           | Restored exactly (status, assigner); stack not wedged; Redo clears again; ended cell restores as ended       | Auto        | R `S14/S15`, R `Clear Cell of an ENDED…`, P §8 | PASS (DB)                |
| 16  | Clear Board ends intended active assignments                            | Grid                | manager         | Claims released                    | All entries removed, 0 claims                                                                                | Auto        | R `S16/17/18`                                  | PASS (DB)                |
| 17  | Undo Clear Board, no duplicate round sequence (**D-05**)                | Undo                | other actor     | Restored                           | Rounds/sequences/entries/claims restored; no duplicate sequence                                              | Auto        | R `S16/17/18`, P §8                            | PASS (DB)                |
| 18  | Redo Clear Board clears again                                           | Redo                | other actor     | Cleared                            | Cleared; Undo again stable                                                                                   | Auto        | R `S16/17/18`, P §8                            | PASS (DB)                |
| 19  | Combined Tables 5+6                                                     | Grid/Floor          | owner           | Consistent                         | Both claimed; partial takeover refused; whole takeover displaces whole                                       | Auto + B    | R `combined tables…`                           | PASS (DB); UI PENDING    |
| 20  | Refresh preserves authoritative state                                   | reload              | any             | Same state                         | —                                                                                                            | B           | —                                              | PENDING (UI)             |
| 21  | New service session does not inherit previous assignments               | session rollover    | owner           | Clean day                          | Yesterday's active claim does not appear today; table reusable; history intact                               | Auto        | R `S21`                                        | PASS (DB)                |
| 22  | Historical edit is blocked                                              | RPC                 | owner           | Rejected                           | "previous day's service"                                                                                     | Auto        | R `S22`, P §4                                  | PASS (DB)                |
| 23  | Today's session passed against an old assignment is rejected (**D-02**) | RPC                 | owner/staff     | Rejected                           | All nine ID-bearing RPCs reject; nothing changed; also structural FK/identity checks                         | Auto        | R `S23` + structural ×3, P §4                  | PASS (DB)                |
| 24  | Staff cannot forge/update/delete `board_events` (**D-08**)              | PostgREST           | server (+owner) | Denied                             | `42501` for insert/update/delete, even for owner; events unchanged                                           | Auto        | R `S24`, P §5                                  | PASS (DB)                |
| 25  | Server with active tables cannot be removed                             | Remove server       | manager         | Blocked until End/Transfer         | Blocked; pause allowed; after End removal works                                                              | Auto        | R `S25`, P §7                                  | PASS (DB)                |
| 26  | Skip does not End existing tables                                       | Skip                | owner           | Table stays                        | Table 11 stays active/claimed                                                                                | Auto        | R `S26`                                        | PASS (DB)                |
| 27  | Reorder changes order but not ownership                                 | Reorder             | owner           | Ownership unchanged                | Positions change; claims unchanged; Undo restores order                                                      | Auto        | R `S27`, U reorder                             | PASS (DB, U)             |
| 28  | Network reconnect rehydrates with no duplicates                         | Realtime/client     | any             | Authoritative, no duplicates       | —                                                                                                            | U + B       | —                                              | PENDING                  |
| 29  | Back/Forward cannot overwrite newer state with stale client state       | browser nav         | any             | No stale overwrite                 | —                                                                                                            | B           | —                                              | PENDING (UI)             |
| 30  | Rapid switching Grid/Floor/Picker/Servers/Dashboard                     | view switching      | any             | Never divergent                    | —                                                                                                            | U + B       | —                                              | PENDING (UI)             |

## Extended live service scenario (A/B/C)

| Step                     | Expected final           | Actual (DB)                                                         | Status                           |
| ------------------------ | ------------------------ | ------------------------------------------------------------------- | -------------------------------- |
| Row 1: A→1, B→15, C→16   |                          |                                                                     |                                  |
| Row 2: 15 B→A, B→11, C→2 |                          |                                                                     |                                  |
| Row 3: A→7               | A→1,15,7 · B→11 · C→16,2 | Active entries and claims exactly as expected; B's 15 kept as ENDED | PASS (DB) — five-view UI PENDING |

## Defect closure traceability

| Defect | Test evidence (R = real-mode, P = pgTAP, U = unit, B = browser) | Status                                 |
| ------ | --------------------------------------------------------------- | -------------------------------------- |
| D-01   | R `S07` ×4 · P §2                                               | PASS (DB) — UI confirmation PENDING    |
| D-02   | R `S22`, `S23`, structural ×3, `S21` · P §4                     | PASS                                   |
| D-03   | U `use-board-realtime` · B                                      | PENDING                                |
| D-04   | U / B                                                           | PENDING                                |
| D-05   | R `S16/17/18` · P §8                                            | PASS                                   |
| D-06   | R `S14/S15` · P §8                                              | PASS                                   |
| D-07   | U `V2 sparse boards` · R `S08` · B                              | PASS (U, DB) — UI confirmation PENDING |
| D-08   | R `S24` · P §5                                                  | PASS                                   |

## Additional real-mode checks (not numbered scenarios)

| Check                                                                                 | Evidence         | Status |
| ------------------------------------------------------------------------------------- | ---------------- | ------ |
| Anonymous cannot execute board RPCs                                                   | R, P §6          | PASS   |
| Other-organization member / foreign session / foreign location rejected               | R, P §6          | PASS   |
| Deactivated member and deactivated organization creator rejected (membership-only)    | R                | PASS   |
| Staff server cannot open the day, can join an open floor                              | R                | PASS   |
| A previous day's board cannot be opened                                               | R                | PASS   |
| Direct DML on entries/rounds/members/ledger/sessions denied for owner, manager, staff | R                | PASS   |
| Finalized tips lock the board for every role; reopening unlocks it                    | R, P (0013/0014) | PASS   |
| Table 15 active at two locations of one organization, independently                   | R                | PASS   |
| Concurrent unconfirmed assignments: one wins, one refused, one claim                  | R                | PASS   |
| Concurrent Undo calls are serialized                                                  | R                | PASS   |
| Undo/Redo of Skip, Add/Delete Row, Pause, Remove, Reorder, reassign                   | R                | PASS   |
