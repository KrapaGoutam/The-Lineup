# Table Allocation Rotation — Approved Design Reference

Status: APPROVED FOR IMPLEMENTATION (planning/contract-freeze complete — see
`docs/features/table-rotation-multi-view/IMPLEMENTATION_CONTRACT.md`)

This directory contains the approved UX/UI reference for The Lineup Table
Allocation Rotation multi-view upgrade (Grid + Floor + Picker + Servers +
Dashboard). It was copied into this repository from a Claude Design export
that had been produced and validated outside this repo; nothing here is
production code.

## Primary visual reference

`approved-design-export/Table Rotation Multi-View v2.dc.html`

**Not** `Table Rotation Multi-View Standalone.html`, despite that file's
name. Both exist in `approved-design-export/`; direct inspection (grepping
each file for `theme`/`dark`/`light`) shows `Standalone.html` has **zero**
theme-switching code, while `v2.dc.html` is the only one of the two with a
working light/dark toggle, Undo/Redo, Clear board, paused-server state,
date navigation, and the "Floor team changed?" clocked-in quick-add banner
— every one of which is in the approved feature list below and in this
repo's screenshots. `v2.dc.html` is the file the
`tools/capture-design-screenshots.mjs` automation actually renders and the
file every screenshot in `screenshots/` was captured from. Treat
`Standalone.html` and `Table Rotation Multi-View.dc.html` as superseded
drafts, kept only for reference.

## What Codex must read, in this order

1. `/CLAUDE.md`, `/AGENTS.md` — repo-wide rules (org/location scoping, RLS,
   pure rotation engine, no moving occupied tables without an authoritative
   check, override auditing, shadcn primitives, `prefers-reduced-motion`).
2. `docs/features/table-rotation-multi-view/IMPLEMENTATION_CONTRACT.md` —
   the frozen contract. This is authoritative over everything in this
   directory when the two conflict.
3. `docs/features/table-rotation-multi-view/AGENT_HANDOFF.md` and
   `PERMISSIONS.md`.
4. This file, then `approved-design-export/docs/design/table-rotation/*.md`
   (`INTERACTIONS.md`, `COMPONENTS.md`, `STATE_MATRIX.md`, `RESPONSIVE.md`,
   `TABLE_ROTATION_DESIGN_SPEC.md`, `IMPLEMENTATION_HANDOFF.md`) for visual/
   interaction detail not restated in the contract.
5. `screenshots/dark/` and `screenshots/light/` for the exact rendered
   result of `v2.dc.html`, and `reference/floor-layout-reference.png` for
   the physical floor layout.

## Supporting Claude Design export

The entire Claude Design export is preserved under `approved-design-export/`
(three HTML variants, `support.js`, `uploads/`, and its own nested
`docs/design/table-rotation/` doc set). It is reference material only —
it is a self-contained "bundler" export (real DOM built at runtime from an
embedded resource manifest) and needs to be served over HTTP to render, not
opened via `file://`.

Do not copy prototype code directly into production without first mapping
it to the existing The Lineup architecture, RLS model, and
`docs/DESIGN_SYSTEM.md` component/token conventions. Where the prototype's
behavior conflicts with existing production architecture, production
architecture wins (see "Implementation rule" below).

## Physical restaurant floor layout

Canonical spatial floor reference: `reference/floor-layout-reference.png`

```
TOP:            T15 T16 T17 T18 T19
MIDDLE:      T14 T13 T12 T11 T10 T9
LOWER CENTER:      T6  T7  T8
LEFT WALL:   T5 / T4 / T3 / T2 / T1  (top to bottom)
BAR:         B1 B2 B3 B4 B5 B6 B7 B8
```

The image defines physical positioning; the existing The Lineup design
tokens (`docs/DESIGN_SYSTEM.md`) define application colors/styling — do not
reuse the prototype's own palette.

## Dark / light reference screenshots

`screenshots/dark/` and `screenshots/light/` each contain the five views
(`01-grid` … `05-dashboard`) plus the Floor Team drawer (`06-floor-team`)
and Quick Add dialog (`07-quick-add`), captured at 1440×1000 from the
primary reference file. `screenshots/tablet/` has the five views at
1024×768, dark only. Regenerate with
`node docs/design/table-rotation/tools/capture-design-screenshots.mjs` if
the export is ever updated (see that script's own header comment — it
already points at the correct local Playwright install for this repo).

## Approved views

1. Grid — existing production view, mature; evolve, do not replace.
2. Floor — new, visual floor map.
3. Picker — new, Grid + visual table picker.
4. Servers — new, per-server board.
5. Dashboard — new, read-only Master Rotation + operational summary.

All five are projections over one shared rotation state, not separate
rotation systems.

## Important approved interactions

See `docs/features/table-rotation-multi-view/INTERACTIONS.md` for the
reconciled, production-grounded version of this list (this directory's own
`approved-design-export/docs/design/table-rotation/INTERACTIONS.md` is the
design-only version and does not know about this repo's actual RLS/RPC
layer). Headline items: Quick Add (clocked-in prioritized, staff and up),
server reorder, pause/resume, clear cell/row/column/board (staff and up —
see `PERMISSIONS.md`), delete row (empty rows only), remove server from
rotation, Undo/Redo (global, server-authoritative), floor-map assignment,
Server View `+ Table`, Dashboard read-only Master Rotation, light/dark
themes. Combined tables use the existing production free-text syntax
`12 + 13` (confirmed in `docs/features/003-table-allocation.md`) — the new
views parse that syntax against the `dining_tables` registry rather than
inventing a new one.

## Auto-row rule

Grid and Picker maintain ~2 empty trailing rounds. See
`docs/features/table-rotation-multi-view/IMPLEMENTATION_CONTRACT.md`
section 9 for the single reconciled rule (this replaces the existing
`private.ensure_trailing_round` single-row behavior, not adds to it).

## Implementation rule

Priority when sources conflict:

1. Existing production security/data architecture (RLS, RPCs, auth)
2. Approved functional requirements (the frozen `IMPLEMENTATION_CONTRACT.md`)
3. This approved design reference
4. Claude Design prototype code (`approved-design-export/`)

Prototype code must never override correct authentication, RLS, Supabase
architecture, permissions, or existing application conventions.
