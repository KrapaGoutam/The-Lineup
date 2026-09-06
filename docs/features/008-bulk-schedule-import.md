# Feature 008 — Bulk schedule CSV import

Status: shipped. **Update (Feature 015, Phase B)**: this feature's own scope was demo-mode-only (see "Out" below), but `csv-import-panel.tsx`'s `onCommit` was always wired to the same handler as the manual "Add shift" flow — when Phase B lifted that handler to call `addShiftAction` in real mode, CSV import inherited real persistence for free, without any code change to this feature's files. Documented here rather than left silently stale; see `docs/features/015-hosted-supabase-persistence.md`'s Phase B notes.

**Implementation note**: same division-of-labor change as Feature 005 — Claude implemented this batch directly, Codex is not in this loop. See 005 for the full note.

## User outcome

A manager uploads a CSV of shifts and gets a bulk draft schedule created in one pass, with a clear preview and per-row errors shown before anything is created. Nothing is ever auto-published.

## Scope

**In**: downloadable CSV template, upload → parse → preview UI, per-row validation reusing the existing `createShiftInstances` domain function, name-based employee matching with explicit ambiguous/unresolved-name row errors, a 500-row file cap, duplicate-row-in-file detection, commit creates shifts in the same in-memory demo state the manual "Add shift" flow already uses.

**Out**: any real Supabase persistence — this stayed demo-mode/in-memory like the rest of the app at the time this feature shipped, per explicit direction, with real persistence tracked as the then-unchecked `docs/ROADMAP.md` Phase 2 item 6. (As of Feature 015 Phase B, real persistence arrived anyway as a side effect of the schedule module's own wiring — see the status note above.) Also out: CSV export, group-editing an already-imported batch (undo works through the existing schedule state, nothing special added for imports).

## CSV format

Columns: `employee_name`, `shift_kind` (`morning` / `evening` / `full_day`), `from_date`, `to_date` (optional), `custom_start` / `custom_end` (optional pair), `note` (optional). This maps directly onto `createShiftInstances()`'s existing input shape — the parser's job is CSV row → that function's input, reusing 100% of the existing pure expansion/default/overnight logic rather than duplicating it (per `AGENTS.md`'s no-duplicated-business-rules rule). The template download is a static CSV with the header row plus one example row.

## Acceptance criteria

- [x] Manager can download a CSV template with the documented columns and one example row.
- [x] Uploading a valid CSV shows a preview table with every row marked valid and a count of shifts that will be created.
- [x] Any row with a bad date, a lone custom-start/end (missing its pair), an unresolved or ambiguous employee name, or a duplicate within the file shows a specific per-row error.
- [x] Commit is blocked while any row has an unresolved error; a manager can explicitly toggle a bad row to "skip this row" to commit the remaining valid rows rather than being silently blocked by one typo (no silent partial commit — see Decisions).
- [x] Commit creates shifts with `status: draft` only — none are published.
- [x] A file over 500 data rows is rejected up front with a top-level message before any per-row parsing.
- [x] Servers (non-managers) never see the import control.

## UX contract

- Entry point: "Import CSV" button in the schedule workspace's manager toolbar.
- Desktop/tablet: modal/panel with the preview table.
- Mobile-width: a full-screen sheet rather than a fixed-width modal (host tablet is a manager surface too, per Feature 007's viewport targets).
- Loading: "Parsing…" during client-side parse (near-instant for ≤500 rows — no server round-trip, pure client parse against demo state).
- Empty: "Upload a CSV to preview shifts" placeholder before a file is chosen.
- Error: top-level file errors (too many rows, unparseable CSV) vs. inline per-row errors in the preview table, both `aria-live` announced.
- Success: "N shifts created as drafts" confirmation; panel closes back to the existing draft-count summary.
- Permission denied: the control isn't rendered for non-managers at all, matching the existing "Add shift" gating.
- Keyboard/screen reader: the preview table is a real `<table>`, with each row's valid/error status announced via visually-hidden text, not color alone — directly required by the PRD's "color is never the only indicator" rule, which a naive red/green preview table would violate.

## Data and authorization

None added by this feature — no new schema, RLS, migration, routes, or server actions. As of Feature 015 Phase B, a real-mode commit goes through that phase's `addShiftAction` (the same one the manual "Add shift" form uses), so it is subject to that action's own authorization and data rules, not anything specific to this feature.

## Implementation map

- `src/features/schedules/domain/parse-schedule-csv.ts` (new, pure parser/validator reusing `createShiftInstances`)
- `src/features/schedules/components/csv-import-panel.tsx` (new, wired into `schedule-workspace.tsx`)
- Static template asset (e.g. `public/templates/shift-import-template.csv`, or generated client-side from a constant)
- No routes, server actions, RPCs, Realtime, migration, or generated types added by this feature itself.

## Test plan

- Unit: `parse-schedule-csv.test.ts` — valid rows, each error class (bad date, lone custom time, unresolved name, ambiguous duplicate name, duplicate row in file, >500 rows), reusing `shift-planning.test.ts` fixtures where they apply.
- Component: preview-table rendering (valid/error row states, commit-disabled logic, skip-row toggle).
- Database/RLS: none — no schema touched.
- Playwright: manager uploads a small valid CSV in demo mode, sees the preview, commits, sees the new draft shifts in the week grid; uploads a CSV with a bad row, sees the row error, commit stays disabled until resolved or skipped.
- Manual viewports: template download + preview table usability at tablet width (the host-stand primary surface for this control).

## Rollout and rollback

- Feature flag: none.
- Expand/migrate/contract: n/a — no schema touched.
- Backfill: none.
- Rollback limit: plain code revert; writes only into the same in-memory state the manual form already uses, no data risk.

## Decisions and risks

- **Decision**: block full-file commit while any unresolved row error exists, with an explicit per-row "skip this row" toggle — a manager knowingly excludes a bad row rather than being silently blocked or silently having it dropped.
- **Decision**: name-based employee matching; ambiguous or unresolved names become row errors (per explicit direction).
- **Decision**: demo-mode/in-memory only this batch — real persistence stays under the existing unchecked ROADMAP Phase 2 item 6, not scoped into this feature (per explicit direction — no fifth feature doc for Supabase/Vercel connection work).
- **Risk**: name-based matching is fragile long-term — there's no unique employee identifier in `profiles` yet. Accepted for now per explicit direction; flagged again here so it isn't forgotten when real persistence eventually gets built and this matching strategy needs revisiting.
- Open questions: none remaining.
