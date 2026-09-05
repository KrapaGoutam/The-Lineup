# Feature 011 — Drop role restrictions on the allocation board only

Status: shipped, later revised

**Implementation note**: same division-of-labor change as Feature 005 — Claude implemented this batch directly, Codex was not in this loop.

**Build note**: kept on its own commit, separate from 009/010 — the permissions reasoning below needed its own diff to review.

**Revision 1 (post-ship)**: the reason-required mechanism described below (mechanism 2, and the matching acceptance criterion) was dropped after real usage showed it was friction mid-service producing dishonest or perfunctory text under pressure, not a meaningful safeguard. A reason became optional; unconditional attribution (who edited what column, when — recorded and shown to the whole team regardless of whether a reason was given) is what actually does the safeguard work, and now applies more broadly than before (previously a write without a reason was refused outright, not logged without one).

**Revision 2 (post-ship)**: the optional reason field itself was then removed from the UI entirely — testing surfaced that it still rendered as a second input box under every cross-column cell even once it stopped being required, which nobody asked for. There is now exactly one input (the table number) for every column, own or someone else's, with no second field under it ever. Attribution is unaffected and unconditional, as in Revision 1 — this only removes the now-pointless empty field, not any of the safeguard. No reason data is collected, stored, or displayed anywhere on the allocation board anymore.

See `docs/SECURITY.md`'s "Allocation-board open editing" section and `docs/DATA_MODEL.md` for the current authoritative description; the body below is kept as the original design record, with the specific superseded claims marked inline.

## The required answer, first: can this let a server manipulate tip math?

Traced through the actual code before writing anything else, not deferred as out of scope.

**Today, no — because nothing reads the allocation board into tip calculation.** `tip-workspace.tsx`'s participant list is a manager-only checkbox selection over `team` (`fieldset disabled={status === "finalized"}`, checkboxes manager-toggled), passed straight into `calculateTipSplits()`. There is no import from `features/allocation` anywhere in the tips feature, and no code path derives tip participants from `rotation-board.ts` state. Verified by reading both files, not assumed. So today, loosening allocation-board write access has **zero automatic effect** on tip amounts — a server editing someone else's column cannot make money move, because the tip calculator never looks at the board.

**But that's not the whole risk, and it's not permanent by accident.** Two things still matter:

1. **The PRD's stated intent is to eventually link them** ("Suggest participants from the live floor, with manager correction" — `docs/PRD.md`). If that suggestion feature is ever built by joining to allocation-board data, an unrestricted board becomes a real lever on the suggestion a manager sees, even if the manager still clicks confirm.
2. **Even without automatic linkage, the board functions as an informal evidence trail today.** A manager deciding "who actually worked which tables" when hand-picking tip participants can _look at_ the allocation board to jog their memory. If any server can silently overwrite another server's recorded table, that evidence becomes unreliable exactly when it matters most — even though no code path forces it into the tip math.

**What stops it, concretely — three mechanisms, not one:**

1. **Attribution is never relaxed, only the write-target restriction is.** `assigned_by` / `actor_profile_id` stays server-set from the authenticated session on every board write — never client-supplied, never spoofable. Anyone can edit any column, but _who actually made the edit_ is always known and already recorded in `board_events`/`table_rotation_entries`, exactly as it is today. Opening up _who can write where_ does not open up _who gets credited for writing it_.
2. **~~New requirement, not previously needed: writing to a column that isn't the actor's own now requires a short reason~~ — superseded twice, see the Revision notes at the top.** As shipped, this required a short reason using the override-reason pattern in `AGENTS.md` ("Manual overrides require a reason and audit event"). In practice that was friction mid-service that produced dishonest or perfunctory text, so the requirement was dropped (Revision 1), and then the field itself was removed from the UI entirely (Revision 2) — there is no reason input anywhere on the allocation board today. What actually does the safeguard work is that a cross-column write is _unconditionally_ recorded and shown to the whole team — "Ava recorded Table 12 for Mia's column" — regardless of the fact there's no reason text to attach. Editing your own column still carries no such record at all, since that's the normal case this feature is designed to also loosen; own-column writes remain exactly as frictionless as before.
3. **Standing invariant, made explicit rather than assumed**: tip participant selection stays a separate, manager-confirmed action, never silently auto-derived from allocation-board data. This is already true of the current code (§ above) and this feature commits to it staying true — anyone implementing the PRD's "suggest from the live floor" feature later must treat allocation-board data as a _suggestion input a manager reviews_, never as ground truth that bypasses manager confirmation. This is the actual load-bearing protection against the scenario in the question, both today and after the modules are eventually connected.

