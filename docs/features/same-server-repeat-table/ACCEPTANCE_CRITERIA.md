# Acceptance criteria — Same-server repeat table (#166)

Status: ⬜ pending · ✅ proven (evidence in `IMPLEMENTATION_REPORT.md`).

## Turn identity and the decision

- [ ] AC-1 The database decides: the target cell's round `sequence` is read server-side and compared with the cell(s) where the same server already holds the table. No client timer, row-index assumption or client-supplied turn number.
- [ ] AC-2 Same cell, identical canonical label (retry / double submit) → no write, no event, no new Undo step.
- [ ] AC-3 Same server, held only in EARLIER turns → `PT409` `kind: 'same_server_repeat'` (with the previous assignment); **no mutation**.
- [ ] AC-4 Same server, held in the same-or-LATER turn than the target (filling an earlier hole) → `PT409` `kind: 'same_server'`, blocked even when confirmed; UI shows "T2 is already assigned to Sidhu." with no dialog.
- [ ] AC-5 `2` and `T2` are the same canonical table in every case above (no `2 != T2` regression).
- [ ] AC-6 `p_confirm_transfer` / `p_end_whole_assignment` alone never bypass the same-server rule.

## End Previous + Assign

- [ ] AC-7 `board_end_previous_and_assign` ends the previous entry (`status='ended'`, `ended_at`, `ended_by`; never deleted) and creates the new active entry in one transaction under the session lock.
- [ ] AC-8 Exactly ONE active physical claim for the table at every point (`section_assignments` unique index + trigger); one active entry holding it on the board.
- [ ] AC-9 The audit event is an `assign` with `repeat: true` and the ended previous entry in `displaced`; actor, time and canonical label recorded.
- [ ] AC-10 A repeat that also needs ANOTHER server's table, without `p_confirm_transfer`, is refused as `held` and rolls back the whole call (the previous entry is not left ended).
- [ ] AC-11 Retrying the confirmed call is idempotent (no second replacement).

## Combined assignments

- [ ] AC-12 A previous combined assignment (`T2 + T3`) is one lifecycle unit: End Previous ends the WHOLE row and releases both claims; only the wanted table (`T2`) is then assigned.
- [ ] AC-13 The dialog says so explicitly (names the combined assignment and which tables are also released).

## Cancel, history

- [ ] AC-14 Cancel makes no assignment mutation, writes no event, keeps the previous assignment and all counts.
- [ ] AC-15 After the replacement, Servers/session history keeps `T2 — ENDED` and shows the new `T2 — ACTIVE`; Grid keeps the ended cell struck through; Recent Activity says "assigned Table T2 to Sidhu again for turn N, ending the previous assignment".

## Cross-view, stale, realtime

- [ ] AC-16 After End Previous + Assign, Grid, Floor, Picker, Servers and Dashboard agree: one active T2, Sidhu its owner, the old lifecycle ended/history, the table occupied exactly once, Dashboard active count unchanged.
- [ ] AC-17 A stale client cannot bypass the database: a plain assign it believes is free gets the structured `same_server_repeat`; a stale confirmed repeat whose previous assignment is already gone simply assigns (one claim).
- [ ] AC-18 Realtime is unchanged (database truth → notification → invalidate/refetch); no lifecycle logic moved into Realtime.

## Undo / Redo

- [ ] AC-19 Undo of the replacement frees the new claim first, then reactivates the previous lifecycle (one active claim); Redo re-ends it and re-creates the new one. No change to `board_undo` / `board_redo`.

## Regression guards

- [ ] AC-20 Cross-server behaviour unchanged: held table → Transfer / End + Assign / Cancel; End Previous never takes another server's table.
- [ ] AC-21 `public.board_assign` keeps its single 8-argument signature and grants (no overload ambiguity).
- [ ] AC-22 Authorization unchanged (`auth.uid()`, active membership, tenant/session validation, historical-date lock, fixed `search_path`); the private implementation is not executable by public/anon/authenticated.

## Safety

- [ ] AC-23 Migration forward-only, applied to **DEV only**; PROD untouched, `main` untouched, no PROD migration.
