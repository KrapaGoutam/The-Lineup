# Feature 032 — Canonical "The Monk's" Logo in `<ReportLetterhead>`

**Name:** Canonical Monk's Logo Integration
**Owner:** Krapa Goutam
**Status:** shipped
**Issue/PR:** (branch `feature/032-canonical-monks-logo`, opened off `main` after Feature 031 / PR #30 merged)

## Classification & Session Scope

- **Category:** ASSET SWAP (single-component, print-only)
- **Modifies vs Adds:**
  - Adds `public/brand/the-monks-logo.svg` -- the real canonical "The
    Monk's" vector logo, supplied directly by the user (167 paths,
    948x928 viewBox).
  - Adds `src/components/print/the-monks-logo-markup.ts` -- a
    mechanically-extracted copy of that file's inner `<path>` markup,
    used to inline the crest into the letterhead with zero
    network/asset-loading dependency at print time.
  - Modifies `src/components/print/report-letterhead.tsx`: `LetterheadMark`
    now renders the canonical crest via `dangerouslySetInnerHTML`
    instead of Feature 031's original hand-authored placeholder mark.
- **Contradiction Flags & Hard Boundaries:** none -- this is a pure
  asset/visual swap inside one already-shared component. No prop,
  layout, filename, authorization, or data-flow change anywhere else.
- **Session Scope:** single bounded follow-up to Feature 031.

## User outcome

Every printed report (Attendance timesheet, Payroll statement,
Combined statement) now shows the real "The Monk's" brand crest in its
letterhead, in place of the original placeholder mark Feature 031
shipped with (documented there as a deliberate stand-in, since no real
brand SVG asset existed in the repo at the time).

## Scope

### In

- Real logo asset committed to the repo at
  `public/brand/the-monks-logo.svg`, matching exactly what the user
  supplied (167 `<path>` elements, `width="948" height="928"`, no
  `viewBox` attribute on the source file itself -- the component
  supplies its own `viewBox="0 0 948 928"` matching those dimensions).
- `LetterheadMark` (inside `report-letterhead.tsx`) renders that
  markup inline via `dangerouslySetInnerHTML` on a plain `<svg>`
  wrapper it controls (own `viewBox`, `width="37" height="36"`,
  `role="img"`, `aria-label`) -- never an `<img src="...">`, so it
  prints synchronously with no network or image-decode dependency,
  identical in spirit to the placeholder mark it replaces.
- `the-monks-logo-markup.ts` exports the extracted inner SVG markup as
  a single string constant, generated mechanically from the real file
  (a one-time Node extraction, not hand-transcribed) to avoid any risk
  of silently corrupting the vector path data by retyping it.

### Out

- No change to `ReportLetterheadProps`, the letterhead's text
  layout/copy, or any print filename convention.
- No change to any other print surface's structure --
  `combined-statement-dialog.tsx`, `payroll-print-dialog.tsx`,
  `attendance-report.tsx` all continue to render `<ReportLetterhead>`
  exactly as they did after Feature 031, unmodified.
- `public/brand/the-monks-logo.svg` itself is not referenced via
  `<img>` or a Next.js `<Image>` anywhere -- it exists in `public/` as
  the canonical source-of-truth asset per the design brief's own
  recommendation, but the actual print-time render always goes through
  the inlined markup constant, not a request to that URL.

## Acceptance Criteria

- [x] Given any print surface, the letterhead's crest is the real
      "The Monk's" logo, not the Feature 031 placeholder mark.
