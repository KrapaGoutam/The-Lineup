# Bar Inventory V1.1 — approved implementation contract

Status: BI-E1 through BI-E5 complete on development; DEV only, not released to Production.

Preflight completed after the owner supplied the local Lineup-token mapping.
Live DEV identity and initial 56/56 migration parity were independently verified.
BI-E1–E5 are implemented and validated; PR #226 merged with a merge commit after
exact-head CI passed. Final integration evidence is recorded in
[V1_1_VALIDATION.md](V1_1_VALIDATION.md).

## Outcome and scope

Management can count selected products in-app, save personal Inventory views,
arrange columns and track multiple manufacture/expiration groups per product.
Stock status, Order Soon and movement analytics retain their V1 meanings.
No Staff access, FIFO, Tasks/notifications, POS, Recipes changes or Production.

## Implementation decisions

- Add `inventory_date_lots` scoped by organization/location/product. Optional
  nonnegative quantity; at least one date; explicit day/month precision; archive
  rather than delete. Stock stays authoritative; date coverage is informational.
- Add location-scoped `inventory_freshness_rules`, unique per subcategory.
  Tracking enabled, maximum months, warning-before months, active state, version.
  Category context comes from the subcategory; no universal beer default.
- Reuse `inventory_change_log` for date/rule changes with actor and old/new
  values. Stock adjustments continue exclusively in the immutable ledger.
- Add `inventory_bulk_count`: manager preamble, bounded batch, duplicate-ID
  refusal, deterministic stock locks, strict expected-version checks before
  changes and existing stock-adjust calls within one database transaction.
  Blank is unchanged; explicit zero is zero; no unchanged ledger entries.
- Add personal server-persisted `inventory_saved_views`, organization/profile/
  location/table scoped, unique normalized names and one default. Mutations
  derive profile from auth; SELECT-only client grants and own-profile RLS.
- Extend FilterableTable. Lock product identity and retain actions outside
  customizable columns. Column order/visibility cache is scoped by restaurant,
  profile and table. Saved views explicitly own chosen portions of state.
- Explicit URL Inventory state, including Dashboard drill-down, precedes a
  default saved view. Partial views preserve state they do not own.
- Phone cards remain deliberate; reorder controls work without drag. Reuse
  existing focus-managed dialog/sheet primitives, labels and visible focus.
- Calendar dates avoid instant/UTC rollovers. YY means 2000–2099. Month
  manufacture anchors at day 1; expiration at month end. Display retains
  precision. Freshness uses calendar-month addition with end clamping.
- Expiration severity: past, today, 1–7, 8–15, 16–30, over 30 days. Summaries
  use nearest expiration and oldest manufacture. Archived groups/products do
  not alert. Dashboard counts distinct products, labels overlapping windows.
- Extend existing Realtime invalidation/refetch for date/rule changes. Batched
  reads avoid per-product requests; no state synchronization from payloads.
- Preserve CSV/XLSX import identity and blank semantics. Multi-date import is
  future scope; date exports must preserve existing inventory round trips.

## UX and authorization

Inventory selection supports individual/all filtered active rows, clear and
count. Bulk Edit opens counts, then review, then confirm. Conflicts show reviewed
and canonical latest counts with available actor/time and require re-review.
Manage offers Freshness Rules. Product date detail supports multiple groups,
add/edit/archive and nonblocking coverage. Loading, empty, errors, success,
permission denial, keyboard use and touch/mobile containment are required.
Every RPC validates management membership, organization/location and entity
ownership; no client actor or direct writes. Forward migrations only.

## Gates and rollout

BI-E1: date boundaries and real database RLS/RPC tests. BI-E2: atomicity, stale
conflicts and ledger. BI-E3: saved-view lifecycle/isolation/fallback and accessible
columns. BI-E4: Inventory/date/rule/Dashboard flows and responsive checks. BI-E5:
full unit/check/build, inventory pgTAP/real JWT, Chromium/WebKit/mobile, DEV-pinned
and explicit-empty builds, secret/PROD/path scans, migration parity, hosted
synthetic validation and independently verified zero residue.

One feature branch; green reviewable commits; PR to development; exact-head CI;
merge commit. Main/Production untouched. Rollback the application while retaining
additive data; never remove ledger or audit evidence.
