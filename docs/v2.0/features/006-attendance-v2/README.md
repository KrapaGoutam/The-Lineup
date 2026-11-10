# Feature V2-006: Attendance V2

GitHub Issue: [#254](https://github.com/KrapaGoutam/The-Lineup/issues/254)  
Parent Issue: [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8)  
Branch: `feature/v2-006-attendance-v2`  
Status: `IN PROGRESS — BATCH A INDEPENDENTLY VERIFIED AND CORRECTED; BATCH B IN PROGRESS`

---

## 1. Overview and Mission

Feature V2-006 delivers Attendance V2: per-location attendance mode (`EXTERNAL`, `INTERNAL_THE_LINEUP`, `DISABLED`, or unconfigured), native internal attendance tracking, manager corrections, and unified reporting and payroll/tips feeds across both sources.

Implementation proceeds across three batches on one feature branch (`feature/v2-006-attendance-v2`), followed by one consolidated PR into `development`:

- **Batch A**: Mode Configuration (.001), Native Data Model (.002), Clock Integrity (.003). **Verified and corrected (see §3).**
- **Batch B**: Manager Corrections (.004), Attendance Reporting (.005).
- **Batch C**: Payroll / Tips Integration (.006), External Attendance Compatibility & Cutover (.007).

---

## 2. Batch A Architectural Specification (as corrected)

### 2.1 Attendance mode semantics (V2-006.001)

| `locations.attendance_mode`    | Native clock RPCs                                        | Reading                                     |
| ------------------------------ | -------------------------------------------------------- | ------------------------------------------- |
| `internal_the_lineup`          | Allowed (subject to authorization)                       | Native tables                               |
| `external`                     | Refused (`42501`)                                        | Existing Neon reader (unchanged)            |
| `disabled`                     | Refused (`42501`)                                        | No new clock operations; history per policy |
| `NULL` (unconfigured / legacy) | Refused (`42501`) — fails closed, never assumed internal | Existing Neon reader (unchanged)            |

No backfill and no default was applied to existing rows. Attendance **module** activation (`location_module_configs`, module key `attendance`) is orthogonal to the **source** mode; when backend module enforcement is active, a location with the attendance module off refuses native RPCs and hides native rows (restrictive RLS policies).

`public.set_location_attendance_mode(location, mode, expected_updated_at, reason)`:

- Authority: Overall Owner/Manager or active Organization Owner/General Manager (`private.can_manage_location_lifecycle`); live session required.
- Unknown location and unmanageable location return the same denial.
- Audited in `public.audit_events` (before/after mode, actor, optional 3–500 char reason).
- Optimistic concurrency (`P0004`), archived/inactive locations refused (`55000`).
- **Leaving `internal_the_lineup` is refused while any session is open at the location (`55000`)**, otherwise those employees could never clock out.

### 2.2 Data model (V2-006.002)

- `attendance_sessions` — one shift. Policy-neutral facts only: `clock_in_at`, `clock_out_at`, `gross_elapsed_seconds`, `total_break_seconds` (sum of all closed breaks regardless of pay class). Status: `active`, `on_break`, `completed`, `auto_clocked_out` (reserved, unused — no auto-clock-out policy approved), `voided` (reserved for Batch B). One open session per employee per organization (partial unique index).
- `attendance_breaks` — each break with its actual start/end, and an explicit `pay_classification` (`unclassified` default / `paid` / `unpaid`) with `classified_by` / `classified_at` attribution (constraint: classified ⇔ attributed).
- `attendance_events` — append-only ledger. `UPDATE`, `DELETE` **and `TRUNCATE`** are refused by trigger even for the table owner.
- Tenant integrity: `(location_id, organization_id)` and `(organization_id, profile_id)` composite FKs on sessions; breaks and events reference their session through the composite key `(session_id, organization_id, location_id, profile_id)`, so a child row can never name a different tenant, location or employee than its session. All FKs are `ON DELETE RESTRICT` (history is retained; deactivate rather than delete).
- Actor attribution is a direct `profiles(id)` FK (not a membership FK) so an Overall Owner/Manager with no membership row can act across organizations — the same repair already applied to tips and `audit_events`.
- `public.attendance_session_summaries` (security-invoker view) derives per-session `paid / unpaid / unclassified` break seconds, `break_policy_resolved`, and `net_payable_seconds`. **`net_payable_seconds` is NULL unless the session is closed, no break is open and every break is classified.** An unknown break is never treated as unpaid.

### 2.3 Break-pay representation

The owner has **not** decided whether breaks are paid. The model therefore stores only facts (actual timestamps, gross elapsed, total break) plus a per-break explicit classification. Payable time is derived, never stored, and is `NULL` ("unresolved") until a human classifies every break. Classification is stored per break with who/when, so historical records stay interpretable after a future policy change (old rows are never reclassified implicitly). No pay-rate, rounding, overtime or compensation rule exists anywhere in this feature.

### 2.4 Clock integrity (V2-006.003)

Every RPC runs `private.attendance_begin`, in this order (denials before any information about the location is revealed):

1. Live session (banned user / revoked JWT session ⇒ `42501 Not authenticated`).
2. Location lookup with `FOR SHARE` (serialises against mode changes). Unknown location ⇒ uniform `42501 Unauthorized`.
3. Caller authority: self requires an **active** organization membership (or management authority); acting for someone else requires `private.attendance_can_manage_location`.
4. Target must be an **active** organization member; opening operations also require an **active** location assignment for the target (a manager clocking in themself is the only exemption). Closing operations (`clock_out`, `break_end`) do not require assignment, so an employee de-assigned mid-shift can still clock out.
5. Module enforcement assertion (`attendance`), then mode must be `internal_the_lineup`.
6. Per-employee advisory transaction lock: all operations for one employee are serialised, which also makes idempotent replays exact.

Timestamps use `clock_timestamp()` taken **after** the lock, so event times are monotonic in lock order (`now()` is the transaction start and can precede a previous holder's timestamps, which would yield negative intervals). Elapsed time is `floor(epoch(clock_out) − epoch(clock_in))` on absolute instants — DST and overnight safe. `service_date` is the location-local calendar date of the clock-in instant (no business-day cutoff — open policy question).

**Idempotency**: keys are scoped to `(organization, actor)` and bound to the exact `(event type, location, target employee)`. Same user + same operation ⇒ replay (`idempotent: true`). Same key for a different operation or target ⇒ `22023`. Another user's identical key string never reads or replays someone else's operation.

**Authority** (`private.attendance_can_manage_location`), matching the shipped payroll authority contract: Overall Owner/Manager; active Organization Owner/General Manager; or effective tier ≥ 2 (`MAX(overall tier, location tier)` — location Manager/Assistant Manager with an active org membership, Overall Assistant Manager, single-location Shift Manager) at a live, non-archived location. Revoked memberships, banned users and revoked sessions lose authority.

#### Permission matrix

| Actor                                                          | Clock self (assigned) |  Clock other  | Read own | Read location | Set mode |
| -------------------------------------------------------------- | :-------------------: | :-----------: | :------: | :-----------: | :------: |
| Overall Owner / Manager                                        |     ✔ (any loc)      |      ✔       |    ✔    | ✔ (any loc)  |    ✔    |
| Overall Assistant Manager                                      |     ✔ (any loc)      |      ✔       |    ✔    | ✔ (any loc)  |    ✘     |
| Org Owner / General Manager (active)                           |     ✔ (own org)      |      ✔       |    ✔    | ✔ (own org)  |    ✔    |
| Location Manager / Assistant Manager (active org + assignment) |          ✔           | ✔ (that loc) |    ✔    | ✔ (that loc) |    ✘     |
| Assigned staff (active)                                        |          ✔           |       ✘       |    ✔    |       ✘       |    ✘     |
| Unassigned org member / other-org user                         |           ✘           |       ✘       | own only |       ✘       |    ✘     |
| Revoked membership / banned / revoked session                  |           ✘           |       ✘       |    ✘     |       ✘       |    ✘     |

Clients hold `SELECT` only on the three tables and the summary view; `INSERT/UPDATE/DELETE/TRUNCATE` are revoked from `authenticated` explicitly.

---

## 3. Batch A Independent Review (2026-11-09)

The Antigravity Batch A output was found **uncommitted** in `.tmp/v2-006-attendance` (branch HEAD still at base `e796eee`). It was preserved unmodified as `378ee9e` (WIP snapshot) before review. The migration had only ever been applied to the disposable local database (branch never pushed, no PR, hosted DEV/Production never contacted), so it was corrected in place.

| #   | Severity    | Finding (evidence)                                                                                                                                                                                                                                                                                                                                          | Resolution                                                                                                                                        |
| --- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | P1          | `authenticated` retained `INSERT/UPDATE/DELETE/TRUNCATE` on all three tables (default privileges; the migration only revoked from `public, anon`). Proven: `TRUNCATE public.attendance_events` succeeded as `authenticated` (rolled back). TRUNCATE bypasses RLS and the row triggers, defeating the "immutable" ledger. README claimed these were revoked. | `revoke all … from public, anon, authenticated` + SELECT only; `BEFORE TRUNCATE` trigger as defence in depth; pgTAP asserts privileges.           |
| 2   | P1          | Idempotency lookup was `(organization, location, key)` with no actor/target/event-type scoping: user B reusing user A's key string received A's session/event ids and had their own clock-in **silently swallowed** (cross-user disclosure + replay). Same key accepted across event types.                                                                 | Key scoped to `(organization, actor)`, bound to event type + location + target; mismatch ⇒ `22023`. Tests cover cross-user and cross-op reuse.    |
| 3   | P1          | Break-pay assumption: `total_worked_seconds = gross − ALL breaks` stored and returned as if payable, while paid/unpaid policy is undecided.                                                                                                                                                                                                                 | Column removed; gross + total break stored as facts; per-break explicit classification; derived `net_payable_seconds` NULL until resolved (§2.3). |
| 4   | P1          | Authority helper diverged from the shipped contract: no live-session gate (revoked/banned sessions kept authority), location-manager branch ignored `memberships.active` (revoked manager kept access), clock-in membership check ignored `active`, no tier model.                                                                                          | Rewritten to the payroll `profile_level` contract (live session, active membership, tier ≥ 2, live location).                                     |
| 5   | P1          | Actor composite membership FK: an Overall Owner/Manager with no membership could not act (`23503`), and removing a manager's membership would cascade-delete other employees' ledger rows (blocked only by the immutability trigger).                                                                                                                       | Direct `profiles(id)` actor FK; all FKs `ON DELETE RESTRICT`.                                                                                     |
| 6   | P2          | Authorization ran after location/mode checks: any authenticated user could probe whether a location exists and its attendance mode, and learn org-membership state from distinct error text.                                                                                                                                                                | Uniform `42501 Unauthorized` before any location detail is revealed; mode/module checked only after authority.                                    |
| 7   | P2          | Manager clock-in skipped the target's location-assignment check entirely.                                                                                                                                                                                                                                                                                   | Target must be actively assigned (only a manager clocking themself is exempt).                                                                    |
| 8   | P2          | Switching a location away from internal mode stranded open sessions (clock-out refused outside internal mode).                                                                                                                                                                                                                                              | Mode change refused while sessions are open (`55000`); clock operations hold `FOR SHARE` on the location row to serialise with it.                |
| 9   | P2          | `now()` (transaction start) used for event times: a transaction queued behind another's lock could stamp an earlier time than the previous holder (negative break/shift intervals).                                                                                                                                                                         | `clock_timestamp()` after the per-employee advisory lock; durations clamped ≥ 0; ledger order monotonic (verified under parallel load).           |
| 10  | P2          | Concurrent identical-key requests surfaced a unique-index error instead of an exact replay.                                                                                                                                                                                                                                                                 | Per-employee advisory lock ⇒ exactly one real operation + idempotent replays (verified, §4).                                                      |
| 11  | P2          | Child rows (`breaks`, `events`) referenced their session only by `session_id`; nothing tied their org/location/employee to the session.                                                                                                                                                                                                                     | Composite FK `(session_id, organization_id, location_id, profile_id)`.                                                                            |
| 12  | P3          | Module-enforcement pattern (V2-004.004) not applied: attendance rows stayed visible and RPCs usable when the module was off.                                                                                                                                                                                                                                | Restrictive SELECT policies + `assert_location_module_enabled` after authority.                                                                   |
| 13  | P3          | Self-read policy ignored membership state; reason length violated the `audit_events` check (raw constraint error); README described statuses/columns/events that did not exist (`adjusted`, `manager_notes`, `system_auto_out`, `audit_logs`).                                                                                                              | Active-member self-read; reason validated 3–500 (`22023`); docs rewritten from the migration.                                                     |
| —   | Verified OK | One-open-session unique index, one-open-break index, `service_date` in location time zone, nonnegative interval checks, mode-guarded RPCs, `SECURITY DEFINER` + pinned `search_path` + revoked `PUBLIC/anon` execution, composite tenant FKs, no backfill of `attendance_mode`.                                                                             | Retained.                                                                                                                                         |

---

## 4. Batch A Evidence

- Migration `20261110000000_attendance_v2_foundation.sql` (edited in place; never applied to a shared environment). See §7 for the current checksum.
- pgTAP `0073_attendance_v2_foundation.test.sql`: **108/108** behavioural assertions as real `authenticated` JWT subjects (authorization matrix, revoked membership, banned user, revoked session, cross-location manager, cross-user idempotency, break classification, privileges incl. TRUNCATE, immutability incl. owner, tenant FK, DST fixture).
- Real parallel-session concurrency (separate psql sessions, committed fixtures): 10 simultaneous clock-ins (different keys) ⇒ 1 session + 9 rejections; 10 simultaneous clock-ins (same key) ⇒ 1 real + 9 idempotent replays; 6 simultaneous break starts ⇒ 1 break; 4 clock-out + 4 break-end race ⇒ 1 consistent final state, 0 open breaks, monotonic ledger.
- Vitest (attendance + locations): 29 files / 348 tests; `tsc --noEmit`, ESLint, Prettier clean.

Batch B and later sections are appended below as they are delivered.
