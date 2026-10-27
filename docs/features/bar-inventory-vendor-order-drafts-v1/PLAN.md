# Bar Inventory — Vendor Order Drafts V1 — Plan

**Status:** VOD-0 complete; VOD-1 database/domain foundation merged via PR #193 at `876be20`; VOD-1.1 corrective save fix delivered on `fix/vendor-order-draft-order-qty-save` (see Implementation Report); VOD-2 next but not started · **Issue:** #190 · **Companions:** `ACCEPTANCE_CRITERIA.md`, `TEST_MATRIX.md`, `IMPLEMENTATION_REPORT.md` · **Parent module:** Bar Inventory V1 (#168, complete — BI-0 → BI-11 merged; this is a **new enhancement**, #168 is not reopened)
**Safety:** `main` and PROD untouched. Migrations go to DEV only. One branch and one PR per phase, merge commits only. Tasks V1.1 _code_ waits for this feature.

## 1. Outcome

Bar Inventory already computes a **Suggested Order** from stock and par. The manager now needs a place to prepare the quantity they will **actually ask a vendor for**. These are two different numbers and the second never overwrites the first:

```text
Current stock 4 · Par 12 · Suggested Order 8 · Order Qty 12 · "weekend stock"
```

1. A new **Order Drafts** view inside Bar Inventory (not a new top-level module).
2. One editable **DRAFT** per vendor per location, seeded from Order Soon, with a per-line Order Qty, note and Included switch and a vendor-level note.
3. **Fill from Suggestions**, **Clear Draft**, planned-vs-suggested totals, **Copy Order**, **CSV / XLSX** export.
4. **Mark Sent** turns the draft into read-only **Sent history**. Mark Sent only records that the manager sent the order **outside** the app. It never changes inventory.

### Non-goals (V1)

Email, SMS, WhatsApp, vendor-portal APIs, EDI, purchase-order numbers, approval workflow, receiving workflow, invoice matching, payment tracking, vendor pricing, cost accounting, any automatic inventory increase, any status beyond `DRAFT` and `SENT`, redesign of the Bar Inventory History ledger, a second spreadsheet writer. These are future procurement work and are listed in §9 only so they are not forgotten.

## 2. Repository truth that shapes the plan (verified 2026-10-27)