Additionally, a genuine new lock: **once a tip pool is finalized for a service date, the allocation board for that date's service session becomes read-only for everyone** — not just role-restricted, actually frozen. Today's schema already makes `tip_intervals`/`tip_allocations`/`tip_interval_participants` immutable once `tip_pools.status = 'finalized'` (the `*_draft_only` restrictive RLS policies). This feature adds the equivalent freeze on the allocation board's own writes for that date, so there's a hard temporal boundary after which "who gets credited for which table" can no longer be edited by anyone, matching the point at which it could actually matter financially.

## User outcome

Any signed-in person at a restaurant — server, host, manager, owner — can record a table against any column on the live allocation board, not just their own. Everywhere else in the app (schedule, tips, team), today's role restrictions are unchanged.

## Scope

**In**

- Remove the `mayWriteColumn` self-or-manager check for the allocation board specifically: any signed-in, active member of the organization can write to any column while it's active.
- ~~New, optional reason field when writing to a column that is not the actor's own~~ — superseded (Revision 2): no reason field anywhere, on any column, own or someone else's. One input, the table number, always.
- Allocation-board writes freeze once the service date's tip pool is finalized (see the new lock above) — this applies regardless of who's writing, closing the loop the permissions change opens.
- RLS: collapse `table_rotation_entries_write_own` and `table_rotation_entries_write_manager` into one policy allowing any active member to write, while keeping `assigned_by = auth.uid()` non-negotiable in the `with check` clause (you can act on any column, you can never claim someone else acted).

**Out**

- Any change to schedule, tips, or team-tab permissions — those keep their current role gates exactly as they are. This is scoped to the allocation board's column-write rule only.
- Any change to manager-only actions on the board (pause/remove/reorder/clear) — those remain manager/owner-only; this feature only removes the _self-or-manager_ restriction on the plain "assign a table" action.
- Building the PRD's "suggest participants from the live floor" tip feature — explicitly named above as future work this feature's invariant protects, not work this feature does.

## Acceptance criteria

- [x] A server can write a table label into another active server's column.
- [x] ~~Writing to another person's column requires a non-empty reason before it's accepted~~ — superseded twice: first made optional, then the reason field was removed from the UI entirely. Writing to another person's column is a single input, identical to your own column.
- [x] `board_events`/the equivalent demo event record always carries the true actor's identity, regardless of whose column was edited — and, as revised, is recorded for every cross-column write unconditionally, with no reason data involved at all.
- [x] Pause, remove, reorder (Feature 010), and clear actions remain manager/owner-only — unaffected by this change.
- [x] Once the service date's tip pool is finalized, no one — including managers — can write to that date's allocation board.
- [x] Schedule, tips, and Team-tab role gates are unchanged; a targeted regression check confirms none of them were accidentally loosened alongside this one.

## UX contract

- Entry point: the existing per-cell "Add table" input, now enabled for every active column regardless of who's signed in.
- Own column: unchanged — type and submit, no extra step.
- Someone else's column: identical to your own column — one input, the table number. Submitting it always records the write and always logs the cross-column attribution; there is no reason field to fill in.
- Finalized-date lock: the "Add table" input is disabled everywhere on the board for that date, with visible text (not color alone) explaining why — "Tips are finalized for this day; the board is locked."
- Permission denied: n/a for column writes now; pause/remove/reorder/clear still show their existing manager-only gating.
- Keyboard/screen reader: the reason prompt follows the same accessible pattern as other confirmation inputs in the app (labeled, `aria-live` errors).

## Data and authorization

