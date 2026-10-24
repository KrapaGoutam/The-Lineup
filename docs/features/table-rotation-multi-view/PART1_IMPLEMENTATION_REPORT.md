# Table Rotation V2 Part 1 — Implementation Report

**Branch:** `upgrade/table-allocation-v2-part1` · **Parent issue:** #101 · **Milestone:** Table Allocation V2 — Part 1
**Environment:** DEV only (`the-lineup-dev`, `opmujepkemwcdxxorhfd`). **PROD touched: NO.** Nothing merged to `main`.
Companion documents: [audit](VERSION_UPGRADE_PART1_AUDIT.md) · [plan](VERSION_UPGRADE_PART1_PLAN.md) · [acceptance criteria](PART1_ACCEPTANCE_CRITERIA.md) · [test matrix](PART1_TEST_MATRIX.md).

## 1. Outcome

The two P0 and six P1 defects confirmed by the DEV validation are fixed and verified on real DEV data with separate authenticated sessions, at the database level (real-mode RPC suite + pgTAP) and in the browser (three independently signed-in contexts).

| Defect | Was                                                | Now                                                                                                                      | Evidence                             |
| ------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| D-01   | Only the assigner could End / Undo / Redo (42501)  | Any active board member can; `assigned_by` stays the original assigner, closer recorded in `ended_by` + event actor      | R `S07`×4, P §2, B S07               |
| D-02   | No same-session integrity; historical lock bypass  | Composite FKs make round/member/entry/claim one session and one location; the lock is derived from the row's own session | R `S21–S23`, P §4                    |
| D-03   | Realtime joined as `anon` on fresh load            | JWT applied before subscribe; every (re)join refetches authoritative state                                               | U `use-board-realtime`, B S11        |
| D-04   | Stale demo roster / occupancy after in-place login | Authenticated workspace re-seeded on identity change; pending "signing in" state; no demo roster in real mode            | B S13 (+ negative control)           |
| D-05   | Undo of Clear Board always failed (sequence clash) | Trailing blank rows removed before the snapshot is restored; Redo/Undo cycle stable                                      | R `S16–S18`, P §8, B S16–S18         |
| D-06   | Clear Cell had no Undo and wedged the stack        | Snapshot-based Undo/Redo; clearing an empty cell is a no-op                                                              | R `S14/S15`, P §8, B S14/S15         |
| D-07   | Transfer crashed the client on a sparse board      | Reducer is total over sparse boards; Transfer ends the source and starts the destination                                 | U `V2 sparse boards`, R `S08`, B S08 |
| D-08   | `board_events` forgeable / mutable by any member   | Append-only for clients; written only inside RPC transactions with `actor = auth.uid()`                                  | R `S24`, P §5                        |

## 2. Architecture (what is now true)

```text
dining_tables (one registry, location-scoped)
      ↓
service_sessions (one boundary: location + date)
      ↓
rotation_members · rotation_rounds
      ↓
table_rotation_entries   (lifecycle: active → ended / skipped; kept as history)
      ↓  trigger
section_assignments      (current physical claims; one active claim per table per session)
      ↓
buildBoardReadModel()    (one derivation; claims reconciled at read time)
      ↓
Grid · Floor · Picker · Servers · Dashboard
```

- **One physical table model** — views never own tables; Floor layout is metadata on the same `dining_tables` rows.
- **One assignment model** — entries are the lifecycle record; `section_assignments` is the trigger-maintained claim ledger.
- **One session model** — every rotation row carries/derives the same `service_session_id`, enforced by composite foreign keys.

## 3. Phases

### 1A — Database integrity (`20261023100000_table_rotation_v2_session_integrity.sql`)

Pre-flight aborts on corrupt data (none in DEV). Adds `table_rotation_entries.service_session_id` (derived from the round by trigger, never caller-supplied) with composite FKs to `rotation_rounds(id, service_session_id)` and `rotation_members(id, service_session_id)`; entry identity immutable. `section_assignments.location_id` with FKs to `service_sessions(id, location_id)` and `dining_tables(id, location_id)`, plus session-scoped FKs to entry and member. Row guard triggers on entries/rounds/members lock the row's own session (serializing writes per board) and run the historical + finalized lock against it; contexts without a user JWT (cron, service role, cascades) are trusted. New `ended_by` column; `(rotation_member_id, status)` index.

### 1B — Authorization + trusted mutations (`20261023110000_table_rotation_v2_trusted_mutations.sql`)

The sixteen `board_*` RPCs keep their signatures and become `SECURITY DEFINER` (empty `search_path`): `auth.uid()` → active membership (`private.can_operate_board(org, location)` — the single future location-access seam; no `organizations.created_by`) → session row lock → derived historical/finalized lock → same-session assertion for every round/member id → mutation + audit event in one transaction. Day opening needs owner/GM/SM/host. Direct INSERT/UPDATE/DELETE on entries, rounds, members, ledger, sessions and events is revoked and the paired write policies dropped. `board_events` is append-only (guard trigger; only `undone_at` inside Undo/Redo). Remove-server is blocked while the server holds an active table; pause is allowed; Skip and Reorder never change ownership.

