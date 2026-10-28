# Bar Inventory — Vendor Order Drafts V1 — Implementation report

## Phase status

VOD-0 planning is complete. VOD-1 database and pure-domain foundation is complete and merged to `development` via PR #193 at merge commit `876be20cf691022093d838dcca8330bbbf03e584`. VOD-2 is complete and merged to `development` via PR #196 at merge commit `292ca1a12ad136ff25d7af57537533fbc3c61209` (see "VOD-2 UI delivered"); VOD-3 is complete and merged to `development` via PR #198 at merge commit `64e3007457c67a1506997dd98c3d2c778f3ca165` (see "VOD-3 sharing delivered"); VOD-4 (hosted DEV final gate) is complete — **GO** (see "VOD-4 — hosted DEV final gate"). Vendor Order Drafts V1 is complete.

Issue: #190. Feature branch: `feature/bar-order-drafts-v1-foundation`. Exact tested head: `dbf608ecfb25133f65c4cc57e2594d482e70ceb8`. Integration target: `development`. `main` and PROD are untouched.

## VOD-1.1 corrective fix

VOD-2 discovery found a VOD-1 database defect before any VOD-2 code was written. In `public.inventory_order_draft_save`, change detection compared each stored `order_qty` against `v_order_qty` before that variable was parsed for the current line, so the first line compared against `NULL` and later lines against the previous line's quantity. An Order Qty-only edit (for example blank → 5) could return `changed = false` without persisting or bumping the version; the same flaw could also bump the version on a true no-op and let a stale quantity-only write skip the `PT409` check.

- Fix branch: `fix/vendor-order-draft-order-qty-save`, from `development` at `34c7481e6ad29a9226a197ba513314c271d8b68c`.
- Additive migration `20261027210000_bar_inventory_order_draft_save_order_qty_fix.sql` redefines the function with the same signature, `SECURITY DEFINER`, empty `search_path`, grants, authorization, `PT409` behavior, and versioning. The current line's quantity is now parsed and validated before it is compared. The VOD-1 migration is not modified.
- Regression pgTAP `0040_bar_inventory_order_draft_qty_save.test.sql` (50 assertions) covers first-line and later-line quantity-only changes, equal adjacent quantities, true no-ops, blank and zero transitions, stale `PT409`, Sent immutability, authorization, and tenant/location isolation.
- No UI, no VOD-2 work, hosted DEV and PROD untouched.

## VOD-1 scope delivered

- Additive migration `20261027195142_bar_inventory_order_drafts.sql`.
- `inventory_order_drafts` and `inventory_order_draft_items`, with organization/location composite foreign keys and indexed access paths.
- A partial unique index enforces at most one `draft` per organization + location + vendor.
- The stable `inventory_vendors.is_system` flag rejects the Unassigned vendor; no display-label comparison is used.
- Only `draft` and `sent` statuses exist. Sender and sent time are both present only for Sent rows.
- Suggested quantity, total, par, status, vendor label, and product display fields are snapshots. Manager-entered `order_qty` remains separate.
- Vendor notes preserve internal whitespace/newlines; item and vendor limits are rejected, not truncated.
- Authenticated clients receive SELECT only. Both tables have RLS; direct INSERT/UPDATE/DELETE/TRUNCATE is not granted.
- Owner, Manager, and Assistant Manager authorization reuses `private.inventory_begin`; Staff, inactive memberships, anon, forged tenants, and mismatched locations are refused.
- Draft-level `version` provides optimistic concurrency. Stale mutations raise the existing `PT409` detail contract. True no-ops do not bump a version.
- Sent drafts reject update/delete, and their items reject insert/update/delete or reparenting into Sent history, with `23514`; tenant teardown cascades remain valid.
- Generated Supabase types were rebuilt from a clean local migration replay. The previous generated file predated all Bar Inventory tables, so the mechanical type diff also catches up that existing schema drift.

## RPC surface

All functions are `SECURITY DEFINER`, pin `search_path = ''`, schema-qualify accessed objects, derive the actor from `auth.uid()`, and are executable by `authenticated` but not `anon`.