| Fact                                                                                                                                                                                                                                                                                                                                       | Consequence                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `components/inventory-module.tsx` has `type View = "dashboard" \| "inventory" \| "manage" \| "history" \| "analytics"`. The tab strip (`VIEWS`) shows only Dashboard, Inventory, Manage; **History and Analytics are sub-views** reached from Inventory/Dashboard and highlight their parent.                                              | "Order Drafts" becomes a fourth real tab between Inventory and Manage. History/Analytics are **not** promoted to tabs (the brief's tab list is a recommendation; see D-VOD-1). |
| Dashboard → Order Soon is `components/order-soon.tsx` + `domain/order-soon.ts` (`groupByVendor` → `VendorGroup`, keyed by the vendor **name**; `InventoryRow` has `vendor` name, no vendor id).                                                                                                                                            | The CTA is added to the vendor `Group` header area. Vendor name → id goes through `snapshot.vendors` (names are unique per organization by `name_key`).                        |
| Suggested quantities come from `inventory_stock_status` (SQL view) and are mirrored in `domain/stock-rules.ts`; no Par ⇒ `orderNeeded: true`, `suggestedOrder: null` ("Order needed").                                                                                                                                                     | The draft snapshot stores a number **or** "no numeric suggestion". It never invents one. The SQL view is the server source of the snapshot.                                    |
| Exports: `lib/export/document.ts` (`ExportDocument` = one CSV sheet + XLSX sheets, `sheetToCsv`, `neutralizeText`, `exportFilename`), `domain/exports.ts` (`ExportRequest` union, `prepareExport`), server action `exportDataAction` (zod-validated request, `resolveManager`, rows loaded from the database, client never supplies rows). | One new `ExportRequest` kind. No new writer, no new action family. Formula-injection protection is inherited from `neutralizeText`.                                            |
| Writes are RPC-only: `private.inventory_begin(org, loc)` (live session + management role + location seam), `SECURITY DEFINER`, `set search_path = ''`, actor = `auth.uid()`; tables are RLS-on with **SELECT-only** grants to `authenticated`.                                                                                             | The new tables and RPCs copy this exactly. No client INSERT/UPDATE/DELETE grants.                                                                                              |
| Optimistic concurrency: a `version int` column, `PT409` with `detail = {kind:'stale', entity, id, current_version, …}`; `domain/db-error.ts` allow-lists authored codes (`22023, 23505, 23514, 42501, PT409`); the controller refreshes on a stale conflict.                                                                               | Draft-level `version`, same error shape, same client handling.                                                                                                                 |
| Ledger immutability is a `before update or delete` trigger raising `23514` (cascade allowed only at trigger depth > 1 for tenant teardown).                                                                                                                                                                                                | Sent drafts and their lines get the same protection.                                                                                                                           |
| BI-11 found History/exports silently capped at the 1,000-row API limit.                                                                                                                                                                                                                                                                    | Every new list read pages explicitly or flags truncation. No silent cap.                                                                                                       |
| Demo mode: `DemoCatalogBinding` holds an in-memory `CatalogState`; each view has a demo path using the same pure domain functions.                                                                                                                                                                                                         | Drafts get a pure engine (`domain/order-draft.ts`) used by demo mode and unit tests; SQL is checked by pgTAP and shared vectors where numbers matter.                          |
| The last migration is `20261027130000_bar_inventory_realtime.sql`; actor foreign keys were made deferrable in `…190000/190100` for tenant teardown.                                                                                                                                                                                        | New tables follow the deferrable-actor-FK pattern from the start.                                                                                                              |

## 3. Decisions

**Locked by the owner (brief of 2026-10-27, not reopened):** new internal tab inside Bar Inventory · Dashboard stays the alert surface, not the editor · one active DRAFT per organization + location + vendor (Dashboard opens the existing one, never duplicates) · statuses `DRAFT` and `SENT` only · Mark Sent never touches On Hand / Backup / Total · Suggested Order is read-only and never overwritten by Order Qty · no invented quantity for "Order needed" rows · management roles only · explicit stale-write protection · Copy Order from Included lines with a valid quantity · CSV and XLSX through the existing export infrastructure · Sent drafts read-only and meaningful after catalog changes.

**Planner decisions made inside that frame (owner veto welcome; none blocks VOD-1):**

- **D-VOD-1 Navigation.** Tabs become Dashboard · Inventory · **Order Drafts** · Manage. History and Analytics stay where they are (sub-views). Reason: the repository has no History/Analytics tabs and BI-11 left a backlog item for proper ARIA tabs; redesigning navigation is out of scope.
- **D-VOD-2 Schema (smallest that works).** Two tables, `inventory_order_drafts` and `inventory_order_draft_items` (module prefix per convention). No change-log extension: the draft rows carry their own actors and timestamps (`created_by`, `updated_by`, `sent_by`) and a `version`, and Sent rows are immutable.
- **D-VOD-3 Snapshot model.** A line stores the system's recommendation **when the line was prepared**: `suggested_qty` (number, or null = "Order needed"/none), plus `total_at_snapshot`, `par_at_snapshot`, `status_at_snapshot` for context. It also stores display labels (`vendor_name` on the draft; `product_name`, `size`, `unit`, `sku` on the line). While a draft is DRAFT, screens show live catalog labels; **Mark Sent re-stamps the labels once and freezes everything**, so a Sent order is understandable after any later rename, archive or par change. The quantity snapshot is never rewritten by inventory changes.
- **D-VOD-4 Seeding and updating suggestions.** Creating a draft seeds one line per Critical/Low item of that vendor from the SQL view (the same set Order Soon shows). **Update suggestions** (one explicit action on a DRAFT, one RPC) re-stamps the snapshots of existing lines and appends lines for items that became Critical/Low since; it never touches Order Qty, notes or Included. A manager can also **add an item** of that vendor that is not currently low (a promo, a weekend stock-up); it is created with the current snapshot (null suggestion if not computable). There is no "delete line": a line the manager does not want is switched off with **Included** (it stays visible, omitted from Copy/Export).
- **D-VOD-5 Quantities.** `order_qty numeric(12,2) null, check (order_qty >= 0)`, same precision as stock. Blank means "not decided". `0` is stored as `0` but, like blank, is **not** written into Copy/Export (an order line needs a quantity greater than zero). Item note ≤ 200 characters, vendor note ≤ 1,000, both plain text, trimmed, empty → null.
- **D-VOD-6 Fill from Suggestions.** Server-side, one RPC, two modes: **fill empty only** (default) and **replace all** (only after an explicit confirmation naming how many typed quantities will be replaced). Uses each line's stored suggestion snapshot; lines with no numeric suggestion stay blank. The UI offers **Update suggestions** first if the snapshots are older than the current stock (a plain hint, not a blocker).
- **D-VOD-7 Clear Draft.** Confirmed action on a DRAFT: sets every Order Qty and item note to null, Included back to true, vendor note to null. Lines, snapshots and the draft itself remain. Never touches inventory and never applies to a Sent draft. There is no hard delete of a Sent draft anywhere in V1.
- **D-VOD-8 Mark Sent.** Requires at least one Included line with Order Qty > 0 (otherwise "Add a quantity before marking this order sent"). Sets `status = 'sent'`, `sent_by`, `sent_at`, re-stamps labels, bumps `version`. **Idempotent and retry-safe:** a second call on an already-Sent draft returns the existing sent facts ("Already marked sent by Mia at …") and changes nothing. A stale call on a still-DRAFT draft (another manager edited it) is refused with `PT409`, so nobody sends an order they have not seen. A new draft for the same vendor can be created immediately afterwards.
- **D-VOD-9 Unassigned and inactive vendors.** The system "Unassigned" vendor cannot have a draft (you cannot send an order to "Unassigned"); its Order Soon group shows "Assign a vendor in Manage to draft an order" instead of the button. Inactive vendors cannot get a new draft. A draft that already exists for a vendor that is deactivated later stays editable and sendable.
- **D-VOD-10 Totals.** _Suggested total_ = sum of numeric suggestion snapshots over all lines (matches the Dashboard group). _Planned order total_ = sum of Order Qty over **Included** lines with Order Qty > 0. Lines with no numeric suggestion are reported separately ("+ 3 order needed"); an included line with no quantity is reported as "N included lines have no quantity (left out of the order)". Totals are **ordering units, never dollars** (no pricing exists) and sum mixed units exactly as Order Soon already does. Arithmetic uses the existing cents helpers (`toCents` / `fromCents`).
- **D-VOD-11 Copy Order text.** Plain text from **Included** lines with Order Qty > 0, sorted by name then size, using live labels (DRAFT) or frozen labels (SENT):

  ```text
  Republic National — Order Request

  Bacardi 750ml — 6
  Modelo Case — 3 (Promo next week)
  Tito's 1L — 12

  Notes:
  Deliver Thursday morning.
  Please substitute 750ml only if 1L is unavailable.
  ```

  The item note is appended in parentheses; the `Notes:` block appears only if the vendor note is not empty; quantities use the existing `formatQuantity`. Item notes are collapsed to one line. Copy uses the Clipboard API with a visible fallback (select-all text area) and an announced "Order copied".

- **D-VOD-12 Export.** New `ExportRequest` kind `order_draft` carrying only `{ draftId }` (+ format). The server action loads the draft and its lines through the caller's own access and builds the file; the client never supplies rows. CSV = one flat sheet; XLSX = **Order** sheet plus **Summary** sheet (vendor, status, sent by/at, vendor note, totals). Columns: Vendor, Item, Size, Unit, SKU, Suggested, Order Qty, Item Note. Only Included lines with Order Qty > 0, same rule as Copy. "Suggested" shows the snapshot number or `Order needed`. Copy is the vendor-facing text; the file is the manager's record. The export-audit-log decision pending from BI-11 (AC-EXP-4) applies equally here and is **not** decided by this feature.
- **D-VOD-13 Concurrency.** One `version` on the draft header. Every mutation (save, fill, clear, update suggestions, mark sent) takes `p_expected_version`, increments it, and on mismatch raises `PT409` with `{kind:'stale', entity:'order_draft', id, current_version, updated_by, updated_at}`. Line edits are sent **sparse** (only changed lines and the vendor note) in a single `save`, so "apply my edits on top of theirs" after a conflict is a deliberate, field-level re-send and never a silent overwrite. A stale reply where the other writer is the caller (second tab, retry) reloads quietly. No Realtime in V1 (the focus re-read plus the version check is the precedent for catalog edits); this is a backlog item, not a gap.
- **D-VOD-14 Sent history.** Order Drafts has a **Drafts | Sent** switch. Sent list: vendor, sent date (location time zone), sent by, line count, planned total, newest first, loaded in explicit pages (no silent 1,000-row cap). A Sent order opens read-only: per line the frozen label, **Suggested (at draft)** next to **Ordered**, the item note, and the vendor note; Copy and Export remain available. This is separate from the immutable stock ledger/History, which is untouched.
- **D-VOD-15 Demo mode.** Demo keeps drafts in the in-memory catalog state, using the same pure engine as unit tests. It has no server and no database.

## 4. Data model (conceptual; names and exact types are finalised in VOD-1)

`inventory_order_drafts` — `id uuid pk` · `organization_id` · `location_id` (composite FK to `locations (id, organization_id)`) · `vendor_id` (composite FK to `inventory_vendors (id, organization_id)`, `on delete restrict`) · `status` (`draft` \| `sent`) · `vendor_note text null` · `vendor_name text not null` (label snapshot, re-stamped at send) · `version int not null default 1` · `created_by`, `created_at`, `updated_by`, `updated_at` · `sent_by null`, `sent_at null` (both set iff `status = 'sent'`, check constraint) · deferrable actor FKs as in the BI-1/BI-2 follow-up migrations.
**Invariant:** `unique (organization_id, location_id, vendor_id) where status = 'draft'` — one active draft; `open` is `insert … on conflict do nothing` then select, so two managers racing both get the same draft.

`inventory_order_draft_items` — `id uuid pk` · `draft_id` · `organization_id` · `location_id` (denormalised for RLS, tied to the draft by a composite FK) · `product_id` (composite FK to `inventory_products (id, organization_id)`, restrict) · `included boolean not null default true` · `order_qty numeric(12,2) null check (>= 0)` · `item_note text null` · `suggested_qty numeric(12,2) null` · `total_at_snapshot`, `par_at_snapshot`, `status_at_snapshot` · `product_name`, `size`, `unit`, `sku` (label snapshots) · `unique (draft_id, product_id)`.

Immutability: `before update or delete` triggers on both tables raise `23514` once the parent draft is `sent` (the one allowed transition is the `draft → sent` update made by `mark_sent` itself); cascade delete only at trigger depth > 1 for tenant teardown (the ledger pattern). `before truncate` likewise.

RLS (both tables): enabled; `revoke all … from public, anon, authenticated; grant select … to authenticated`; policy `private.inventory_is_manager(organization_id) and private.inventory_can_access_location(organization_id, location_id)` with `(select auth.uid())` wrapping as elsewhere. No write policies.

RPCs (`security definer`, `set search_path = ''`, each starts with `private.inventory_begin`; actor is `auth.uid()` and is never a parameter; all take `p_organization_id, p_location_id`):

| RPC                                                                       | Purpose                                                                                                                                                                                       |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inventory_order_draft_open(vendor)`                                      | Return the active draft for the vendor or create and seed it; idempotent and race-safe. Refuses the system vendor and inactive vendors.                                                       |
| `inventory_order_draft_save(draft, expected_version, vendor_note, lines)` | Sparse update of vendor note and lines (`order_qty`, `item_note`, `included`); may add a line for an active product of the same vendor. Validates vendor/org match. No-op if nothing changed. |
| `inventory_order_draft_fill(draft, expected_version, mode)`               | `empty_only` \| `replace_all` from the stored suggestion snapshots.                                                                                                                           |
| `inventory_order_draft_clear(draft, expected_version)`                    | Reset quantities, notes, included, vendor note.                                                                                                                                               |
| `inventory_order_draft_sync(draft, expected_version)`                     | Re-stamp snapshots, append newly needed lines; never touches Order Qty / notes / Included.                                                                                                    |
| `inventory_order_draft_mark_sent(draft, expected_version)`                | Validate, freeze labels, set sent facts; idempotent for an already-Sent draft.                                                                                                                |

All six are DRAFT-only except `mark_sent`'s idempotent echo. **None of them reference `inventory_stock`, `inventory_stock_adjust` or `inventory_adjustments`**; a pgTAP check asserts this against the function bodies, and a behavioural test asserts stock rows, versions and ledger count are identical before and after Mark Sent.

Reads: the client reads through a server action (`getOrderDraftsAction`) under the caller's RLS-checked access, drafts and items fetched in explicit pages; there is no read RPC. `loadedAt` and per-draft `version` travel with the data.

## 5. Application structure

```text
src/features/bar-inventory/
  domain/order-draft.ts            pure: types, totals, fill, clear, copy text, validation, sort
  domain/order-draft-export.ts     pure: ExportDocument for one draft
  domain/order-draft.test.ts, order-draft-export.test.ts
  data/order-draft-data.ts         server reads (paged), mapping rows -> view types
  actions/order-draft-actions.ts   server actions: list / open / save / fill / clear / sync / markSent
  components/order-drafts-view.tsx       Drafts | Sent switch, vendor draft list, New draft
  components/order-draft-editor.tsx      header, vendor note, table (FilterableTable), totals, actions
  components/order-draft-sent.tsx        read-only Sent list + detail
  components/order-soon.tsx              + Create / Open Order Draft CTA (Dashboard)
  components/inventory-module.tsx        + tab, + view, + controller wiring (one stable identity, as loadHistory)
  domain/exports.ts, actions/inventory-actions.ts   + `order_draft` export kind
supabase/migrations/2026102…_bar_inventory_order_drafts.sql
supabase/tests/database/0039_bar_inventory_order_drafts.test.sql
```

Reuse, do not duplicate: `FilterableTable` + `table-filters.ts` (every list), `ExportControl`/`RunExport`, `ExportDocument`, `formatQuantity`, `StatusBadge`, the dialog/confirm primitives used by Manage, `describeDbError`/stale handling, `requireLiveSession` + `resolveManager` + `getPrimaryLocation` in actions. No parallel UI framework, no new state library, no `alert()`/`confirm()`.

## 6. UI states and accessibility

- **Order Drafts tab:** empty ("No order drafts. Open Dashboard → Order soon, or start one below."), loading skeleton (existing `TableSkeleton`), load error with Try again, last-known data kept when a background refresh fails.
- **Draft editor:** table columns Item (name, size, status badge) · Suggested · Order Qty (numeric input, `inputmode="decimal"`, label "Order quantity for {item}") · Item note · Included (checkbox/switch, labelled). Dirty state shown as an unsaved-changes bar with **Save** and **Discard**; leaving with unsaved edits asks first (in-app dialog). Totals bar: "Suggested total N + M order needed · Planned order total N · K included lines without a quantity".
- **Phone (390 px):** the kit's card layout; Order Qty and Included reachable without horizontal scroll; primary actions in a wrapping toolbar; targets ≥ 44 px. Host-tablet: same table, no hover-only controls.
- **Dialogs:** Fill (empty-only default; replace-all behind a count-bearing confirmation), Clear (destructive styling, names what is lost), Mark Sent (states plainly: _recorded as sent outside The Lineup; your inventory does not change; the order can no longer be edited_). Focus returns to the invoking control; Escape cancels.
- **Stale conflict:** an inline alert ("Mia changed this draft at 3:10 PM") with **Load their version** and **Apply my edits on top**; never silent.
- **Sent:** read-only table; no inputs rendered (not just disabled); badge "Sent" with date and sender; Copy/Export available.
- Status is never colour-only; announcements use `role="status"` for copy/save and `role="alert"` for failures. Light and dark use existing tokens.

## 7. Phases (one branch, one PR, merge commit each; STOP and update `tasks/current-task.md` after each)

| Phase | Branch (from latest `development`)                  | Scope                                                                                                                                                                                       | Migration |
| ----- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| VOD-0 | `docs/bar-inventory-vendor-order-drafts-v1-plan`    | This plan, acceptance criteria, test matrix, issue + Project #4, roadmap/status/backlog, handoff                                                                                            | no        |
| VOD-1 | `feature/bar-order-drafts-v1-foundation`            | Tables, RLS, grants, triggers, six RPCs, one-active invariant, immutability; pure `order-draft.ts` domain core + vectors; pgTAP; **no UI** beyond what proves the contract                  | yes (DEV) |
| VOD-2 | `feature/bar-order-drafts-v1-ui`                    | Order Drafts tab, Drafts/Sent switch (Sent list may be empty until VOD-3), editor, Fill, Clear, Update suggestions, totals, Dashboard CTA, server actions, demo engine wiring, e2e          | no        |
| VOD-3 | `feature/bar-order-drafts-v1-sharing-history`       | Copy Order, `order_draft` CSV/XLSX export, Mark Sent flow, read-only Sent history and detail, sent metadata                                                                                 | no        |
| VOD-4 | `docs/…` or `fix/…` only if a defect needs a change | Hosted DEV validation (roles, concurrency, Fill, Dashboard CTA, Copy, CSV, XLSX, Mark Sent, Sent history, no inventory mutation; desktop/tablet/phone), tracking reconciliation, final gate | no        |

Order inside VOD-1: migration → pgTAP red → pure domain core + vectors → server data/actions only as far as the pgTAP and a thin hosted test need. Each phase ends with targeted tests, the phase regression, exact-head CI (local head = PR head = CI-tested SHA), a merge commit and a handoff update. DB CI runs only when `supabase/**` changes (VOD-1); a docs/UI-only PR without the database workflow is correct, not a gap.

## 8. Rollout, migration, rollback

- One additive migration (two tables, triggers, six functions, policies). DEV only; PROD is a separate owner-approved release task.
- Rollback: drop the six functions, then the two tables (no other object references them; nothing changes `inventory_stock`). The Order Drafts tab and the Dashboard CTA are additive and hidden behind the module's existing management-only gate.
- No data backfill. Existing Bar Inventory behaviour, exports, import and History are unchanged.

## 9. Risks and mitigations

| Risk                                                       | Mitigation                                                                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Mark Sent mistaken for a stock change                      | Dialog copy; no stock reference in any draft RPC; body-scan pgTAP; before/after stock+ledger equality test.        |
| Two managers overwrite each other                          | Draft `version`, `PT409`, sparse line saves, deliberate re-apply; pgTAP and two-context Playwright test.           |
| Duplicate active drafts (double click, two devices, retry) | Partial unique index + `on conflict` open; concurrent-open pgTAP; Dashboard always "open existing".                |
| Draft goes stale while it sits for days                    | Snapshots are labelled "at draft"; **Update suggestions**; Fill hints when snapshots are older than current stock. |
| Sent order unreadable after catalog edits                  | Frozen label and suggestion snapshots; test renames/archives a product after send.                                 |
| Silent row cap on lists/exports (BI-11 lesson)             | Explicit paging; truncation flag; test past 1,000 lines for a vendor in hosted DEV.                                |
| Spreadsheet formula injection from vendor/item notes       | Reuse `neutralizeText` through `ExportDocument`; tests with `=`, `+`, `-`, `@`, tab and CR prefixes in notes.      |
| Client supplies rows to export                             | Request carries only `draftId`; server loads under RLS; test with another org's/location's id.                     |
| Mixed units make totals look like money                    | Labelled "units"; no currency anywhere; documented in AC and UI copy.                                              |

## 10. Unresolved

None blocking. For the owner when convenient: confirm D-VOD-9 (no draft for the system "Unassigned" vendor), D-VOD-12 (export includes the Suggested column), and whether Realtime for drafts is wanted later. Future procurement work (not V1): vendor email/SMS/portal/EDI, PO numbers, approval, receiving (which would call the existing audited delivery/restock path), invoices, pricing and cost accounting, draft deletion/cancellation, recurring or templated orders.