### 1C — Canonical read model

`domain/board-read-model.ts`: `buildBoardReadModel` (tables, per-server summaries, dashboard statistics, next server — one derivation for Floor/Picker/Servers/Dashboard) and `findClaimDivergences` (board-derived occupancy vs the authoritative claims). The loader returns the active claims from `section_assignments`, the divergences, and `boardLoadError`: a failed read is an error banner, never a plausible empty board. Tables carry their canonical `dining_tables.id`.

### 1D — Undo / Redo

Events carry full row snapshots (label, status, original assigner, timestamps, ended-by) and displaced-owner lists; every command is reversible and re-appliable; serialized per board; legacy pre-V2 events remain undoable.

### 1E — Client / Realtime consistency

`hooks/use-board-realtime.ts` (authenticate → apply JWT → subscribe → refetch on every (re)join; JWT refresh; teardown on sign-out/user change). `RestaurantOperationsApp` keyed by server identity + pending sign-in state. Reducer: `ensureCell` (sparse-safe), transfer ends the source, confirmed assign ends the previous owner (combined assignments only as a whole), `getNextColumn` from cell status. Server Actions revalidate both entry routes and resolve optimistic row ids (`round-N`) to the real row by sequence instead of sending a non-numeric id. Grid entry now sends `confirmTransfer: true`, so typing a table another server holds ends that server's entry and assigns it atomically (the documented Grid semantics); Floor/Servers keep their explicit Transfer / End-and-assign flows, and Picker still refuses to take a held table (it points to Floor Transfer).

### 1F — Real-mode validation

See [`PART1_TEST_MATRIX.md`](PART1_TEST_MATRIX.md).

## 4. Tests

| Suite                                                       | Result                                             |
| ----------------------------------------------------------- | -------------------------------------------------- |
| `npm run test:real` — hosted DEV RPC/RLS, real JWTs         | 40/40 PASS                                         |
| `npm run test:real:ui` — three browser contexts, DEV-pinned | 15/15 PASS (incl. extended A/B/C through the Grid) |
| `npx supabase test db` — pgTAP                              | 25 files / 387 assertions PASS                     |
| `npx supabase db reset`                                     | 35 migrations apply from scratch                   |
| `npm test` (Vitest)                                         | 428 PASS                                           |
| `npm run lint` / `typecheck` / format                       | PASS                                               |

D-04 negative control: with the previous sign-in code the same browser suite stalled for 2.7 minutes and failed the live-update scenario; with the fix all 15 pass.

### Independent security review of the migrations

A read-only reviewer (separate agent) examined both migrations: no cross-tenant path, no SECURITY DEFINER / search_path / ACL hazard, no way to spoof the trusted-context bypass or set the undo GUC from a client, no lock-ordering deadlock. Four real findings, all fixed in the (still unreleased) migrations and re-verified from scratch:

| #   | Finding                                                                                                                                                                                                                      | Fix                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | The `service_session_id` backfill fired the old occupancy trigger, which on production data holding two ACTIVE entries for one table (the pre-V2 confirm-transfer path) could abort the migration or resurrect a stale claim | Trigger disabled around the backfill; pre-flight now reports (does not rewrite) such duplicates |
| 2   | Undo chose its target by `created_at` (transaction start) so a writer that waited on the session lock could be undone out of order                                                                                           | Order by `id` (as Redo already did)                                                             |
| 3   | `board_end_and_assign` accepted a paused/removed column                                                                                                                                                                      | Requires an active column, like Assign/Transfer/Skip                                            |
| 4   | A closed same-date session produced a NULL session and a misleading error                                                                                                                                                    | Explicit error                                                                                  |

## 5. Remaining risks (real, not hidden)

1. **#106** — `private.has_org_role` still ORs `organizations.created_by`; SELECT policies on every module still use it. The board _mutation_ path no longer does. Fix globally in its own change.
2. **Picker** refuses to take a held table (by design, unchanged); S04 "Picker later assigns 15→A" converges through Grid or Floor Transfer instead.
3. **Pre-V2 stale active entries** — production may hold two ACTIVE entries for one table (old confirm-transfer). The migration leaves them untouched; the loader reports them as claim divergences. A one-off data review is advisable before promotion.
4. **Hosted real-mode suites are not in CI** (they need DEV credentials and PINs); they are documented release evidence. CI runs the deterministic checks and local pgTAP.
5. **Browser coverage gaps** (DB-proven only): S09/S10 concurrency, S19 combined tables UI, S21–S24, S26 Skip UI.
6. **Neon credential** — `NEON_DATABASE_URL` in DEV equals PROD's and was printed once in an earlier session; operator rotation task.
7. **`docs/testing/`** holds DEV-only credentials and stays untracked; the real-mode UI suite reads local ignored files for PINs.

## 6. Future compatibility (Part 2 not started)

Authorization is one seam (`can_operate_board(org, location)`); table identity/uniqueness is location-scoped (Table 15 is independent per location — tested); nothing makes Table Rotation mandatory for an organization; no module toggles, attendance or multi-org membership were added.
