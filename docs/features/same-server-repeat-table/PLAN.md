# Same-server repeat table (#166)

Branch `fix/table-allocation-same-server-repeat` → `development` (merge commit). `main` and PROD untouched.

## Why

Cross-server conflicts are correct and must not regress: `T18` held by Conan, Sidhu asks for `18` → canonical `T18` → _Transfer to Sidhu / End Conan's assignment and assign T18 to Sidhu / Cancel_.

The bug is the **same server** reaching a later legitimate rotation turn that is given a table it already holds. The operator typed `2` → canonical `T2` and got "T2 is already assigned to Sidhu." — a dead end. The previous lifecycle must close and a new one begin, in one safe step, without turning every accidental duplicate into a new turn.

## Non-goals

No change to cross-server Transfer / End + Assign, no new event type or enum value, no change to Undo/Redo functions, no RLS or grant widening, no change to Realtime (database truth → invalidate → refetch), no PROD change, no Bar Inventory / Tasks / Tips work.

## Audit (answers)

| Question                                                            | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What identifies a rotation turn?                                    | One board **cell**: `(table_rotation_entries.rotation_round_id, rotation_member_id)`, unique per cell. A server's turns are ordered by `rotation_rounds.sequence` (row 1, 2, 3 …). There was never a separate "turn counter" — the round row _is_ the turn.                                                                                                                                                                                                     |
| What identifies a board row / a rotation member?                    | Row = `rotation_rounds.id` (+ `sequence`). Member = `rotation_members.id` (a server's column in one `service_session`; `server_profile_id` is the person). The client's `RotationColumn.id` is the profile id; actions map it to the member id server-side.                                                                                                                                                                                                     |
| How can the DB distinguish a retry from a later legitimate turn?    | By comparing the **target cell** with the cell holding the table: _same cell_ ⇒ retry / in-place edit; _held only in earlier-sequence cells_ ⇒ legitimate later turn; _held in the same-or-later sequence than the target_ ⇒ not a later turn. The target round id is validated against the session (`assert_round_in_session`) and its `sequence` is read **in the database** — no client timer, no row-index guess, nothing client-supplied but the round id. |
| Where did the `same_server` conflict originate?                     | `public.board_assign` (latest body in `20261026120000`): "A server never holds the same table twice" → `PT409` `kind: 'same_server'`, regardless of turn, even with `p_confirm_transfer`. The client mirrored it in `classifyTableClaim` (`domain/table-conflict.ts`) and `applyBoardAction` (demo reducer).                                                                                                                                                    |
| Can `board_end_and_assign` safely handle a same-server replacement? | No. It ends the member's chosen rounds, then inserts the label into the member's **first empty round** (not the cell the operator targeted), runs no turn check, no canonical-conflict check against other servers, and has no stale-state protection beyond "those rounds are still active". Used by Floor's "End existing & assign" for _different_ tables. Not reused.                                                                                       |
| Does its authorization assume different source/target users?        | No — all board mutations share `private.begin_board_write` (`auth.uid()`, active floor-team membership, tenant/session validation, historical-date lock). Source and target may be the same member.                                                                                                                                                                                                                                                             |
| How does a combined assignment behave?                              | A combined label (`T2 + T3`) is **one** `table_rotation_entries` row ⇒ one lifecycle unit. Ending it ends the whole row and releases every physical claim in it (`sync_table_occupancy`). Cross-server End + Assign already passes `p_end_whole_assignment` for the same reason.                                                                                                                                                                                |
| How does Undo/Redo identify an action?                              | `board_events` rows (`event_type`, `payload`, `inverse_payload`, serialized by the session lock). The `assign` branch undoes the target cell then `reactivate_entries(inverse.displaced)`; redo does `end_entries(payload.displaced)` then upserts the cell. A same-server replacement reuses this: the ended previous entries go into `displaced`.                                                                                                             |
| What guarantees one active physical claim?                          | Partial unique index `section_assignments_active_table_uq` + `sync_table_occupancy` trigger (end releases, insert claims) + the session lock. A replacement ends first, then inserts, inside one transaction.                                                                                                                                                                                                                                                   |

## Decision table (server-authoritative)

Request: canonicalize label (`2` ≡ `T2`) → resolve the server's own other active entries that overlap → compare turns.

| Case                                                                                         | DB result                                                                                                | UI                                                                        |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Table free                                                                                   | assign                                                                                                   | unchanged                                                                 |
| Another server holds it                                                                      | `PT409` `held` (unchanged) → Transfer / End + Assign / Cancel                                            | unchanged                                                                 |
| **A. Same cell**, identical canonical label (retry, double submit)                           | idempotent **no-op**: no write, no event, no new Undo step                                               | nothing visible                                                           |
| **B. Same server, held only in EARLIER turns**                                               | `PT409` `kind: 'same_server_repeat'` (+ `holders` = the previous assignment). **No mutation.**           | _End Previous + Assign / Cancel_ (no Transfer)                            |
| **B′. Confirmed** (`board_end_previous_and_assign`)                                          | one transaction: end previous (whole), insert new, `repeat: true` event                                  | converges                                                                 |
| **C. Same server, held in the same-or-later turn than the target** (filling an earlier hole) | `PT409` `kind: 'same_server'` (blocked, **even if confirmed**)                                           | notice "T2 is already assigned to Sidhu." — unchanged wording, no dialog  |
| Repeat that also needs another server's table                                                | `board_end_previous_and_assign` without `p_confirm_transfer` ⇒ `held` `PT409`, **whole call rolls back** | held dialog (Transfer hidden), confirm sends both flags — one atomic call |

Why a _separate_ confirmation RPC and not a flag on `p_confirm_transfer`: a stale client that confirmed "End Conan's assignment" must never silently end the server's _own_ previous assignment as well. The confirmation is specific to what the operator saw.

Why an RPC wrapper instead of a 9th argument on `board_assign`: no overload churn (PostgREST ambiguity was a past production bug, PGRST201), existing pgTAP/real-suite signature assertions and old clients keep working. `public.board_assign` keeps its exact 8-argument signature and grants; both public functions are thin wrappers over `private.assign_table(…, p_end_previous)`.

## Data / API contract

- Migration `20261026150000_table_allocation_same_server_repeat.sql` (forward-only, no table/column change, no data rewrite):
  - `private.end_own_previous_entries(session, own jsonb)` — ends the listed active entries (`status='ended'`, `ended_at`, `ended_by`), returns the `{round_id, member_id}` list undo/redo replay.
  - `private.assign_table(…, p_end_previous)` — the former `board_assign` body plus the turn comparison and the idempotent same-cell return.
  - `public.board_assign` (8 args, unchanged signature/grants) → wrapper, `p_end_previous = false`.
  - `public.board_end_previous_and_assign` (8 args) → wrapper, `p_end_previous = true`.
- `PT409` detail JSON: `kind ∈ {held, same_server, same_server_repeat}`, `holders[] = {member_id, round_id, assignment_label}` (canonical labels).
- Event: same `assign` event, `payload.repeat = true`, `payload.displaced` includes the ended previous entries. **No enum change, no change to `board_undo` / `board_redo`.**

## Client

- `classifyTableClaim` gains `same-server-repeat` (`previous[]` = the server's earlier assignments). The target turn is the chosen cell (Grid, Picker) or the server's earliest empty round (Floor, Servers) — the same cell the assign will write. A target the board cannot place is treated as a later turn (the database decides regardless).
- `useTableClaim` (the one shared flow for Grid / Floor / Picker / Servers) renders the repeat dialog; `Dashboard` stays read-only. `ClaimRequest.endPrevious` keeps the follow-up held dialog ending the server's previous assignment (mixed case) and hides Transfer there.
- `BoardAction.assign.endPrevious` → `executeBoardActionRemote` calls `board_end_previous_and_assign`; `applyBoardAction` mirrors it for demo mode / optimistic state; conflict mapping accepts `same_server_repeat`.
- Copy (single): "T2 is already assigned to Sidhu. End Sidhu's previous T2 assignment and assign T2 to Sidhu for this turn?" — buttons **End Previous + Assign**, **Cancel**.
- Copy (combined): "T2 is already assigned to Sidhu as part of the combined assignment T2 + T3. End Previous + Assign ends the entire T2 + T3 assignment (T3 will be released too), then assigns T2 to Sidhu for this turn."
- Recent activity: "assigned Table T2 to Sidhu again for turn N, ending the previous assignment".

## Accessibility / responsive

The repeat dialog is the existing `Dialog` (native `<dialog>`, focus trap, Escape = Cancel) with the same button sizes as the held dialog; copy is plain text, no colour-only meaning; unchanged on tablet and mobile (matrix runs on all three Playwright projects).

## Rollout / rollback

Forward-only migration, applied to **DEV only** in this task. Old frontend + new schema: `board_assign` behaves as before except `kind` can now be `same_server_repeat` (the old client falls through to its generic error path — no mutation). New frontend + old schema: `board_end_previous_and_assign` missing ⇒ the confirm button errors, no mutation. Rollback: promote the previous deployment; for the database ship a forward corrective migration restoring the 20261026120000 `board_assign` body (never a destructive revert). PROD receives it only through the normal migrations-first release.

## Risks / decisions

- **Hole before the held turn** (case C) stays blocked rather than offering End Previous: filling an earlier empty cell with a table the server holds in a later turn is not a "later turn". The operator clears or fixes the hole. Documented, tested (SS-001, XM-020).
- **Idempotent same-cell return** is a deliberate behaviour change: an identical re-submit used to rewrite `assigned_at`/`assigned_by` and emit an event. Exact stored-label equality only, so a legacy label (`1` where T1 is now registered) is still rewritten to canonical on the next write.
- Concurrent confirmed repeats by two clients are serialized by the session lock; the second sees the first's entry and, if its own target is not later, is blocked (`same_server`) — never two active claims.

## Open questions

None blocking. Owner may later want an explicit "turn N" in the dialog copy; the data is available (`holders[].round_id`).

## Codex build prompt

Implemented directly by Claude under the owner's explicit task instruction (division of responsibility changed for this task). No Codex handoff required.
