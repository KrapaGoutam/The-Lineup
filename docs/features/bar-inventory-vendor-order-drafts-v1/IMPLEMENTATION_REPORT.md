# Bar Inventory — Vendor Order Drafts V1 — Implementation report

## Phase status

VOD-0 planning is complete. VOD-1 database and pure-domain foundation is complete and merged to `development` via PR #193 at merge commit `876be20cf691022093d838dcca8330bbbf03e584`. VOD-2, VOD-3, and VOD-4 are not started.

Issue: #190. Feature branch: `feature/bar-order-drafts-v1-foundation`. Exact tested head: `dbf608ecfb25133f65c4cc57e2594d482e70ceb8`. Integration target: `development`. `main` and PROD are untouched.

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

## Deferred to approved later phases

- VOD-2: Order Drafts tab, editor, Dashboard CTA, server reads/actions, demo wiring, conflict UI.
- VOD-3: Copy Order, CSV/XLSX, Mark Sent confirmation UI, Sent list/detail.
- VOD-4: hosted DEV and responsive/role/concurrency final gate.

No automatic email/SMS/WhatsApp/EDI, purchase-order workflow, receiving, invoice matching, pricing, or cost accounting was added.

## Parked Tasks work

`feature/tasks-v1-1-default-landing` remains parked at `03d5d45`, with no PR and no merge. It must not resume until Vendor Order Drafts reaches VOD-4.
