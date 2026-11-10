# Feature V2-006: Attendance V2

GitHub Issue: [#254](https://github.com/KrapaGoutam/The-Lineup/issues/254)  
Parent Issue: [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8)  
Branch: `feature/v2-006-attendance-v2`  
Status: `IN PROGRESS — BATCH A VERIFIED; BATCH B VERIFIED; BATCH C IMPLEMENTED LOCALLY (FINANCIAL ACTIVATION POLICY-BLOCKED); INDEPENDENT REVIEW PENDING; HOSTED DEV PENDING OWNER APPROVAL; NO PR`

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

- Migration `20261110000000_attendance_v2_foundation.sql` (edited in place; never applied to a shared environment). See §8 for the checksums.
- pgTAP `0073_attendance_v2_foundation.test.sql`: **108/108** behavioural assertions as real `authenticated` JWT subjects (authorization matrix, revoked membership, banned user, revoked session, cross-location manager, cross-user idempotency, break classification, privileges incl. TRUNCATE, immutability incl. owner, tenant FK, DST fixture).
- Real parallel-session concurrency (separate psql sessions, committed fixtures): 10 simultaneous clock-ins (different keys) ⇒ 1 session + 9 rejections; 10 simultaneous clock-ins (same key) ⇒ 1 real + 9 idempotent replays; 6 simultaneous break starts ⇒ 1 break; 4 clock-out + 4 break-end race ⇒ 1 consistent final state, 0 open breaks, monotonic ledger.
- Vitest (attendance + locations): 29 files / 348 tests; `tsc --noEmit`, ESLint, Prettier clean.

## 5. Batch B — Manager Corrections (V2-006.004)

Migration `20261110010000_attendance_corrections.sql` (additive on top of Batch A).

### 5.1 Contract

`public.attendance_correct_session(session, expected_version, reason, clock_in_at?, clock_out_at?, breaks?, void?, idempotency_key?)`

- **Authority**: `private.attendance_can_manage_location(session location)` only (live session, active membership, tier ≥ 2 / org owner-GM / Overall Owner-Manager). An unknown session and an unauthorized caller get the identical `42501 Unauthorized`. The module guard (`attendance`) applies. Mode is **not** required to be internal: correcting history stays possible after a mode change.
- **Mandatory reason**: 3–500 characters after trimming (`22023`). Empty, whitespace-only and too-short reasons are rejected.
- **Append-only**: original `clock_in` / `clock_out` / `break_*` events are never touched (immutable by trigger). One correction appends exactly one ledger event (`manager_edit`, or `void`) with: actor, reason, `source = manager`, a server-generated `event_time` (the audit timestamp, not the corrected time), the full **before** and **after** session snapshots (times, status, totals, every break), `changed_fields`, per-session sequence `seq`, `version_before/after`, `source_events` (ids of the original clock-in/out events), `reverses_event_id` when a single clock-in/out was edited, and `self_correction`.
- **Effective values** live on the session row; `version` is bumped by trigger on **every** session change (clock operations and corrections), so a manager acting on a stale view is rejected with `P0004`. `correction_count` / `last_corrected_at` drive the "Corrected ×N" indicator.
- **Validation (all server-side)**: clock-out ≥ clock-in; no times more than 60 s in the future; every break inside the corrected shift; breaks never overlap; a finished break cannot be reopened; total break ≤ shift; the corrected shift must not overlap another non-voided session of the same employee (`23P01`); a voided session cannot be corrected (`55000`); void cannot be combined with edits; each break id at most once; a break must belong to the session; "nothing changed" is rejected.
- **Missing clock-out**: supplying `clock_out_at` on an open session closes it (status `completed`); a still-open break ends with the shift.
- **Break pay classification** is a correction field (`pay_classification`), attributed to the manager with a timestamp; setting it back to `unclassified` clears the attribution.
- **Concurrency**: per-employee advisory lock (shared with the clock RPCs) + `FOR UPDATE` + version check. Real parallel test: 6 simultaneous corrections at one version ⇒ 1 applied, 5 `P0004`, exactly 1 correction event.
- **Idempotency**: scoped to (organization, actor), bound to event type + location + employee **and** session.
- **Self-correction** (a manager editing their own punch) is allowed but flagged `self_correction` in the audit trail and shown as "Own record" in the UI — see open question Q5.

### 5.2 Manager workflow (UI)

Attendance tab → native report → **Correct** on a row → dialog: record summary + immutable history (originals and corrections side by side) → edit shift/break times (typed in the **location's** time zone, DST-safe; only changed fields are sent) and break pay decisions → mandatory reason → **Review changes** (exact before/after, projected gross / breaks / payable) → **Confirm correction** → the new audit record appears in the history. A stale version shows "changed by someone else" with a Reload action. The target session must belong to the caller's **server-verified active location**; a stale tab cannot act on another location (and the database re-checks authority regardless). No kiosk UI.

## 6. Batch B — Unified Attendance Reporting (V2-006.005)

### 6.1 Source selection (one source per location, never merged)

| Location mode         | Shown                                                                    | Notes                                                    |
| --------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------- |
| `internal_the_lineup` | Native report (new), badge **Source: TheLineup Internal**                | Reads `attendance_session_summaries` as the caller (RLS) |
| `external`            | Existing Neon-backed `AttendanceReport`, unchanged, **Source: External** | Neon reader untouched; nothing converted to native       |
| `disabled`            | "Attendance is turned off" notice                                        | No report, no clock actions                              |
| unconfigured (NULL)   | Existing Neon report, **Source: External (not configured)**              | Pre-V2 behaviour preserved; internal is never assumed    |
| no verified location  | Existing Neon report with a note                                         | Native data is never shown without a verified location   |
| demo mode             | Existing demo report                                                     | No server calls                                          |

The location is always the server-verified persisted context (`getPrimaryLocation`), never a request field. The native action refuses (`not_internal`) for any other mode and never falls back to another source.

### 6.2 Native report content and honesty rules

Employee history and location report with a date range and employee filter (managers). Employees see only themselves (RLS — a tampered filter can only narrow). Each row shows employee, service date, in/out in the **location's zone with zone label** (+1 day marker for overnight), break total and a "pay not decided" flag, gross, payable, status, "Corrected ×N" and provenance. Totals keep gross, break and payable **separate**; payable is the sum over **resolved** sessions only and the number of excluded sessions is stated. Unresolved payable time always reads "Pending break classification", never `0`. Open sessions are never closed automatically; one from an earlier service date is flagged "Open since …" (a display flag, not a policy threshold). Result sets cap at 2000 rows with an explicit notice. No money is computed anywhere.

### 6.3 Payroll / Tips boundary

No Payroll or Tips file, function, snapshot or table was changed (the diff against the base touches none). Batch B produces read-only, provenance-labelled summaries only: each session exposes `is_closed`, `break_policy_resolved`, `net_payable_seconds` (NULL unless resolved), `correction_count`, `last_corrected_at`, source = internal. Batch C must carry that completeness / correction / policy-resolved state forward.

## 7. Permission matrix — corrections and reporting

| Actor                                                                 | Read own | Read location report | Correct / void | Classify breaks |
| --------------------------------------------------------------------- | :------: | :------------------: | :------------: | :-------------: |
| Overall Owner / Manager                                               |    ✔    |       any loc        |       ✔       |       ✔        |
| Overall Assistant Manager (tier 2)                                    |    ✔    |       any loc        |       ✔       |       ✔        |
| Org Owner / General Manager (active)                                  |    ✔    |       own org        |       ✔       |       ✔        |
| Location Manager / Asst Mgr (active org membership + assignment)      |    ✔    | that location (live) | that location  |  that location  |
| Staff (active, assigned)                                              |    ✔    |      self only       |       ✘        |        ✘        |
| Revoked membership / banned / revoked session / other org or location |    ✘     |          ✘           |       ✘        |        ✘        |

## 8. Migrations and checksums

| File                                          | SHA-256                                                            | Hosted status                |
| --------------------------------------------- | ------------------------------------------------------------------ | ---------------------------- |
| `20261110000000_attendance_v2_foundation.sql` | `40bb802beb7ff13a70820d274794d15da2107c3bfdaa78a2439fe0dbd024c63e` | **Not applied** (local only) |
| `20261110010000_attendance_corrections.sql`   | `a7556ae715e2d34ff712eee7940e38e90e7e6c3a7a1ec8c49f1032f5ca8bdb15` | **Not applied** (local only) |

Full replay from scratch (`supabase db reset`, local disposable stack): 84 migrations, clean. The Batch A file was revised in place only because it had never left the disposable local DB; once either file reaches a shared environment it must be treated as immutable. Hosted DEV rollout (backup → rehearsal → apply) needs separate owner authorization; the DEV ledger is currently 82.

## 9. Test receipts (this session)

- pgTAP `0073` 108/108 and `0074` 66/66 (real `authenticated` JWT subjects). Targeted regression on a freshly reset DB: `0001 0002 0009 0010 0021 0050 0055 0059 0061 0062 0063 0066 0067 0073 0074` — **778 assertions, all pass** (catalog/RLS invariants, module enforcement, identity links, payroll, tips, lifecycle).
- Parallel real-session concurrency: clock-ins, break races, clock-out vs break-end, and 6-way simultaneous corrections (see §4 and §5.1).
- Vitest: 271 test files, 3,663/3,663 tests passed across full suite (including attendance, locations, modules, payroll, tips, context, schedules, components, and repo-wide `enforcement-coverage` invariant).
- Code quality & check gates: `npm run check` (`format:check`, `lint` with `--max-warnings=0`, `typecheck` with `next typegen && tsc --noEmit`) clean with 0 errors and 0 warnings. `CI=1 npx next build --webpack` succeeds cleanly.
- **Playwright Real-Browser Acceptance** (`tests/local/ui/attendance-location.local.spec.ts` via `playwright.attendance-local.config.ts`):
  - Executed against local disposable Supabase (ports 54321/54322) and local Next.js server (port 3137).
  - **39 / 39 tests PASSED** across three viewports (13 per viewport):
    - Desktop (1280×800): 13/13 PASSED
    - Tablet (820×1180): 13/13 PASSED
    - Mobile (390×844): 13/13 PASSED
  - Verified test matrix:
    1. Manager correction workflow: review before/after, mandatory reason validation, immutable ledger append, audit entry inspection, version incrementation, and "Corrected ×1" badge rendering.
    2. Read-only correction history audit trail dialog for managers.
    3. Location report rendering with service dates, formatted timestamps in location timezone, separated gross/break/payable columns, and unresolved break flags.
    4. External attendance source mode rendering with "Source: External" badge and Neon integration preserved.
    5. Disabled attendance source mode rendering with "Source: Attendance off" and punch actions disabled.
    6. Unconfigured legacy attendance mode rendering with "Source: External (not configured)".
    7. Staff self-service attendance view restricted to own records with punch actions and no manager correction controls.
    8. Staff forbidden from viewing other employees' attendance or accessing manager correction dialogs.
    9. Cross-location manager restricted from viewing or correcting unassigned location records.
    10. Revoked manager session immediately refused access to location attendance records.
    11. Overall organization administrator able to inspect and manage location attendance across organizations without local tenant membership row (`src/lib/current-user.ts` overall role resolution).
    12. Optimistic concurrency control rejecting stale concurrent writes with `P0004` version conflict.
    13. Ledger immutability and financial non-mutation verification: original punch events untouched, zero ledger deletions/updates, and zero payroll/tips table mutations.
- **Deferred**: Hosted DEV rollout (migrations 83 and 84 pending owner authorization per Q8) and full production E2E suites (deferred to post-Batch C). Batch C receipts: §13.10.

## 10. Additional Batch A finding discovered during Batch B regression

| #   | Severity | Finding                                                                                                                                                                                                                                                                                             | Resolution                                                                                                                                                                                                                                                                                                                       |
| --- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 14  | P2       | Batch A Server Actions (`native-clock-actions`, `attendance-mode-actions`) never called the module guard, so the repo-wide invariant `src/features/modules/enforcement-coverage.test.ts` failed (Batch A's reported gates never ran it). The database seams were guarded; the action layer was not. | Clock actions now take `restaurantSlug` and call `guardModuleForSlug` with the location as an **untrusted claim** (stale tab ⇒ denied). `attendance-mode-actions` is registered as a reasoned location-administration exemption (it must work while the attendance module is off). New actions use a registered guarding helper. |

## 11. Open owner policy decisions (none invented)

- **Q1 Break pay**: are breaks paid, unpaid, or length-dependent (e.g. unpaid at 30 minutes or more)? Until decided every break stays `unclassified` and payable time stays pending. Who classifies (a manager per break vs a location rule) and whether a rule may pre-classify at clock-out.
- **Q2 Auto clock-out**: threshold, who is notified, and what value it writes. The `auto_clocked_out` status exists but nothing writes it; open sessions are only surfaced.
- **Q3 Business day**: `service_date` is the location-local calendar date of the clock-in. Is a late-night cutoff (e.g. 4 AM) wanted so a 1 AM shift belongs to the previous service day?
- **Q4 Rounding / overtime / pay rates**: none exist; the owner's rules are required before Batch C feeds Payroll.
- **Q5 Self-correction**: may a manager correct their own punches (currently allowed and flagged), or must another manager do it?
- **Q6 Correction window**: should corrections to already-paid periods be blocked or need extra approval (relevant once Payroll consumes native attendance)?
- **Q7 Overall Assistant Manager / Shift Manager**: they inherit management authority via the shipped tier model (≥ 2). Confirm this is wanted for attendance corrections.
- **Q8 Hosted rollout**: authorization to back up, rehearse and apply the two migrations to hosted DEV, and whether a Preview deployment of this branch is acceptable first (the branch has deliberately **not** been pushed, because the Vercel integration would build a Preview wired to DEV, which lacks these migrations).

## 12. Batch C handoff (historical; superseded by §13)

Ready: a stable per-session summary (`attendance_session_summaries`) with completeness / correction / policy-resolution flags; an immutable event ledger with attributed corrections; per-location source selection; provenance labels.

Prerequisites / blockers before Batch C:

1. Owner decisions Q1, Q4 and Q6 (and Q2/Q3 if Payroll needs a closed business day).
2. Payroll consumption must read `net_payable_seconds` only where `break_policy_resolved`, and must exclude (and surface) unresolved or open sessions. It must never subtract a break whose classification is `unclassified`, and must not recompute confirmed payroll snapshots retroactively.
3. Define how a correction after a payroll period is confirmed is handled (Q6); the ledger already records `last_corrected_at` and `correction_count` to detect it.
4. V2-006.007: keep the Neon reader as is; cutover/compatibility is a separate explicit per-location operation (no automatic conversion).
5. Hosted DEV rollout authorization (Q8) and a single consolidated PR after Batch C.

---

## 13. Batch C — Payroll / Tips integration and External compatibility (V2-006.006, V2-006.007)

Local implementation on the same branch. **No migration was added** (the checksums in §8 are unchanged). Hosted DEV and Production untouched. The branch is still unpushed; there is no PR.

### 13.1 Decision: the code is ready, financial activation is NOT granted

No owner approval record exists for Q1–Q8 (issue #254 has no decision; §11 is unchanged). The recorded approvals are all `not_approved` in code (`RECORDED_FINANCIAL_POLICY_APPROVALS`). Native attendance is therefore built, tested and previewable but **blocked as a financial source**: `evaluateFinancialActivation` returns `BLOCKED_POLICY` naming Q1, Q4 and Q6. External and unconfigured locations keep their unchanged legacy path. Nothing was posted, computed in money, finalized or activated.

### 13.2 Owner policy register (no recommendation is treated as approved)

| #   | Decision                             | Approval record | Implemented behaviour                                                                                                                                                    | Still needed                                                             | Impact                                 |
| --- | ------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | -------------------------------------- |
| Q1  | Break classification                 | **None**        | Breaks stay `unclassified`; payable is NULL until each is classified; a record with an undecided break is ineligible (`UNCLASSIFIED_BREAK`), never zero                  | Who classifies, and whether a rule may pre-classify                      | **Blocks** native financial activation |
| Q2  | Auto clock-out                       | **None**        | Not implemented. The reserved `auto_clocked_out` status is treated as ineligible (`AUTO_CLOCK_OUT_UNAPPROVED`)                                                           | Policy, if ever wanted                                                   | None today                             |
| Q3  | Service date                         | **None**        | Location-local calendar date of the clock-in; no cutoff. A stored date that disagrees with the clock-in is ineligible                                                    | Whether a late-night cutoff is wanted                                    | Period grouping only                   |
| Q4  | Payroll rules                        | **None**        | Existing rules only: `computeGrossCents = round(hours × rate)`, per-person override else organization default. No new rate, rounding, overtime or holiday logic anywhere | Which rules apply to native hours, and how native hours map into Payroll | **Blocks** activation                  |
| Q5  | Manager self-correction              | **None**        | Unchanged: allowed and flagged `self_correction`                                                                                                                         | Independent-approval policy                                              | None in Batch C                        |
| Q6  | Corrections after a confirmed period | **None**        | Detection only (`detectCorrectionsAfterSnapshot`, §13.5). Confirmed rows are provably unchanged (pgTAP 0075). No adjustment is created                                   | The handling workflow (candidate adjustment, who reviews)                | **Blocks** activation                  |
| Q7  | Correction authority                 | **None**        | Unchanged tier model; no new cross-location or Overall privilege                                                                                                         | Confirm Overall Assistant Manager / Shift Manager                        | None                                   |
| Q8  | Hosted DEV migration / Preview       | **None**        | Nothing applied or pushed                                                                                                                                                | Separate authorization                                                   | Gates hosted acceptance                |

### 13.3 Existing Payroll and Tips contracts (audited, not assumed)

- **Payroll** is keyed by `neon_user_id` (integer, NOT NULL) and a calendar month (`period_month`). Periods are organization-level (`location_id = null`) and need organization-manager authority because Neon hours carry no verified location. Hours come from `getAttendanceRows` then `aggregateHours`, which silently excludes rows with null `hours_worked`. Generation refuses when no rate exists. Regeneration is refused when the period is locked or any payment exists; corrections after payment use the append-only `payroll_adjustments` ledger.
- **Locked and confirmed protection is database-enforced**, stronger than the application layer: `payroll_periods_actor_guard` refuses a snapshot change on a locked period for any signed-in actor (42501); `forbid_payroll_period_snapshot_edit` refuses it once any payment exists; confirmed payments cannot be edited or deleted (trigger, and RLS lets only drafts be deleted); adjustments have no UPDATE, DELETE or TRUNCATE grant.
- **Tips has no hours-based formula.** `allocateTipInterval` splits an interval's cents equally among the chosen participants with remainder distribution. The only attendance use is the "Pull clocked-in team" **suggestion** (who is clocked in), which the Allocation board also uses for prioritisation.
- **Native sessions are keyed by `profile_id`; Payroll by `neon_user_id`.** A native-only employee has no `neon_user_id`, so there is **no schema path to a payroll period for native hours** without a Payroll contract change. This is an activation prerequisite (§13.7) and was deliberately not invented here.

### 13.4 Architecture (what was built)

```text
Location attendance_mode
        |
        v
resolveFinancialSource(mode)           domain/financial-source.ts
        |
        +-- INTERNAL_THE_LINEUP -> readNativeFinancialAttendance        data/native-financial-data.ts
        |                          authority gate, then a single-statement read of
        |                          attendance_session_summaries -> evaluateNativeSession
        |                          -> AttendanceFinancialRecord (audit: append_only_ledger)
        +-- EXTERNAL / UNCONFIGURED -> existing Neon reader and Payroll/Tips paths, UNCHANGED
        |                          evaluateExternalRow is a thin translator (contract-tested;
        |                          no new Neon access path was added)
        +-- DISABLED -> no attendance hours (NOT_APPLICABLE)
        |
        v
evaluateFinancialActivation(decision, approvals)
   -> BLOCKED_POLICY (Q1, Q4, Q6) | ACTIVE_LEGACY_UNCHANGED | NO_ATTENDANCE_HOURS | ACTIVE
```

Files: `domain/financial-source.ts` (contract, adapters, summaries, policy gate, labels), `data/native-financial-data.ts` (reader and open-session roster), `actions/financial-readiness-actions.ts` (read-only, module-guarded), `components/payroll-readiness-panel.tsx` (manager-only, "Preview only"), `data/attendance-actor.ts` (§13.6). Payroll files were not modified. Tips and Allocation changed only in how the roster suggestion chooses its source (§13.5).

### 13.5 Integration state

| Consumer                                                  | State                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Payroll generation, regeneration, locking                 | **Unchanged** (Neon only). Native attendance is not consumed.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Payroll readiness                                         | New **read-only preview** in the Attendance tab for managers of an internal location: ready vs needs-attention counts, the reason per shift, and a per-person "has a final total" flag. **No hours and no money.** External locations are told their existing behaviour is unchanged (no Neon read).                                                                                                                                                                                                                     |
| Tips calculation and confirmed distributions              | **Unchanged.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Tips "Pull clocked-in team" and Allocation board priority | **Source-aware** for the verified location: internal reads native open sessions; disabled suggests nobody; external and unconfigured use the unchanged Neon path. A database without the attendance-mode column (PostgREST 42703) is legacy by definition and keeps Neon; any other failure fails closed. This prevents silently mixing Neon rows into an internal location. It is a **suggestion list** (no hours, no amounts) and is live only for a location an owner has set to internal, which no real location is. |

Eligibility (all tested): completed, not voided, breaks resolved, payable non-null and not negative, durations consistent with the absolute instants, service date consistent with the location zone, tenant/location/employee match, not a duplicate, not already consumed. A shift that runs past the period end is flagged `PERIOD_BOUNDARY` and is never split, clipped or duplicated. Failed reads are distinct outcomes (`ACCESS_DENIED`, `SOURCE_ERROR`, `SOURCE_UNAVAILABLE`), never an empty report; a malformed row fails the read instead of being dropped. `detectCorrectionsAfterSnapshot` reports native records corrected after a snapshot time; it creates nothing.

### 13.6 Security finding fixed during Batch C (P1)

Commit `8593684` (Batch B browser acceptance) changed the shared `getCurrentUser(slug)` to accept an Overall role with **no membership**. That helper gates the **service-role** account routes (`/api/auth/passcode/reset`, `/api/team/deactivate`, `/api/team/reactivate`, account recovery) and `guardModuleForSlug`. An Overall owner or manager could therefore pass it for **any** organization slug (`organizations_select_member` lets any Overall role read every organization) and then reset passcodes or deactivate members through the service-role client (`canChangeDesignation` is true for any target when the designation is owner).

Fixed in `a76e00a`: `getCurrentUser` is restored byte-for-byte to the base behaviour, and the native attendance actions use the new `getAttendanceEntryUser` (canonical active-context resolver plus `getEntryUser`, the Payroll-actor pattern). Overall administrators keep attendance access (browser-verified) without widening those routes. Locked by `current-user.test.ts` (an Overall-only user gets null; the Overall role is never consulted). Whether Overall owners should administer accounts across organizations is a separate product decision and must not arrive as a side effect of an attendance change.

### 13.7 Activation prerequisites (before any real financial use of native attendance)

1. Owner approval of Q1, Q4 and Q6, recorded, then reflected in `RECORDED_FINANCIAL_POLICY_APPROVALS` by a reviewed PR.
2. A Payroll contract for native employees (no `neon_user_id`): how a profile maps to a payroll period, how location-level periods relate to the organization-level model, and how native hours replace Neon hours without changing the rate or rounding rules.
3. A duplicate-consumption ledger (a unique source-record reference per consumer) so a retry or regeneration cannot double-count. The contract already carries a stable `sourceRecordId` and `correctionVersion` for it. Not built, because nothing consumes yet.
4. The Q6 workflow for `detectCorrectionsAfterSnapshot` hits (authorised review, then the existing `payroll_adjustments` path); never auto-posted.
5. A per-location source cutoff contract for periods that span a mode change, using `audit_events` (not implemented).
6. The hosted DEV migration gate (Q8): project identity check, ledger inspection (82), backup and restore readiness, checksum verification, rehearsal on representative data, authenticated smoke, reconciliation, and a recovery or forward-fix plan.

### 13.8 External (Neon) compatibility: preserved, labelled by what was actually tested

- The reader, SQL, timeout and error handling in `attendance-data.ts` are untouched, and so are the existing Payroll and Tips Neon paths.
- `evaluateExternalRow` is a pure translator: hours are the source's own `hours_worked`; the Neon `date` decides the period (no boundary logic added); an auto-closed row with hours still counts; a row without hours is excluded **with a reason**; identity uses `attendance_identity_links` (UUID to id, never names) and flags unmapped or ambiguous links only where a profile is required. A parity test shows eligible external hours equal the existing `aggregateHours`.
- External records never claim internal audit guarantees (`audit: none_provided`; correction and break fields are `null`).
- No external record is copied into native tables, and no new Neon read path was added (the Neon database has no organization or location scoping).
- **Deferred, not claimed:** live Neon connectivity. Every external test uses grounded fixtures or the existing mocks; the local environment has no `NEON_DATABASE_URL`.

Source transitions never migrate or rewrite history. Leaving `internal_the_lineup` is refused while any session is open (`55000`, pgTAP 0073). Native history stays native, Neon history stays Neon, and Payroll and Tips history is untouched. Automatic detection of a period that spans a mode change is **not** implemented (§13.7 item 5).

### 13.9 Concurrency and idempotency (real parallel sessions, committed synthetic fixtures)

- **Reads during corrections:** 40 manager corrections were committed through the RPC while 150 concurrent reads ran against the summary view: **0 torn reads**; readers observed all 41 versions (genuine interleaving) and only the two legitimate durations. Final state: version 41, correction_count 40, and 40 ledger events with 40 distinct sequence numbers (no lost update, no skipped version). The reader is one statement, so every row is a single committed snapshot.
- Stale versions, duplicate or parallel corrections, and idempotent replay were covered in Batch B (6 simultaneous corrections give 1 applied and 5 `P0004`).
- Duplicate payroll or tip preparation: nothing consumes native attendance yet, so there is nothing to double-count. The contract flags a repeated source id (`DUPLICATE_SOURCE_RECORD`) and a reused one (`ALREADY_CONSUMED`), idempotently.
- Membership revocation and mode change: covered by pgTAP 0073 and 0075 (a revoked manager fails the gate and reads nothing; a mode change with open sessions is refused).

### 13.10 Test receipts

**Newly executed this session** (local disposable stack, pristine after `db reset --local`):

- Vitest, whole repository: **3,784 passed, 7 pre-existing skips** (276 files).
- pgTAP, whole repository (`supabase test db --local`): **77 files, 2,929 assertions, PASS**, including the new 0075 (54).
- `npm run check` (Prettier, ESLint with `--max-warnings=0`, `next typegen` and `tsc --noEmit`): clean. `CI=1 npx next build --webpack`: success.
- Playwright (`playwright.attendance-local.config.ts`): **39/39** across desktop, tablet and mobile, now including the readiness panel assertions and the Overall-administrator test through the new actor.
- Mutation checks: 3 mutations of the contract and 1 injected tamper of a confirmed tip allocation were each caught by the suites.

**Reused prior evidence:** the Batch A and B design receipts in §4 and §9 (not re-derived).

**Deferred:** hosted DEV rollout and smoke; live Neon connectivity; Safari/WebKit; the independent security and financial review.

**Environment hygiene finding:** the Playwright harness commits fixtures (organizations, sessions) that cannot be removed because the attendance ledger is deliberately undeletable. Until the local database is reset, three count-based assertions in 0059 and 0062 (global membership, configuration-row and organization counts) fail. This is test pollution, not a regression: they pass on a reset database.

### 13.11 Independent review package (required before the single PR)

The implementing agent does not approve its own security-critical work. Reviewer scope:

1. `financial-source.ts` eligibility and period rules against the Payroll contract in §13.3.
2. `native-financial-data.ts`: authority before read, error mapping, snapshot consistency.
3. The `getCurrentUser` revert and `getAttendanceEntryUser` (§13.6) against every caller.
4. The source-aware roster in Tips and Allocation (fail closed versus the 42703 legacy fallback).
5. pgTAP 0075 assumptions.
6. The SECURITY DEFINER attendance RPCs (unchanged since Batch B).
7. Completeness of the activation prerequisites in §13.7.

### 13.12 Release readiness

Batch A VERIFIED · Batch B VERIFIED · Batch C IMPLEMENTED LOCALLY (code ready; **financial activation policy-blocked**) · Independent review PENDING · Hosted DEV acceptance PENDING APPROVAL (Q8) · Final PR NOT CREATED · Issue #254 OPEN. V2-006 is **not** complete.

## 14. R1 — Independent security and financial review (2026-11-10)

Reviewer: Claude (Sonnet 5.5), a different session from the Batch C implementer. The reviewer **also authored the one fix below (`b4d056e`)**, so that fix has not had a second independent review. Scope was the diff `e796eee..44f6e8a`, prioritising §13.11.

**Decision: PARTIAL.** No P0 and no P1. One P2 defect found and fixed; two P2 design gaps and five P3 notes remain; native financial activation stays policy- and architecture-blocked.

### 14.1 Verified

- **P1 repair VERIFIED.** `src/lib/current-user.ts` is byte-identical to base (`git diff e796eee HEAD` empty): membership-strict, never consults the Overall role, so the service-role passcode-reset, member deactivate/reactivate and account-recovery routes still deny an Overall-only actor. `getAttendanceEntryUser` uses the canonical resolver and grants nothing; the database decides.
- Real-subject database probes (24/24, scratch, rolled back): an Overall owner without membership can manage and correct (attributed to their profile) but cannot clock themself in; a **revoked Overall role loses authority immediately**; a forged foreign location is denied uniformly; org A cannot read or correct org B; a stale `expected_version` is rejected; `INTERNAL → DISABLED` is refused while a session is open; `anon` is denied everywhere. Grants, RLS, no TRUNCATE and `search_path = ''` re-checked on the live local catalog.
- Immutability test (`0075`) is real: populated synthetic confirmed rows, whole-row digests, and a **mutation control** (altering a confirmed period and tip allocation made it fail exactly there). It is synthetic local evidence, **not** hosted DEV proof.
- Payroll, Tips formulas and the Neon reader are untouched (`git diff` of those paths is empty); the Tips diff is two lines passing `locationId`.

### 14.2 Finding fixed

- **R1-F1 (P2).** The native report and the payroll-readiness preview took their location only from the persisted cookie, so a stale tab rendered another branch's rows under the old header (every other V2-005 module already refuses this). Both actions now take an optional `expectedLocationId`, compared with the verified location and refused (`contextStale`) before the module guard or any read; the UI always sends `source.locationId`. Regression tests failed first.

### 14.3 Open (not fixed here — they need a decision or a migration)

- **R1-F2 (P2) native-only Payroll identity** and **R1-F3 (P2) no consumption ledger**: see `NATIVE_PAYROLL_IDENTITY_ARCHITECTURE.md` (Option A recommended; ledger contract; decision **Q9**). `ALREADY_CONSUMED`, `detectCorrectionsAfterSnapshot` and `evaluateExternalRow` have **no production caller**; `PERIOD_BOUNDARY` is enforced only inside the read-only preview (the only consumer).
- R1-F4 (P3): a new app on a database without the attendance column hard-errors the Attendance tab (Tips/Allocation degrade to Neon instead). Migrations-first rollout makes it unreachable; do not push before Q8.
- R1-F5 (P3): in internal mode the Allocation Quick-Add "clocked-in first" ordering is RLS-scoped, so a non-manager sees only themself. Ordering only.
- R1-F6/F7/F8 (P3): readiness payload carries unrendered per-employee sums; module-off strands open sessions and a deactivated employee mid-shift needs the correction RPC; the DST fall-back repeated hour resolves to its first occurrence in the correction form.

### 14.4 Status ladder (truthful)

```text
Financial source foundation:        IMPLEMENTED
Read-only readiness preview:        IMPLEMENTED
Native Payroll financial consumption: BLOCKED (Q1, Q4, Q6, Q9)
Native-only employee Payroll:       BLOCKED (identity, Q9)
Confirmed historical Payroll/Tips:  PRESERVED
```

### 14.5 Added owner decisions

- **Q9** — Native Payroll identity and consumption contract (technical dependency, not an approved policy): recommended Option A + guard + ledger.
- **Q9b** — Source-switch cutoff: recommended a payroll-month boundary; today only open sessions block leaving internal mode. Unapproved.

## 15. R2 — Native Payroll identity, consumption ledger and financial gap closure (2026-11-10)

**Owner approvals (2026-11-10), decisions only:** Q1 (explicit paid / unpaid / unclassified, authorized manager, audited, never inferred), Q4 (keep
existing payroll rules, organization-level monthly periods and management authority; no new rounding / overtime / rate rules), Q6 (confirmed snapshots
immutable; corrections go to a separate auditable adjustment review; no automatic payment, deduction or silent recalculation), Q9 Option A (source-discriminated
identity, cross-key guard, atomic correction-version-aware ledger, no fabricated Neon ids), Q9b (source change only at a payroll-period boundary after open work and
financial dependencies are resolved). **Still not authorized:** activation of native financial processing, real payments, Q8 hosted DEV, backend-enforcement
activation, production, merge. **Still open:** Q2, Q3, Q5, Q7, Q8.

Implemented locally on this branch (commits b1fa651 database, 29ed814 TypeScript) behind a default-off switch. Architecture as built:
`NATIVE_PAYROLL_IDENTITY_ARCHITECTURE.md` §8. Review scope, honest limits, evidence and the hosted DEV approval package:
`R2_REVIEW_AND_DEV_APPROVAL_PACKAGE.md`. The application activation record (`RECORDED_FINANCIAL_POLICY_APPROVALS`) intentionally stays `not_approved`: it is the
activation gate, not the decision register.
