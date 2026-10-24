# Table Rotation V2 Part 1 — Acceptance Criteria

**Branch:** `upgrade/table-allocation-v2-part1` · **Plan:** [`VERSION_UPGRADE_PART1_PLAN.md`](VERSION_UPGRADE_PART1_PLAN.md) · **Test matrix:** [`PART1_TEST_MATRIX.md`](PART1_TEST_MATRIX.md) · **Target:** DEV only (`opmujepkemwcdxxorhfd`)

A criterion is **PASS** only when its validation method has run and passed. Status vocabulary: `PASS`, `FAIL`, `BLOCKED`, `PENDING`.

Validation methods:

| Code      | Meaning                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------ |
| `REAL-DB` | `tests/real/table-rotation-v2.db.real.test.ts` — hosted DEV, real Auth JWTs per user, real RLS/grants/triggers     |
| `REAL-UI` | `tests/real/ui/*` or manual Playwright against the DEV-pinned app with two or more authenticated browser contexts  |
| `UNIT`    | Vitest on pure domain / client code                                                                                |
| `PGTAP`   | `supabase/tests/database/*.test.sql` (run against DEV inside a rolled-back transaction when Docker is unavailable) |

Statuses are PASS as of the final Part 1 gate; the evidence for each is in [`PART1_TEST_MATRIX.md`](PART1_TEST_MATRIX.md). `REAL-UI` = `npm run test:real:ui` (Playwright, three signed-in contexts, DEV-pinned app).

## A. Canonical identity and ownership

| ID    | Requirement                       | Expected behavior                                                                                                                                                              | Validation    | Status |
| ----- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- | ------ |
| AC-01 | Canonical table identity          | Every view resolves a table through the one `dining_tables` row of its location. No view owns separate table records. Two locations may both have "Table 15".                  | REAL-DB, UNIT | PASS   |
| AC-02 | Table identity is location-scoped | A physical claim's table, session and location are provably one location (composite FKs). Table 15 can be ACTIVE at two locations at once; ending one never touches the other. | REAL-DB       | PASS   |
| AC-03 | Single active owner per table     | For one service session a table has at most one active claim. Never two ACTIVE owners, including under concurrent managers.                                                    | REAL-DB       | PASS   |
| AC-04 | Multiple tables per server        | One server can own several active tables; receiving a table never ends the receiver's other tables.                                                                            | REAL-DB       | PASS   |
| AC-05 | Combined tables                   | `5+6` claims both tables; a combined assignment is displaced only as a whole.                                                                                                  | REAL-DB       | PASS   |

## B. Authorization, End, Reassign, Transfer

| ID    | Requirement                          | Expected behavior                                                                                                                                                                                                                           | Validation    | Status |
| ----- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------ |
| AC-10 | Cross-manager End (D-01)             | Any authorized active member can End an assignment created by another member. `assigned_by` stays the original assigner; the closer is recorded in `ended_by` and the `end` event actor.                                                    | REAL-DB       | PASS   |
| AC-11 | Cross-actor End+Assign / Undo / Redo | The same holds for End+Assign, and for Undo/Redo of another actor's operation.                                                                                                                                                              | REAL-DB       | PASS   |
| AC-12 | Atomic reassignment                  | Assigning a held table with explicit confirmation ENDS the previous owner's entry (kept as history) and creates the new one in one transaction. Without confirmation it is refused unchanged.                                               | REAL-DB       | PASS   |
| AC-13 | Transfer                             | Transfer keeps the table identity, ends the source entry (history kept), creates the destination entry, writes a valid audit event, never crashes the client, and is undoable.                                                              | REAL-DB, UNIT | PASS   |
| AC-14 | Clear Cell                           | Clears only the intended cell; its Undo restores the exact row (label, status, original assigner, ended\_\*); clearing an empty cell is a no-op that adds no undo step.                                                                     | REAL-DB       | PASS   |
| AC-15 | Role boundaries                      | Anonymous, other-organization, deactivated and non-member callers are rejected by every board RPC; a staff server cannot open the day; only today's board can be opened. Authority is the membership row, never `organizations.created_by`. | REAL-DB       | PASS   |
| AC-16 | Remove server guard                  | A server with active tables cannot be removed (End/Transfer first); pausing is allowed and leaves ownership alone.                                                                                                                          | REAL-DB       | PASS   |
| AC-17 | Skip / Reorder do not move ownership | Skip changes future rotation state only. Reorder changes rotation order only.                                                                                                                                                               | REAL-DB       | PASS   |

## C. Session integrity and history