| RPC                               | Contract                                                                                                                                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inventory_order_draft_open`      | Returns the existing active draft or creates and seeds one from current Critical/Low items. The database uniqueness constraint and `ON CONFLICT` make retries/races converge.                |
| `inventory_order_draft_save`      | Saves a vendor note and sparse changed lines; validates JSON types, notes, quantity bounds, active same-vendor additions, and concurrency. Suggested snapshots and actors are not arguments. |
| `inventory_order_draft_fill`      | `empty_only` or confirmed `replace_all`, using stored suggestion snapshots only. No-Par lines remain blank.                                                                                  |
| `inventory_order_draft_clear`     | Clears quantities and notes, restores Included, keeps lines/snapshots, and never touches inventory.                                                                                          |
| `inventory_order_draft_sync`      | Re-stamps snapshots and appends newly Critical/Low items without changing Order Qty, notes, Included, or vendor note.                                                                        |
| `inventory_order_draft_mark_sent` | Requires an Included positive quantity, freezes current labels, records sender/time, becomes immutable, and returns an idempotent echo on retry.                                             |

## Pure domain core

`src/features/bar-inventory/domain/order-draft.ts` provides deterministic status/editability, exact-cent totals, Fill, Clear, quantity validation, and trim-only note normalization. It imports the existing `toCents`/`fromCents` helpers and contains no React, clipboard, export, or server behavior.

Totals remain separate:

- Suggested total sums every numeric suggestion snapshot.
- Planned total sums positive Order Qty on Included lines only.
- No-Par items and Included lines without a positive quantity are counted separately.

## Inventory isolation

No draft RPC references the `inventory_stock` table, `inventory_stock_adjust` RPC, or `inventory_adjustments` ledger. `open` and `sync` read the existing security-invoker `inventory_stock_status` view.

pgTAP records a complete stock-row JSON snapshot plus adjustment count/max-id before Mark Sent and proves both are identical afterward. Inventory still changes only through the existing audited stock workflow.

## Validation evidence

```text
Migration replay: PASS (clean local db reset; all migrations)
Focused pgTAP:   PASS — 88/88, including two simultaneous database connections
Full pgTAP:      PASS — 39 files / 1121 assertions
Focused Vitest: PASS — 18/18
Full Vitest:    PASS — 105 files / 1424 tests
Format:         PASS
Lint:           PASS
Typecheck:      PASS
Build:          PASS — Next.js 16.4.3 production build
Playwright:     not run — VOD-1 has no UI or server-action change
Hosted DEV:     untouched
```

The first focused pgTAP run occurred before the migration and failed on the missing tables as intended. Independent security review then drove hardening for NULL Fill mode, full Sent-child immutability, new-product save races, named quantity errors, real-row RLS assertions, concurrent open, sync append, stale Mark Sent, and fresh post-Sent seeding. The full suite also exposed a legacy BI-1 catalog-RPC count that needed to exclude the six new order-draft RPCs.

## VOD-2 UI delivered

Branch `feature/bar-order-drafts-v1-ui` from `development` at `f6bab25bb6d613fb583d11b853c4807e1fa77941`. **No database migration.** PR #196, exact tested head `f6c3fd0fa8cffc954672d67fbbd998b5fdab0b8e`, merge commit `292ca1a12ad136ff25d7af57537533fbc3c61209` (merged by the owner with a merge commit after exact-head CI was green).

- **Navigation.** `Order Drafts` is a fourth Bar Inventory tab (Dashboard · Inventory · Order Drafts · Manage). History and Analytics stay sub-views. No new top-level module; Tasks T-1 `?tab=` work untouched.
- **Data and RPC layer.** Reads: `data/order-draft-data.ts` pages the location's ACTIVE drafts and lines under the caller's RLS and fails (never truncates) when a list would exceed the paging cap. Writes: `actions/order-draft-actions.ts` — one Server Action per RPC (`open`, `save`, `fill`, `clear`, `sync`) plus `list`; each is zod-validated, requires a live session and a management role, calls only the `inventory_order_draft_*` RPC, then re-reads and returns the authoritative active drafts (database truth → canonical state). `domain/db-conflict.ts` is the `PT409` parser extracted from `inventory-actions.ts` so both action files share it. No client-persisted state, no parallel persistence.
- **Controller.** `hooks/use-order-drafts.ts` owns the drafts, a single-flight ordered apply (a slower, older response never overwrites a newer one), focus/open re-reads, and one stable `OrderDraftApi`. Real mode calls the actions; demo mode runs the same operations on `CatalogState.orderDrafts` through `domain/order-draft-demo.ts`, the in-memory twin of the six RPCs (same wording, no-op rule and `PT409` shape).
- **Editor.** `components/order-draft-editor.tsx`. Suggested Order is read-only text (number, or "Order needed" — never invented); Order Qty is a labelled decimal text box; item note and vendor note are plain-text areas that keep internal newlines (trim-only normalization from `order-draft.ts`; limits 200 / 1,000 rejected, not truncated); Include is a labelled checkbox and an excluded line stays visible with an "Excluded" badge. Totals: Suggested total (+ N order needed), Planned order total, included lines and "manual quantity needed" count — ordering units, never money.
- **Save strategy.** Explicit Save / Discard (no per-keystroke RPC). One sparse `inventory_order_draft_save` carrying the vendor note and only the lines whose values changed (`diffDraftEdits` in `domain/order-draft-view.ts`; same value, `5` → `5.0`, blank → blank are not changes). States: clean · dirty · saving · saved (announced only after a successful response) · error (edits kept, "have not been saved") · conflict. No client workaround for the VOD-1.1 defect exists or is needed.
- **Fill / Update suggestions / Clear.** Separate RPCs, blocked while there are unsaved edits. Fill: empty-only runs directly; when typed quantities exist a dialog defaults to "Fill empty quantities only" and offers count-bearing "Replace all". Clear: confirmation naming what is lost; never touches stock. Update suggestions re-stamps snapshots and appends newly Critical/Low items without touching Order Qty, notes or Included.
- **PT409 handling.** Edits remember the draft version they started from. A refused (`PT409`) save, or a newer version that arrives under unsaved edits, shows "This order draft changed elsewhere", who saved which version and when, keeps the typed values and blocks Save until the person chooses **Reload latest** (discard mine) or **Keep my edits on the latest** (re-base deliberately, then Save re-sends only the changed lines). Nothing is auto-merged or silently overwritten. A conflict with the same person's other session is reported as a status, not an alert. Idempotent retries (the first request succeeded) return "no changes" from the database instead of conflicting.
- **Dashboard.** Order soon keeps its role. Each vendor group shows **Create Order Draft** (no active draft) or **Open Order Draft** (active draft), resolved by stable vendor id; both land on the Order Drafts tab. The system Unassigned vendor (matched by the stable `isSystem` flag, not its name) shows "Assign a vendor in Manage to draft an order." and no button; an inactive vendor without a draft explains why. No button renders until drafts have loaded.
- **Navigation guard.** Leaving the tab (or switching draft) with unsaved edits asks **Stay / Discard changes / Save and continue**; `beforeunload` warns while dirty. Leaving Bar Inventory entirely through the app shell is not interceptable from the module (see backlog).
- **Responsive and accessibility.** One DOM per line: stacked card rows on phones, a five-column grid from `md` (Item · Suggested · Order Qty · Item note · Included) — no horizontal page scroll, existing `min-h-11` primitives, no hover-only controls. Inputs have programmatic labels naming the item, errors are tied with `aria-describedby`/`aria-invalid`, dialogs use the repository's native `<dialog>` primitive (focus trap, Escape, focus restore), polite `role="status"` for success and assertive `role="alert"` for failures, status never colour-only.
- **Permissions.** Owner / Manager / Assistant Manager only; Staff never mount the module and the actions and database refuse them.

### VOD-2 validation evidence

```text
Unit (view model):        order-draft-view.test.ts   21 tests PASS
Unit (demo engine):       order-draft-demo.test.ts   18 tests PASS
Component:                order-drafts-view.test.tsx 24 tests PASS; order-soon.test.tsx 5 tests PASS
Playwright desktop:       tests/e2e/bar-inventory-order-drafts.spec.ts 9/9 PASS
Playwright server-mobile: 9/9 PASS
Playwright host-tablet:   NOT RUN locally — WebKit is not installed in the Cloud VM
                          (supplemental Chromium iPad-viewport emulation: 9/9 PASS; not a WebKit result)
