# Bar Inventory — Vendor Order Drafts V1 — Implementation report

## Phase status

VOD-0 planning is complete. VOD-1 database and pure-domain foundation is complete and merged to `development` via PR #193 at merge commit `876be20cf691022093d838dcca8330bbbf03e584`. VOD-2 is complete and merged to `development` via PR #196 at merge commit `292ca1a12ad136ff25d7af57537533fbc3c61209` (see "VOD-2 UI delivered"); VOD-3 and VOD-4 are not started.

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

## Deferred to approved later phases

- VOD-3: Copy Order, CSV/XLSX, Mark Sent confirmation UI, Sent list/detail.
- VOD-4: hosted DEV and responsive/role/concurrency final gate.

No automatic email/SMS/WhatsApp/EDI, purchase-order workflow, receiving, invoice matching, pricing, or cost accounting was added.

## Parked Tasks work

`feature/tasks-v1-1-default-landing` remains parked at `03d5d45`, with no PR and no merge. It must not resume until Vendor Order Drafts reaches VOD-4.