| ID    | Requirement               | Expected behavior                                                                                                                                                                                  | Validation | Status |
| ----- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ |
| AC-20 | Session integrity (D-02)  | An entry's round, member and session are provably one session (composite FKs). Moving an entry, or lying about its session, is rejected even for the service role.                                 | REAL-DB    | PASS   |
| AC-21 | Historical immutability   | A previous day's board is read-only, and the lock is derived from the row's own session — not from the session id the caller supplies. Supplying today's session against an old round is rejected. | REAL-DB    | PASS   |
| AC-22 | Finalized-tips lock       | A finalized day locks the board for every role until reopened.                                                                                                                                     | REAL-DB    | PASS   |
| AC-23 | Session rollover          | Yesterday's active claims do not leak into today. Historical data remains queryable.                                                                                                               | REAL-DB    | PASS   |
| AC-24 | Audit immutability (D-08) | Clients cannot INSERT, UPDATE or DELETE `board_events`. The actor of every event is derived from the authenticated context. Only `undone_at` may change, and only inside Undo/Redo.                | REAL-DB    | PASS   |
| AC-25 | One mutation boundary     | Authenticated clients have no INSERT/UPDATE/DELETE on the rotation graph, the physical ledger or service sessions; every change goes through a `board_*` RPC. Reads remain.                        | REAL-DB    | PASS   |

## D. Undo / Redo

| ID    | Requirement                 | Expected behavior                                                                                                                                                        | Validation | Status |
| ----- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------ |
| AC-30 | Clear Board Undo (D-05)     | Undo restores every round, sequence and entry with no duplicate `rotation_rounds.sequence`; Redo clears again; the cycle is stable.                                      | REAL-DB    | PASS   |
| AC-31 | Clear Cell Undo/Redo (D-06) | Undo restores the cell; Redo clears it; the undo stack is never wedged by an "unsupported" event.                                                                        | REAL-DB    | PASS   |
| AC-32 | Undo/Redo of every command  | Assign (incl. reassign), End, End+Assign, Transfer, Skip, Clear Row/Column/Board/Cell, Add/Delete Row, Pause/Remove, Reorder all reverse and re-apply deterministically. | REAL-DB    | PASS   |
| AC-33 | Concurrent Undo             | Concurrent Undo/Redo is serialized per board; each call acts on a distinct event.                                                                                        | REAL-DB    | PASS   |

## E. Read model, views, client

| ID    | Requirement                              | Expected behavior                                                                                                                                                                       | Validation    | Status |
| ----- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------ |
| AC-40 | Cross-view consistency                   | Grid, Floor, Picker, Servers and Dashboard are projections of one board read model; one mutation is reflected identically in all five.                                                  | UNIT, REAL-UI | PASS   |
| AC-41 | Grid history vs current state            | Grid keeps ENDED history (B's old 15 stays visible, lifecycle ENDED); Floor/Picker/Servers show only the current owner.                                                                 | UNIT, REAL-UI | PASS   |
| AC-42 | Authoritative reconciliation             | The read model carries the server's active physical claims and flags any disagreement with the Grid-derived occupancy instead of silently choosing one.                                 | UNIT          | PASS   |
| AC-43 | Realtime authenticates first (D-03)      | The client applies the user's JWT to Realtime before subscribing; on user change it unsubscribes, clears stale state, re-hydrates and re-subscribes.                                    | UNIT, REAL-UI | PASS   |
| AC-44 | Realtime propagation                     | Browser A's change reaches browser B without a refresh (fresh page loads included).                                                                                                     | REAL-UI       | PASS   |
| AC-45 | No stale demo state after login (D-04)   | After in-place login the roster, occupancy and lock state are the authenticated user's immediately — never demo data.                                                                   | UNIT, REAL-UI | PASS   |
| AC-46 | Transfer never crashes the client (D-07) | A Transfer to a server with no materialized cell in the destination round (sparse board) produces the correct board.                                                                    | UNIT, REAL-UI | PASS   |
| AC-47 | View switching and refresh               | Assigning in one view and immediately switching shows the assignment; refresh and reconnect re-hydrate authoritative state without duplicates; Back/Forward cannot restore stale state. | REAL-UI       | PASS   |

## F. Future compatibility (non-functional)

| ID    | Requirement                                | Expected behavior                                                                                                                                                                      | Validation      | Status |
| ----- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------ |
| AC-50 | No single-org / single-location assumption | Authorization is one seam (`private.can_operate_board(org, location)`); table identity and uniqueness are location-scoped; nothing makes Table Rotation mandatory for an organization. | REAL-DB, review | PASS   |
| AC-51 | Other modules unaffected                   | Schedule, Team, Attendance, Tips, Payroll scoping and the Tips finalize lock are unchanged.                                                                                            | UNIT, PGTAP     | PASS   |