tests/real, pgTAP:        NOT RUN — no Docker/Supabase/hosted credentials in Cloud (no migration in VOD-2)
Hosted DEV:               untouched (VOD-4)
```

Local repository gates: `npm run check` PASS; `npm run test` PASS (109 files / 1492 tests); `npm run build` PASS; Bar Inventory regression Playwright (desktop + server-mobile) 130 passed / 2 intentional skips after updating the BI-NAV-001 four-tab assertion.

Exact-head GitHub CI on `f6c3fd0` (run 40594938733): `application` success, `browser-smoke` success (this workflow runs the full Playwright suite on the `desktop` project only, Chromium), `Vercel Preview Comments` success. Database workflow: PATH-GATED / NOT REQUIRED (no `supabase/**` change). The earlier run on `583e648` was cancelled by the newer push and is not evidence.

**Coverage gap to close in VOD-4:** the `host-tablet` project (WebKit) was NOT RUN for VOD-2 — WebKit is not installed in the Cloud VM and CI runs only `desktop`. `server-mobile` (Pixel 7) ran locally only (9/9 new spec; regression green). A Chromium iPad-viewport emulation passed 9/9 but is not a WebKit result. VOD-4 must run host-tablet and server-mobile on a machine with the browsers installed.

## VOD-3 sharing delivered

Branch `feature/bar-order-drafts-v1-sharing-history` from `development` at `75d6ae35cfdfda1ba53d4994b067e12b241c9291`. PR #198, exact tested head `054355ddd4c049812965cb9d27424a396c3d7667`, merge commit `64e3007457c67a1506997dd98c3d2c778f3ca165`. **No database migration** (no `supabase/**` change); only the existing VOD-1/1.1 RPCs and RLS are used. Tasks T-1, the VOD-2 backlog items (Add item UI, leave-Bar-Inventory guard, Realtime drafts) and VOD-4 are untouched.

- **Copy Order.** `domain/order-draft-share.ts` (`purchaseLines`, `copyOrderText`, `withLiveLabels`). Plain text exactly as D-VOD-11: `{Vendor} — Order Request`, one `{Name} {Size} — {Qty}` line per Included line with Order Qty > 0 (name, then size), the item note in parentheses (collapsed to one line), a `Notes:` block only for a non-empty vendor note. The Suggested Order is never in the vendor text. Quantities use `formatQuantity`, moved unchanged from `components/editable-cell.tsx` to `domain/stock-rules.ts` (and re-exported there) so the domain does not import a client component. A DRAFT shares the catalog's live name, size, SKU and vendor name; a SENT order shares the labels frozen at send.
- **Clipboard UX.** `components/order-draft-share.tsx` (`CopyOrderButton`): Clipboard API when present; on a refusal or no API, a visible read-only text area, already selected, with an alert and a Select all button. Success is a polite `role="status"` "Order copied". No `alert()`.
- **Export.** One new `ExportRequest` kind, `order_draft`, carrying only `{ kind, draftId }` (`orderDraftExportRequestSchema`, shared by the action's zod union and the tests). `exportDataAction` validates it, loads the draft by id bound to the server-derived organization and location under the caller's own RLS (`getOrderDraftById`), refuses a missing / other-tenant draft and an order with nothing to send, and calls the existing `prepareExport`. CSV is the **Order** sheet: `Vendor, Item, Size, Unit, SKU, Suggested, Order Qty, Item Note` for Included lines with Order Qty > 0; Suggested is the stored snapshot number or `Order needed`. XLSX is **Order** plus a key/value **Summary** (vendor, status, sent by, sent at in the location time zone and ISO, vendor note, suggested total, items with no suggestion, planned total, order lines). No new writer or dependency; neutralisation is the shared `neutralizeText` through `toCsv` / `workbookSheets`, unchanged. Demo mode builds the same file in the browser from the in-memory draft with the same `prepareExport`.
- **Mark Sent.** `markOrderDraftSentAction` calls only `inventory_order_draft_mark_sent` (server-derived organization/location, the version the manager reviewed) and returns the authoritative active drafts plus the sent facts. The editor captures `draft.version` when the confirmation opens and sends that version, so a draft another manager changed in the meantime is refused (`PT409` → "This order draft changed elsewhere. Reload the latest version before marking it sent.") and the latest version is shown; nothing newer is silently sent. A retry or a second manager on an already-Sent draft gets "Already marked sent by {name} at {time}. Nothing was changed." and no second record. The confirmation states: recorded as sent outside The Lineup, the draft becomes read-only, inventory is not received or changed, and The Lineup does not email or message vendors. It is blocked while there are unsaved edits (Copy and Export too: they use the saved order the server also builds from) and without a positive Included quantity. After success focus moves to the Sent order's heading. Demo twin: `markSentDemo` in `order-draft-demo.ts` (same wording, no-op and `PT409` shape; the demo save / fill / clear / sync now also refuse a Sent order). Nothing in the flow references stock, the ledger or the catalog write path.
- **Drafts | Sent.** A labelled group of two `aria-pressed` buttons inside Order Drafts (not a new top-level module; the four tabs are unchanged). Switching with unsaved edits uses the existing Stay / Discard / Save and continue guard.
- **Sent history.** `getSentOrderDraftsPage`: status `sent` for this organization and location, `sent_at desc, id desc`, an explicit `range` of 20 and an exact `count` (so the 1,000-row API cap can never silently cut history; a page past the end is clamped to the last page); lines are read in explicit pages for just that page's drafts. Rows show vendor, sent date and time in the location time zone (`formatBusinessDateTime`, never raw UTC), sent by, lines ordered (Included with Order Qty > 0) and the planned total (quantities, never money). Previous / Next page buttons with a polite "Page 2 of 3 · 21–40 of 45 sent orders" status.
- **Sent order view.** `getSentOrderDraftAction` (Sent only). Read-only: no input is rendered; frozen item label, **Suggested (at draft)** beside **Ordered** ("Not ordered" for excluded, blank or zero lines), item note, vendor note, sent by and when, planned / lines / suggested totals. Copy and Export remain. Renaming, archiving or changing par or vendor afterwards does not change it (engine test; real-browser DEV check is VOD-4).
- **Small shared change.** `ExportControl` now opens its options towards the left when the 256 px panel would run past the right edge of the screen (a button near the right of a phone added page scroll). Other exports are unaffected on wide layouts.
- **Interpretations to know.** Copy, Export and Mark Sent act on the saved order. "Line count" in the Sent list means lines actually ordered. A new DRAFT after Sent starts from current stock (database behaviour, unchanged).

### VOD-3 validation evidence

```text
Unit / action / data / component (new):
  order-draft-share.test.ts        13  Copy text, export document, formula guard, XLSX round trip, request schema
  order-draft-sent.test.ts          5  summaries, paging past 1,000, clamping
  order-draft-demo-sent.test.ts    10  Mark Sent, stale, idempotent, read-only, new draft, frozen labels
  order-draft-sharing-actions.test.ts 13  Mark Sent action, Sent reads, export action (staff, tenant, rows)
  order-draft-data.test.ts          7  paged Sent read, by-id read, active read
  order-drafts-view.test.tsx       41  (+17 VOD-3: Copy, fallback, Export, Mark Sent, switch, Sent view, paging)
Full Vitest: 114 files / 1557 tests PASS (VOD-2: 109 / 1492)
npm run check (format, lint, typecheck): PASS
npm run build: PASS (Next.js 16.4.3)
Playwright, new spec tests/e2e/bar-inventory-order-drafts-sharing.spec.ts: desktop 11/11 PASS, server-mobile 11/11 PASS
Playwright, all bar-inventory specs: desktop 77/77 PASS; server-mobile 75 passed, 2 intentional skips
Playwright host-tablet (WebKit): NOT RUN — environment limitation (WebKit is not installed in the Cloud VM; CI runs the desktop project only)
  supplemental Chromium with the iPad (gen 7) landscape viewport: 19/19 PASS (VOD-3 spec + VOD-2 spec) — NOT a WebKit result
tests/real, pgTAP:   NOT RUN — no migration, and no Docker / Supabase / hosted credentials in Cloud
Hosted DEV:          untouched (VOD-4)

Exact-head GitHub CI on 054355d (run 40603971319): application success, browser-smoke success
  (runs the desktop project only), Vercel Preview Comments success. Database workflow: PATH-GATED /
  NOT REQUIRED (no supabase/** change). Local head = remote head = PR head = CI-tested SHA.
```

**Carried to VOD-4:** run the full Playwright matrix including `host-tablet` WebKit and `server-mobile` on a machine with the browsers; real RLS and Staff denial for Sent reads and the order export; two-context `PT409` for Mark Sent; real export of a Sent order with a renamed / archived product; the real-database no-inventory-mutation check; paging against a hosted history larger than one page.

## VOD-4 — hosted DEV final gate (2026-10-27) — **GO**

```text
Date / environment:        2026-10-27, local Windows PC + hosted DEV (the-lineup-dev)
Base development SHA:      6b8dcead804a3aa803b2e8e3eb1dfd2c4bf1660c
Final tested development:  f3b0e0de27b95cdb05961450554cd23a021731f6 (= base + defect fix PR #200)
Hosted DEV project:        opmujepkemwcdxxorhfd  (.env.development.local; the harness and the pinned build
                           hard-abort on any other ref; PROD ref ftadewtkjlaotfdvtjcv never targeted;
                           0 PROD-ref matches in the pinned production build's .next)
Decision:                  GO
```

**Migration parity.** Before: 49 migrations, latest `20261027130000`, no `inventory_order_draft*` objects. Applied to DEV only, via the repository's established DEV route (Management API + a `supabase_migrations.schema_migrations` row, hard-coded to the DEV ref): `20261027195142_bar_inventory_order_drafts.sql`, `20261027210000_bar_inventory_order_draft_save_order_qty_fix.sql`. After: 51 migrations, latest `20261027210000`, 6 `inventory_order_draft_*` RPCs present, no local-only or DEV-only version. PROD was not read or changed.

**Defect found and fixed (D1).** `getSentOrderDraftsPage` returned `null` for a page past the end. PostgREST answers a range that starts past the last row with `416 PGRST103 Requested range not satisfiable` and no count (observed on DEV against 1,070 Sent orders), not an empty page, so the existing clamp (written for `data: []`, tested with a fake that returned `[]`) never ran. Fix `fix/sent-history-past-end-page`, PR #200, tested head `652c7652c41ff24869e434525f21dd8209fb37f2`, exact-head CI green (application, browser-smoke, Vercel; Database path-gated), merge commit `f3b0e0de27b95cdb05961450554cd23a021731f6`. A refused range now falls back to the last page via an exact head count; an empty history is an empty first page. Failing-first unit tests (+2: 1559 total) and the hosted real test. Severity low (Sent history never shrinks; only a stale or typed page number could hit it). No other product defect was found.

**What was run, and where.**

```text
Hosted DEV, real JWTs, disposable harness org (cascade-deleted; nothing left behind):
  tests/real/bar-inventory-order-drafts.db.real.test.ts  38/38   (new; 38/38 on the first run with the fix and on 5
                                                                  consecutive runs of the final test code. Four
                                                                  earlier runs had one failure each, all in the
                                                                  suite itself and fixed: stock rows were sorted by
                                                                  product only although each product has a row per
                                                                  location (nondeterministic order, 3 runs), and one
                                                                  transient transport error on the bulk-insert
                                                                  arrangement (retry added). No product failure.)
  other Bar Inventory real DB suites (catalog 15, import 9, ledger-paging 4, stock 13)  41/41
  realtime-access 1/1 -- FAILED twice in a row immediately after the 1,050-row bulk insert/teardown, then PASSED 3 of 3
                         once DEV settled; a 6-second websocket window with three subscribers. Not touched by
                         order drafts (no draft table is published). Reported as intermittent, not as a clean pass.
Hosted DEV, DEV-pinned PRODUCTION build, real passcode sign-in (TestOwner, TestManager, TestServer1):
  tests/real/ui/bar-inventory-order-drafts.real.spec.ts  15/15 (run twice, both green; desktop Chromium only)
Demo-mode Playwright, Vendor Order Drafts specs (order-drafts + order-drafts-sharing, 20 tests per project):
  desktop 20/20 · host-tablet (WebKit 26.6, Playwright build 2359, iPad gen 7 landscape) 20/20 · server-mobile 20/20
Demo-mode Playwright, whole Bar Inventory regression (12 specs):
  desktop 78/78 · host-tablet WebKit 78/78 · server-mobile 76 passed + 2 intentional skips ("phones use cards")
pgTAP (local Supabase via scripts/ci/supabase-run.mjs): 51 migrations replay cleanly; 40 files / 1,171 assertions PASS
  (0039 order drafts 21, 0040 Order Qty save 13).
Repository gates (final-gate branch code): prettier --check . PASS · eslint --max-warnings=0 PASS · tsc PASS ·
  Vitest 114 files / 1,559 tests PASS · next build (DEV-pinned production build) PASS.
```

**Role matrix (real JWTs).** Owner (`owner`), Manager (`general_manager`) and Assistant Manager (`shift_manager`) each ran open → save → Mark Sent on their own vendor: PASS. Staff (two `server` users) and anon: every RPC refused `42501`, `inventory_order_drafts` / `_items` read as zero rows including Sent history, direct table writes refused even for managers (no grant), Suggested Order not writable through the save RPC. In the browser Owner and Manager completed the flow and Staff never see Bar Inventory.

**Isolation.** A foreign organization's owner: org-A ids refused `42501`, own-org with org-A's draft or vendor id refused `22023`, zero rows read. Org A's second location cannot save, fill, clear, sync or send a draft that belongs to the first location (`22023`); a foreign location id is refused. The real data layer returns nothing to Staff or a foreign owner.

**Draft behaviour on the real database.** Seeding (Critical/Low items of the vendor only, no-Par line has a null suggestion and a blank Order Qty); six simultaneous opens by three managers → one active DRAFT and one seeded set; a second active DRAFT by direct insert refused (`23505`); Unassigned and another tenant's vendor refused; Order Qty blank→5, 5→5 (no-op, no version bump), 5→6, 6 vs a hand-written `6.00` (no-op), blank→0, →blank, equal quantities on different lines judged per line (the VOD-1.1 defect), invalid quantities refused with the item name — each confirmed by database read and by a real browser reload; item/vendor notes (trim, inner newlines kept, whitespace/empty → null, 200/1000 accepted, 201/1001 refused); Include off keeps the line and survives reload; Clear keeps lines, snapshots and stock; Fill empty-only copies numeric suggestions and leaves the no-Par line blank, a typed quantity survives empty-only and only `replace_all` overwrites it (it also blanks a typed quantity on a line with no numeric suggestion, as the domain engine does; the UI states the count); Update suggestions re-stamps snapshots and appends new Critical/Low items without touching Order Qty, notes, Included or the vendor note, and stock changes alone never rewrite a stored suggestion.

**Concurrency.** Two managers on the same version: the second save is `PT409` kind `stale` with the current version and writer, nothing is partially applied, and re-sending only the loser's own change on the latest succeeds. Two saves launched at the same version: exactly one wins. Stale Fill, Clear and Update suggestions are `PT409`. Two real browser windows (Owner, Manager): the second save shows the conflict banner naming the writer, keeps the typed value on screen, and "Keep my edits on the latest" applies it on top. Stale Mark Sent: refused `PT409` at the RPC and in the browser ("Reload the latest version before marking it sent."); the draft stays `draft` with no sender or time.

**Mark Sent and inventory isolation.** The confirmation says outside The Lineup, read-only, does not receive inventory or change stock counts, and does not send anything. After Mark Sent: status `sent`, `sent_by`, `sent_at`, version +1, labels frozen. The full stock set for the organization (On Hand, Backup, Total, stock version, last-adjusted, updated-at per product and location), the adjustment-ledger count and highest id, the change-log count and the product rows were identical before and after, in both the database suite and the hosted browser spec. The Sent order is immutable through every RPC (`23514`) and by direct writes as the service role (update, delete, item insert all `23514`). Retry by the same or a second manager (even holding a stale version) returns `changed:false` with the first sender and version and leaves one Sent record. A new draft for the same vendor opens afterwards at version 1, from current stock, with no quantities or notes carried, an archived product excluded, and the renamed vendor name; the old Sent record is unchanged.

**Export, Copy and formula protection (hosted, real draft).** Copy (real Chromium clipboard) = header, `name size — qty (item note)`, `Notes:` block, no Suggested; CSV columns `Vendor, Item, Size, Unit, SKU, Suggested, Order Qty, Item Note` with the re-stamped suggestion or `Order needed` and only Included, Order Qty > 0 lines; XLSX has `Order` and `Summary` (Vendor, Status, Vendor Note, Planned Total …); item note `=SUM(1+1)` and vendor note `@deliver Thursday` are neutralised with a leading apostrophe in CSV and XLSX. Sent-order Copy, CSV and XLSX use the frozen labels and carry Status Sent, Sent By and Sent At. The Clipboard-denied fallback runs in the demo specs on all three projects (the browser clipboard cannot be made to refuse on hosted DEV).

**Sent history, paging, time zone, frozen labels.** Against 1,070 Sent rows in one location, through the real data layer under the manager's RLS: exact count, 20 per page, every order exactly once across all pages, strictly newest first, a page past the end clamps to the last page (the D1 fix), Staff and a foreign owner get an empty history. The hosted browser shows the Sent facts as `MMM d, yyyy, h:mm AM/PM` in the location's zone (America/Chicago) and never the UTC clock time. Renaming the product and the vendor after sending (restored afterwards) leaves the Sent list row, the Sent order, Copy, CSV and XLSX on the frozen labels; the DB suite proves the same for rename, archive and re-labelling.

**Not run / limits, stated plainly.**

- The hosted real-database browser spec ran on desktop Chromium only (`playwright.real.config.ts` has one project). Tablet (WebKit) and phone layouts were exercised in demo mode, where the components are the same but the data is in memory.
- No synthetic Assistant Manager with a passcode exists in the DEV organization, so Assistant Manager is proven with a real JWT at the RPC/RLS layer, not through the browser.
- Staff denial is proven at the RPC, RLS and navigation layers on DEV; a direct server-action call by Staff is covered by the VOD-3 action tests (mocked Supabase), not by a hosted browser call.
- DST and a UTC-midnight boundary for Sent timestamps are covered by the existing unit tests; DEV only shows America/Chicago.
- The 1,000-row cap is proven with 1,070 real rows through the real data layer; the browser pager itself was exercised with one real Sent order and by the demo/unit tests.
- No manual accessibility audit beyond the existing keyboard, focus, live-region and target-size assertions in the Playwright specs (all green on three projects).

**DEV footprint.** The hosted browser spec's Mark Sent leaves immutable history by design: two Sent orders (one per green run), tagged `VOD4-1793147896144` and `VOD4-1793150815862`, with the two vendors, four products, two categories and two subcategories they reference, in the `the-monks` DEV organization. All other tagged data was removed. The 26 pre-existing synthetic `V2 Harness` organizations were not touched. The DB suite leaves nothing (disposable organization, cascade teardown).

**Tracking.** Final-gate PR #201 (tested head `260ffe1c4760e93233fa5c45e4fb7eb6a956556a`, exact-head CI application / browser-smoke / Vercel green, local = remote = PR head = CI-tested SHA), merge commit `3f6509b770dd2a03ff73792cf179be9dc71fe982`. Issue #190 commented and closed; Project #4 card set to Done; milestone Future Product Backlog unchanged. `main` untouched, PROD untouched, no PROD migration. Tasks T-1 remains parked at `03d5d45` (no PR, not merged). `next dev` rewrote `AGENTS.md` during Playwright runs; reverted before every commit.

## Deferred to approved later phases

- VOD-3: delivered, see above (Copy Order, CSV/XLSX, Mark Sent, Sent list/detail).
- VOD-4: delivered — GO (see "VOD-4 — hosted DEV final gate").
- Still deferred (not regressions): "Add item" UI, an in-app guard for leaving Bar Inventory entirely with unsaved draft edits, Realtime for drafts, the export audit log (AC-EXP-4, owner decision).

No automatic email/SMS/WhatsApp/EDI, purchase-order workflow, receiving, invoice matching, pricing, or cost accounting was added.

## Parked Tasks work

`feature/tasks-v1-1-default-landing` remains parked at `03d5d45`, with no PR and no merge. Vendor Order Drafts reached VOD-4 GO, so a separate session may now reconcile and resume T-1; it was not touched during VOD-4.
