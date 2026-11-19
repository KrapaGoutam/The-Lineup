# Release Group 1 — Reporting Foundation (V2.0.5 / V2.0.6 / V2.0.7)

Single authoritative handoff for this release group (repository convention: `docs/features/<slug>/HANDOFF.md`).
Order is strict: **A (V2.0.5) → B (V2.0.6) → C (V2.0.7)**.

## Identity

| Item                    | Value                                                                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository              | `KrapaGoutam/The-Lineup`                                                                                                                             |
| Integration branch      | `development`                                                                                                                                        |
| Production              | `main` — untouched, no changes authorized                                                                                                            |
| Batch A                 | PR #354 merged at `fbf44a1a2cc5158bf372e43967562b88a70bd68f` (V2.0.5 Neon timezone)                                                                  |
| Batch B                 | PR #355 merged at `1729688416f74cba0fe25daaa48597c471d8ed32` (owner-authorized merge commit; head `0a8eaa70887d13be51db4ac43fff58222e665765`)        |
| Batch C baseline        | `1729688416f74cba0fe25daaa48597c471d8ed32` (= `origin/development` after the PR #355 merge)                                                          |
| Batch C branch/worktree | `feature/v2-007-combined-reporting` / `.tmp/v2-007-combined-reporting`                                                                               |
| Batch C PR              | Recorded in the PR itself. The exact final head SHA and CI run ids are in the PR comment (a commit cannot contain its own hash).                     |
| Environment             | Local worktree only. No hosted database contact, no migration, no Neon write, no Production change. Real-RLS evidence is the disposable local stack. |

## Batch A — V2.0.5 Monks Neon timezone (merged)

Neon clock columns are `timestamp without time zone` (local wall time); fixed at the Neon data boundary (`::text` + `neonWallTimeToInstantIso`, America/Chicago). 13 tests under `TZ=UTC / America/Chicago / Asia/Tokyo`; PR #354.

## Batch B — V2.0.6 Monthly attendance reports, statements & dynamic branding (merged)

Delivered: month/range/preset filters, single/multiple/all employees, the `UnifiedAttendanceReport` contract (integer seconds, `hoursBasis`, `isPartial`, unresolved count), `UnifiedAttendancePrintDialog`, `resolveReportBrand` + `ReportLetterhead`. The independent review corrected: Webster address (Texas, not New York), per-shift rounding before summing, gross-hours fallback, voided shifts counted, a misleading "Page X of Y", silent truncation, caller-supplied logo markup, an unbounded `profileIds` list.

### Verification wording (corrected in V2.0.7 — C0.2)

Batch B's earlier text called some print behaviour "verified". The evidence actually was narrower, and is restated here without inflation:

- **Chromium checked** (Playwright, US Letter, print media): a 4-page PDF, MediaBox 612 × 792 pt; computed styles for `thead`, `tr`, white background; no dialog chrome.
- **Physical multipage pagination was not fully verified in Batch B.** Header repetition on a continuation page was confirmed from computed CSS only.
- **Pixel-level inspection of pages 2+ was outstanding in Batch B** (no PDF rasteriser was available). It was performed in V2.0.7 for the _combined report_ only (see "Print acceptance" below); the older Attendance/Payroll print dialogs have not been re-inspected.
- **Safari and Firefox were not verified.** In V2.0.7: WebKit print-media _styles_ were checked (no PDF/pagination is possible through Playwright); Firefox is not installed on the build machine.
- The Neon normalizer `normalizeNeonAttendanceToUnified` was **not wired to any UI** in Batch B. It is now used by the combined read path (see C0.3).

## Batch C — V2.0.7 Combined Attendance & Payroll Reporting (implemented; PR open for review)

This is a **reporting and document-composition release.** It reads existing payroll snapshots, payments, adjustments and attendance. It creates, recalculates, reassigns or deletes nothing. No migration. Shelved migration 92 was not touched.

### Closed follow-ups

- **C0.1 Year in period labels.** `src/lib/report-period.ts`: day → `Mon, Nov 30, 2026`; whole month → `November 2026`; same-year range → `Sun, Nov 1 – Mon, Nov 30, 2026`; cross-year → both years. Only a whole month is titled "Monthly Staff Attendance Timesheet"; anything else is "Staff Attendance Statement". 18 tests, run under three time zones.
- **C0.2 Print terminology.** Corrected above.
- **C0.3 Neon integration.** Neon attendance is read through the existing `getAttendanceRows` (so the V2.0.5 wall-time conversion is unchanged) and the existing normalizer, **only** for a branch whose `attendance_mode` is explicitly `external`. An unconfigured (`NULL`) branch is **not** read from Neon (the single Neon database belongs to one tenant). The existing Monks attendance interface is untouched.

### Decisions

1. **Standalone `/reporting` route**, not a new shell tab. `AppTab` is compile-time-bound to the module registry (a tab needs a registered module and, for per-location enablement, a database module key — a migration). Entry points: Settings (managers, real mode), Attendance ("Open in Reporting Center" with the on-screen filters) and Payroll. A link only **pre-fills** the builder.
2. **Financial truth is the stored snapshot.** `base = payroll_periods.gross_cents`; `balance = computeBalanceCents` verbatim (base − confirmed payments − Σ adjustment deltas). The register shows "Adjustments" as the _effect on the amount owed_ (`−Σ delta`, matching the existing ledger lines) and "Gross" as base + that effect. Draft payments are listed, never counted. Hours on a payroll row come from the snapshot; attendance hours are shown beside them. **A difference is reported as an exception, never reconciled.**
3. **Integer cents and integer seconds** everywhere; rounding only in display helpers.
4. **Identity is never merged by name or bare number.** Cross-source merge only through a verified `attendance_identity_links` row or an identical authenticated profile id. An unlinked external person stays separate and is reported ("unmapped").
5. **Conflicting payroll records** (two sources for one person-organization-month) are all shown, none enters any total, and the report is marked incomplete.
6. **Cross-organization totals are labelled informational aggregates;** each organization keeps its own subtotals and branding.
7. **Org-level payroll** (no `location_id`): attributed to the organization's sole branch when it has exactly one; otherwise shown as "Organization-level", and only when the user chose every branch they can report on.
8. **Incomplete means no print and no export.** Any blocking exception (failed/truncated read) or source conflict disables Print and CSV and shows an alert.
9. **Export is CSV** (register, attendance, ledger, exceptions), formula-injection-safe via the shared writer. Print/PDF and CSV are produced from the server-authorized payload; there is no separate export or PDF endpoint to protect.
10. **Payment method is not recorded** in the payroll ledger, so none is printed.

### Permission model

`loadReportingAuthorities` (server) combines, per (organization, branch): the canonical three-layer resolver, the live `attendance_can_manage` database predicate, and the per-branch Attendance/Payroll module verdicts (`checkModuleAccess`, built in the Server Action because only Server Actions may import the module-enforcement entry). Any failure lowers authority.

| Caller                           | Attendance | Payroll                              | Scope                  |
| -------------------------------- | ---------- | ------------------------------------ | ---------------------- |
| Overall owner/manager            | all        | all                                  | org-wide, every tenant |
| Org owner / general manager      | all        | all                                  | org-wide, own org      |
| Branch manager / assistant (≥ 2) | all        | all (mirrors DB `payroll_*` level 2) | own branch only        |
| Staff                            | self       | self (own **locked** records only)   | own branch             |
| Module off at a branch           | none       | none                                 | per module, per branch |
| Revoked / unassigned             | none       | none                                 | refused                |

A selection naming any organization, branch or employee outside this authority is **refused as a whole** with a non-disclosing message. Every row read is checked a second time against the caller's per-branch authority (defense in depth beyond RLS).

### Report contract (summary)

`CombinedReport`: `reference`, `generatedAt`, `period` (attendance range **and** payroll accounting months), `organizations`, `branches`, `employees`, `attendanceSlices/Rows`, `payrollEntries` (source, branch attribution, base/adjustments/gross/payments/balance, payment state, `includedInTotals`), `register`, `ledger`, `summary`, `byOrganization`, `byBranch`, `exceptions`, `completeness`. Output may be split by organization or branch: the split happens **before** totals, so each sub-report has its own totals, exceptions and completeness.

### Review findings and corrections (independent code review, high effort)

Ten findings; all fixed with tests:

1. **PostgREST `max_rows` (1000) silently capped payroll, ledger and native attendance reads**, so the "limit + 1" truncation guards could never fire (the V2.0.6 native reader had the same latent flaw). New `src/lib/postgrest-paging.ts` pages with an exact count; proven against real PostgREST (1,196 shifts and 1,150 periods returned in full; 2,392 shifts reported incomplete).
2. Split-by-organization/branch dropped a group whose read failed. Fixed.
3. Self-only attendance ignored an employee selection. Fixed.
4. An info-level "not configured" note blocked printing. Completeness now follows severity.
5. A non-manager opening an employee link was stuck. Fixed.
6. Org-level payroll inclusion was judged from the content-narrowed branch set. Now judged from the branches chosen.
7. External (Neon) people were not scoped to the selected external branch; branch-less attendance never matched payroll. Fixed.
8. Sequential reads → bounded concurrency. 9. Duplicate profile-name lookup → shared chunked helper with failure reporting. 10. Default periods used "the first branch's" zone → one explicit, displayed reporting zone; month iteration single-sourced.

Found during implementation (not by the reviewer): identity links were loaded only for external-mode organizations, so old Neon-keyed payroll in an organization that later moved to internal attendance showed its linked person as "unmapped". Links are now loaded for every organization in scope.

### Test evidence

- Focused: 262 tests across the reporting domain/data/actions/components, `report-period`, paging, print-stylesheet and attendance data (all pass). Full repository: **340 files / 4,598 tests passed (7 skipped, as baseline)**.
- Reporting + period tests re-run under `TZ=UTC`, `America/Chicago`, `Asia/Tokyo` (394 tests at that checkpoint): all pass. DST days (2026-03-08 spring-forward, 2026-11-01 fall-back), a month-end overnight shift and a year boundary are covered.
- **Real-RLS suite** `tests/local/combined-reporting.local.test.ts` (28 tests, real Supabase Auth JWTs, disposable loopback stack at ledger 97; the two newer migrations — internal-attendance default and table-allocation retention — do not touch these policies): role matrix (Overall, org GM, branch manager, assistant, staff, revoked, foreign-org manager); cross-organization / cross-branch / cross-employee forgery refused; staff see only their own locked payroll and attendance; exact snapshot arithmetic from stored rows (base 60,000 − confirmed 20,000 − (−1,000) = 41,000; draft 5,000 not counted); org-level record rules; split by branch; **read-only proof (row counts of every financial and attendance table unchanged)**; completeness beyond `max_rows`. Residue check after the run: 0 organizations, 0 users, enforcement `staged`.
- Gates run locally: `format:check`, `lint`, `typecheck` (with typegen), `npm test`, `CI=1 npm run build`, `check-nonprod-env`. Browser smoke (desktop, demo mode): see PR comment for the final result.

### Print acceptance (physical output)

Method: temporary harness route (removed, never committed) rendering fixtures → Chromium `page.pdf()` (Letter, `preferCSSPageSize`, print media, **dark OS color scheme**) → page text extracted per page and pages rasterised in Chromium for visual inspection.

| Case                                   | Pages | Result                                                                                                     |
| -------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------- |
| One-page employee (attendance view)    | 4     | cover, summary, statement, attendance details; all 612 × 792 pt                                            |
| Multipage employee (70 shifts)         | 6     | details table spans pages 4–6; header row repeats on 5 and 6; total row shares the last page with ≥ 2 rows |
| All-employee register (60 employees)   | 69    | register spans several pages with repeated headers; one statement page per employee                        |
| Combined, 2 organizations / 3 branches | 9     | neutral cover; per-organization letterheads on each statement (Liquor Tap / Monk's Webster address)        |
| Long ledger (82 entries)               | 5     | header repeated on pages 3–5; totals after the last entry                                                  |
| Empty report                           | 2     | cover + "No records" page                                                                                  |

Defect found and fixed by this inspection: under the **dark theme** the root `<html>` kept the dark app background in print (only `<body>` was forced white), so a PDF with "Background graphics" on would carry dark page margins. `html, body` are now forced white in the shared print block (this also corrects the older print surfaces). A control PDF showed no such artifact, confirming the cause.

Also from inspection: negative amounts no longer rely on red alone; the ledger shows separate payment and adjustment totals.

**Still not verified:** Firefox (not installed); Safari (WebKit checked for print-media styles only — it does not support named pages, so it falls back to the shared 8 mm `@page` margin instead of 12 mm); a physical printer; duplex behaviour; pages of the older Attendance/Payroll print dialogs. Physical page numbering is intentionally not printed.

### Financial reconciliation

Report totals equal the sum of the stored snapshots, payments and adjustments for the selected records (real-DB test). Nothing was recalculated; where payroll hours and current attendance differ the report prints both and a warning. No duplicate source is summed. Historical payroll, Neon and Production were not touched.

### Files changed

New: `src/features/reporting/**` (domain: types, authority, composer, partition, views, links; data: authority loader, scoped readers; actions; components: Reporting Center, document, sections, entry), `src/app/reporting/{page,loading}.tsx`, `src/lib/{report-period,postgrest-paging}.ts`, `src/app/print-stylesheet.test.ts`, `tests/local/combined-reporting.local.test.ts`. Modified: `globals.css` (print), `report-letterhead.tsx` (optional period heading), unified attendance report/dialog/native report (period kind, year labels, paged reader), `active-context.ts` (access-bearing eligible contexts, server-only), settings/attendance/payroll entry links, `enforcement-coverage.test.ts` (reasoned exemption), `tasks/current-task.md`, `docs/STATUS.md`.

### Open items and deferrals

- Firefox/Safari/physical print verification (above).
- Existing helpers not paged: `listLocationEmployees` / identity-link lists (a single branch or organization would need > 1,000 rows; not realistic today). `listLocationEmployees` also sends one `IN` list of profile ids.
- XLSX export (CSV only). Payment method (not stored). Combined-report PDF is browser print, not a server-generated PDF.
- Hosted DEV acceptance with real data and a Preview smoke are not done (no hosted contact was authorized).
- The Reporting Center is manager-oriented in the UI; staff self-reporting works on the server but has no navigation entry beyond the link from Attendance.

### Next owner decision

Review and merge the PR into `development` (separate approval; this batch did not merge it). Then decide on hosted DEV acceptance and whether XLSX / server-side PDF belong in V2.0.8+. V2.0.8 was not started.
