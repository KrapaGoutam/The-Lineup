# Inventory Item Sheet Dates tab

**Owner:** The Lineup owner  
**Status:** approved by the 2026-11-11 scoped request for local implementation  
**Base:** `origin/development` `d09b6c4600e46653710a8e92a507415af78c5d77`  
**Branch:** `feature/inventory-item-sheet-dates`  
**Integration:** one narrow PR into `development`, after Attendance integration; local work may proceed while Attendance awaits hosted approval.

## User outcome

An authorized inventory user opens one product from the Inventory Table, mobile card, or occupied cooler slot and finds Counts, Levels, Dates and History in the same Item Sheet. Dates uses the existing date groups and save behavior. A Dates shortcut opens that sheet directly on Dates.

## Scope

- In: four accessible tabs in the existing Item Sheet, reusable Dates content, one sheet route for product and Dates entry points, existing save/validation/errors and active location binding.
- Out: stock formulas, quantities, cooler placement, shelves/slots, date group data model, history content, imports/exports, financial features, V2-007.

## Acceptance criteria

- [x] The Item Sheet shows `Counts | Levels | Dates | History`; only the selected panel is visible. Tab selection works by click/touch and keyboard, with a labelled panel.
- [x] Inventory Table and mobile card product actions, and occupied cooler slot actions, open the same sheet. Dates shortcuts select Dates without a second sheet.
- [x] Dates displays existing coverage, date groups, empty state, add/edit/archive controls, validation and errors. It calls the existing `dateLotSave` command exactly as before, using the current snapshot, time zone and active location authority.
- [x] Existing Counts, Levels and History save/read behavior remains intact; no stock or placement calculation changes.
- [x] Desktop, tablet and mobile layouts have no hidden controls or horizontal page overflow. Archived items retain read-only date controls. Close/escape during a pending date save cannot abandon the busy operation.

## UX contract

The Item Sheet opens on Counts for normal product actions and on Dates for a Dates shortcut. A single horizontal tab list sits below the product status/total summary. Counts and Levels preserve their own save buttons and stale conflict notices. Dates retains its summary, loading/empty/error/success behavior from the existing component. History retains its existing loader and error state. A sheet close returns focus to its trigger through the existing dialog primitive. Tabs have selected state, associated panel IDs and arrow/Home/End keyboard navigation. On phones the tab list can scroll horizontally without expanding the page.

## Data and authorization

No schema, migration, grant, RLS, generated type or server action change. Dates reads `CatalogSnapshot.dateLots` for the selected product and writes via the already-authorized `RunCatalogCommand` `dateLotSave`. Inventory Table and Cooler Layout continue to use their existing server-verified location and permission path. The client product ID remains an untrusted selection, and the existing command validates it at the server/database boundary. Existing optimistic version checks, date validation and archived-item edit denial remain.

## Implementation map

- `item-sheet.tsx`: four-tab shell; Counts/Levels/History panels; Dates content panel.
- `date-tracking.tsx`: expose the existing form/list as reusable content without a nested sheet or duplicate command contract.
- `inventory-view.tsx`: replace the separate Dates sheet state with an initial-tab choice on the same Item Sheet.
- No new dependency. Reuse the repo's `Button` and `Sheet` primitives and existing tab styling.

## Tests and risks

Targeted component tests cover tab order/navigation, shortcut initial tab, date save payload, active location context and archived/read-only states. Focused browser checks cover desktop Chromium, WebKit tablet and mobile, keyboard/touch and both list/cooler entry paths when the local fixture permits. Run final `npm run check` and webpack build; broad Inventory suites are unnecessary unless shared code changes. Risk: moving the Dates editor could reset an in-progress form or allow close during a save; keep it mounted during a pending save and block close/navigation while busy. Risk: an all-branches cooler overview could expose a different branch's product; only the existing current-branch edit callback feeds the sheet.

## Rollout

UI-only and reversible by reverting the narrow branch. No database rollout. Do not deploy a Preview or create/merge the Inventory PR before the Attendance integration sequence permits it; require exact-head CI and normal review for the eventual one PR.
