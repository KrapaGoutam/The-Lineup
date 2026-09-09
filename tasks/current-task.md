# Current Task: Feature 032 — Canonical Monk's Logo Integration into ReportLetterhead

**Active Spec:** `docs/features/032-canonical-monks-logo.md`
**Branch:** `feature/032-canonical-monks-logo` (branched from `main`, after Feature 031 / PR #30 merged)
**Status:** Complete — ready to push and open PR
**Assigned Agent:** Claude Code (implementation, verification gate, and PR)

## 🎯 Objective

Swap `<ReportLetterhead>`'s crest from Feature 031's original
hand-authored placeholder mark to the real canonical "The Monk's"
logo, once the user supplied that actual brand asset directly into the
repo. No other change to the letterhead, its props, or any print
surface that consumes it.

## 📖 Key Findings & Architecture

1. **The asset didn't exist yet when first requested.** The user's
   initial prompt claimed the canonical logo was "already placed" at
   `public/brand/the-monks-logo.svg`, but `public/brand/` didn't exist
   anywhere in the repo. Verified this directly (`ls`, repo-wide
   `find`) before doing anything else, rather than trusting the claim
   or fabricating a stand-in -- asked the user to place it, then
   re-checked once they confirmed.
2. **Manual transcription risk was real, not hypothetical.** The
   logo's raw markup is ~167 `<path>` elements of high-precision
   bezier curve data (~85K tokens as plain text) with no way for this
   session to visually render/diff an SVG it hand-typed from chat
   text -- a single mistyped digit in a `d` attribute corrupts the
   artwork silently, no error thrown, no way to self-catch it. Asked
   the user how to proceed rather than guessing; they chose to place
   the exact file into the repo themselves so it could be read
   byte-exact.
3. **Mechanical extraction, not hand-conversion.** Once the real file
   existed on disk, wrote inner markup to a TS constant via a one-time
   Node script (`fs.readFileSync` + regex match on `<svg>...</svg>` +
   `JSON.stringify` for safe escaping) instead of converting ~167
   `<path>` tags to JSX by hand -- zero transcription risk, the file
   content passes through unmodified.
4. **`dangerouslySetInnerHTML` is the right tool here, not a shortcut
   to avoid.** The markup is a static, pre-existing, machine-extracted
   asset (never user input), and JSX has no simpler way to render a
   large pre-existing block of raw SVG. Documented this reasoning
   directly in the component's own comment so it doesn't read as an
   unexplained deviation from this codebase's normal React patterns.
5. **Live visual verification, not just automated assertions.** An
   automated "one `<svg>` element exists" test would pass even for a
   garbled or empty path. Started the dev server in demo mode, opened
   the Combined Statement dialog, and took an actual screenshot to
   confirm the crest renders as a legible, correctly scaled, properly
   colored brand mark -- not just that markup was present in the DOM.

## 🔒 Non-negotiable Constraints

- No change to `ReportLetterheadProps`, the letterhead's layout/copy,
  or any filename convention -- this is an asset swap only.
- No change to any other print surface
  (`combined-statement-dialog.tsx`, `payroll-print-dialog.tsx`,
  `attendance-report.tsx`) beyond what Feature 031 already shipped.
- The crest must still be an inline `<svg>`, never an `<img>` -- same
  print-reliability invariant as Feature 030/031, still enforced by
  the existing `report-letterhead.test.tsx` test.
- Quality gates (`npm run check`, `npm test`, `npm run build`) pass
  before every commit.

## 🛠️ Implementation Steps

- [x] **Step 1: Verify the asset actually exists** before touching any
      code -- confirmed `public/brand/the-monks-logo.svg` on disk
      (167 `<path>` elements, `width="948" height="928"`, head/tail
      spot-checked against what was originally supplied).
- [x] **Step 2: Mechanical extraction** -- wrote a one-time Node
      script to extract the file's inner `<path>` markup into
      `src/components/print/the-monks-logo-markup.ts` as a
      `JSON.stringify`-escaped string constant (`THE_MONKS_LOGO_MARKUP`),
      byte-exact from the real file, no hand-retyping.
- [x] **Step 3: Swap the crest** -- `report-letterhead.tsx`'s
      `LetterheadMark` now renders `THE_MONKS_LOGO_MARKUP` via
      `dangerouslySetInnerHTML` inside a component-owned
      `<svg viewBox="0 0 948 928" width="37" height="36">` wrapper;
      removed the old hand-authored `<path>` elements; updated the
      component's header/doc comments to describe the canonical asset
      instead of a placeholder.
- [x] **Step 4: Unit test check** -- confirmed
      `report-letterhead.test.tsx`'s existing 4 tests still pass
      unmodified (none assert on specific path content, only
      `<svg>`/`<img>` presence).
- [x] **Step 5: Quality gate** -- `npm run check` (0 errors/warnings),
      `npx vitest run` (44 files, 325/325 -- unchanged count), `npm
run build` (clean).
- [x] **Step 6: E2E regression check** -- re-ran
      `payroll-timesheet-overhaul.spec.ts` +
      `attendance-reporting.spec.ts` (30 tests across
      desktop/host-tablet/server-mobile) -- 30/30 passing, confirming
      the letterhead's `<svg>`-count/zero-`<img>` assertions still
      hold with the new markup.
- [x] **Step 7: Live visual verification** -- started the dev server
      in demo mode, signed in (manager passcode 2468), opened
      Attendance → Monthly Statement, and took a screenshot confirming
      the real crest renders legibly and correctly (navy/gold/red,
      "MONK'S" wordmark visible) -- not just an automated assertion.
      Cleaned up the dev server process and screenshot artifact
      afterward.
- [x] **Step 8: Documentation** - [x] New `docs/features/032-canonical-monks-logo.md`. - [x] Updated `docs/DESIGN_SYSTEM.md`'s letterhead section to
      note the canonical logo swap. - [x] Updated `docs/features/031-universal-letterhead-and-batch-statements.md`'s
      two mentions of the placeholder mark decision to note it
      was superseded by this feature (not rewritten, just
      annotated -- the original decision record stays accurate
      to when it was made). - [x] Updated `docs/STATUS.md` (Current Status Overview, Feature
      Matrix row). - [x] This task file.
- [ ] **Step 9: Commit + push + PR** - [ ] Commit with a clear message. - [ ] Push `feature/032-canonical-monks-logo`. - [ ] Open PR against `main`.

## 🗂️ File List

- `public/brand/the-monks-logo.svg` (new -- placed by the user
  directly, not authored by this session)
- `src/components/print/the-monks-logo-markup.ts` (new,
  machine-generated)
- `src/components/print/report-letterhead.tsx`
- `docs/features/032-canonical-monks-logo.md` (new)
- `docs/DESIGN_SYSTEM.md`
- `docs/features/031-universal-letterhead-and-batch-statements.md`
- `docs/STATUS.md`
- `tasks/current-task.md`

## Current State & Next Step

Implementation, unit tests, full quality gate, e2e regression check,
and live visual verification are all complete and passing. Nothing
has been committed to this branch yet -- everything above is currently
uncommitted working-tree state on `feature/032-canonical-monks-logo`.
Next step: commit, push, and open a PR against `main`.