- [x] Given the letterhead, the crest is still an inline `<svg>`
      element -- zero `<img>` tags anywhere in the printed area (same
      invariant as Feature 030/031, still enforced by
      `report-letterhead.test.tsx`'s "never a raster `<img>`" test).
- [x] Given the logo swap, `ReportLetterheadProps`, the header/meta
      layout, and every filename convention are byte-for-byte
      unchanged from Feature 031.
- [x] Given a live browser check (demo mode, manager passcode 2468,
      Attendance → Monthly Statement), the crest renders correctly and
      legibly at its on-screen size -- confirmed via screenshot, not
      just "an `<svg>` element exists."
- [x] Given the full quality gate, `npm run check` (0 errors/warnings),
      the full Vitest suite (325/325), `npm run build`, and the
      relevant Playwright print specs (30/30 across
      desktop/host-tablet/server-mobile) all pass.

## Implementation Map

- `public/brand/the-monks-logo.svg` (new): the canonical source asset,
  placed by the user directly into the repo.
- `src/components/print/the-monks-logo-markup.ts` (new,
  machine-generated): `export const THE_MONKS_LOGO_MARKUP = "...";` --
  the source file's inner `<path>` markup, extracted via
  `JSON.stringify` in a one-off Node script (not committed as a
  script; the extraction is a mechanical, repeatable step documented
  in the file's own header comment, re-run only if the source asset
  ever changes).
- `src/components/print/report-letterhead.tsx`: `LetterheadMark`
  rewritten to import `THE_MONKS_LOGO_MARKUP` and render it via
  `dangerouslySetInnerHTML` inside a component-owned `<svg
viewBox="0 0 948 928">` wrapper; header comment updated to describe
  the canonical asset and point at this doc instead of describing a
  placeholder.

## Test Plan & Quality Gates

- **Unit Tests:** `report-letterhead.test.tsx`'s existing 4 tests
  (full-props render, employee-without-role, `employeeName` omitted,
  "never a raster `<img>`, exactly one `<svg>`") all still pass
  unmodified -- none of them assert on the crest's specific path
  content, only its presence/absence as an `<svg>`/`<img>`.
- **E2E Tests:** `payroll-timesheet-overhaul.spec.ts` and
  `attendance-reporting.spec.ts` (30 tests across
  desktop/host-tablet/server-mobile) re-run in full -- all still pass,
  confirming the letterhead's `<svg>`-count and zero-`<img>`
  assertions hold with the new markup in place.
- **Manual verification:** live browser check in demo mode confirmed
  the crest actually renders as a legible, correctly-scaled brand mark
  (navy/gold/red, "MONK'S" wordmark visible at the letterhead's ~36px
  on-screen size) via a screenshot of the Combined Statement dialog --
  not just an automated "one `<svg>` exists" assertion, which would
  not catch a garbled or empty path.
- **Verification Gate:**
  - `npm run check` (0 errors, 0 warnings).
  - `npx vitest run` (44 files, 325/325 tests passing -- unchanged
    count from Feature 031; no tests added or removed).
  - `npm run build` (production build succeeds).
  - `npx playwright test tests/e2e/payroll-timesheet-overhaul.spec.ts tests/e2e/attendance-reporting.spec.ts`
    (30/30 passing across desktop/host-tablet/server-mobile).

## Decisions and risks

- **Decision:** the real logo markup is embedded via
  `dangerouslySetInnerHTML` rather than hand-converted to ~167 literal
  JSX `<path>` elements. The source data is a static, pre-existing,
  build-time-extracted asset (not user input), and JSX has no simpler
  mechanism for rendering a large pre-existing block of raw SVG markup
  without either this API or an equally-manual transcription that
  carries real risk of silently corrupting the vector path data (a
  single mistyped digit in a bezier curve's `d` attribute produces no
  error, just a subtly or badly malformed logo).
- **Decision:** the markup constant is generated mechanically (a
  one-time Node script reading the real file and emitting a
  `JSON.stringify`-escaped string constant) rather than retyped by
  hand from the design brief's pasted SVG text, specifically to
  eliminate that transcription-corruption risk -- confirmed correct
  afterward via a live rendered screenshot, not just a path count.
- **Risk/mitigation:** `public/brand/the-monks-logo.svg` and
  `the-monks-logo-markup.ts` must be regenerated together if the
  source logo is ever revised -- they're presently kept in sync by the
  one-time extraction, not by a build step, so a future logo update
  needs to re-run the same extraction (documented in the generated
  file's own header comment) rather than editing either file by hand.