- Tables/columns: no new columns on `table_rotation_entries` at all — no reason field exists to store (Revision 2), so `board_events.payload` for a cross-column write event carries no `on_behalf_of_reason` or any reason-shaped data.
- Constraints/indexes: none new.
- Grants/RLS: replace `table_rotation_entries_write_manager` and `table_rotation_entries_write_own` with one policy — `for all to authenticated using (assigned_by = auth.uid() and has_org_role(organization_id, [owner,general_manager,shift_manager,host,server]) and <service session's tip pool is not finalized>) with check (same)`. Manager-only actions (pause/remove/clear/reorder) keep their existing separate manager-scoped policies on `rotation_members`/`rotation_rounds` — untouched.
- Roles/capabilities: `allocation:write-own` capability (in `src/features/auth/domain/passcode.ts`) is replaced by `allocation:write-any` for all roles; `allocation:manage` (pause/remove/reorder/clear) is unchanged and stays manager/owner-only.
- Audit events: every board write already records an actor; every cross-column write is now logged unconditionally with no reason data attached at all (there's nothing to attach), and finalized-date writes are never allowed at all (audit is moot on a write that RLS itself now rejects).
- Idempotency/concurrency: unchanged — the existing per-round uniqueness (`rotation_round_id, rotation_member_id`) constraint already prevents two different actors from racing to fill the same cell twice; last-write-wins on the client applies exactly as it does for self-writes today.
- Time-zone behavior: the finalized-date lock is scoped by the location's service date (already timezone-resolved via `service_sessions.service_date`), not by wall-clock instant — consistent with the rest of the app's time-zone handling rules.

## Implementation map

- `src/features/auth/domain/passcode.ts`: `allocation:write-own` → `allocation:write-any` capability.
- `src/features/allocation/domain/rotation-board.ts`: `mayWriteColumn` simplified to "any signed-in active member"; `isCrossColumnEdit` (renamed from `writeRequiresReason` when the reason requirement was dropped) still exported so the UI can distinguish "own column, unattributed" from "other column, attributed" — it never took or produced reason data, so Revision 2 needed no domain-layer change at all.
- `src/features/allocation/components/allocation-workspace.tsx`: `TableEntry` renders one input regardless of column ownership (no reason field, Revision 2); unconditional attribution logging for cross-column writes; finalized-date lock check and disabled state.
- Migration: RLS policy replacement described above.

## Test plan

- Unit: `rotation-board.ts`'s write-permission helper — any active member can write any column; `isCrossColumnEdit` identifies a non-own column for attribution purposes only, never blocks it; no one can write once the date is locked.
- Database/RLS: pgTAP — a server can now insert `table_rotation_entries` for another server's `rotation_member_id`; `assigned_by` spoofing (claiming another actor) is still rejected; writes are rejected once the date's `tip_pools.status = 'finalized'`; pause/remove/reorder/clear stay manager-only (regression cases, not new ones).
- Playwright: a server successfully edits another server's column (no reason field exists to fill in), and the edit is still attributed in the visible log; a dedicated test confirms no reason field renders anywhere on the board, for any column; the board is read-only for everyone once a demo "finalize day" action has run for that date; schedule/tips/team permission tests are re-run unchanged to confirm no collateral loosening.

## Rollout and rollback

- Feature flag: none.
- Expand/migrate/contract: the RLS policy replacement is a single additive migration (drop two policies, add one) — reversible in one further migration if needed, no data shape change.
- Backfill: none.
- Rollback limit: reverting the migration restores the previous self-or-manager restriction; no data is lost either direction since this only changes who may write, not what's stored.

## Decisions and risks

- **Decision**: three-part answer to the tip-math question (attribution stays real, cross-column writes are always logged, tip participants stay manager-confirmed and never auto-derived) plus a genuine new finalized-date lock — not a single mechanism, because no single one of the three options originally offered fully covers both "today" and "once the modules are eventually connected."
- **Decision, post-ship (Revision 1)**: dropped the mandatory reason (originally mechanism 2) after real usage showed it was service-time friction producing dishonest or perfunctory text, not a meaningful safeguard. Unconditional attribution — which was always mechanism 1, not the reason text — is what was actually doing the safeguard work; making it unconditional regardless of reason presence is a strictly wider guarantee than before.
- **Decision, post-ship (Revision 2)**: removed the now-optional reason field from the UI entirely, after testing showed it still rendered as a second input under every cross-column cell even though nothing required filling it in. Attribution is unaffected; this only removes a field nobody needed to see once it stopped being mandatory.
- **Risk**: a manager who doesn't know to check `board_events` for cross-column edits could still be misled by board appearance alone when manually picking tip participants. Mitigation: the unconditional attribution log keeps cross-edits visible in the normal flow of using the board, not just in an audit log a manager has to think to open — but this is a real residual risk worth naming, not eliminated.
- **Risk**: collapsing two RLS policies into one is a genuine security-relevant migration — flagged for careful review per `docs/SECURITY.md`'s stated bar for authorization changes.
- Open questions: none remaining.
