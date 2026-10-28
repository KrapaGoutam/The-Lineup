# Bar Inventory V1 — Data model (proposal)

Status: **decisions D1–D8 locked in BI-0; schema is created from BI-1 onward.** It follows the repository conventions found in the audit (Tasks V1 foundation migration): plural snake_case tables with a module prefix; `organization_id` (+ `location_id`) on every row with tenant-safe composite foreign keys; append-only event tables; RLS enabled with **SELECT-only grants** to `authenticated`; every write through `SECURITY DEFINER` RPCs with `set search_path = ''`; actor always `auth.uid()`, never a parameter; plain-language error messages with `42501` (permission) / `22023` (validation) / `PT409` (concurrency conflict).

## 1. Scope boundary (organization vs location)

| Level            | Entities                                                                       | Why                                                                                                |
| ---------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| **Organization** | vendors, categories, subcategories, **products** (the catalog)                 | A vendor, a category list and "Tito's 750 mL" mean the same thing at every location                |
| **Location**     | **stock** (on hand, backup, cutoff, warning, par), adjustments, import batches | Quantities and thresholds differ per bar. Tomorrow's second location adds stock rows, not products |

V1 ships one location (`getPrimaryLocation`), but every RPC takes `p_location_id` and every location-bound row carries `location_id`, exactly as Tasks does, so the future change touches only the access seam (`private.inventory_can_access_location`) and the client's primary-location helper. (Owner decision D5, locked.)

Import identity (owner brief: _location + vendor + name + size + unit_) is satisfied: the **catalog key** is `(organization, vendor, name, size, unit)`; the stock row it points at is `(product, location)`. An import for a location creates a missing stock row for an existing catalog product, or creates the product and its stock row.

## 2. Tables

### `inventory_vendors`

`id uuid pk`, `organization_id`, `name text` (1–120), `name_key text` (normalized, see §4), `is_system boolean` (the seeded "Unassigned"), `active boolean`, `notes text null`, `created_by`, `created_at`, `updated_at`, `version int`.
Unique `(organization_id, name_key)`; `unique (id, organization_id)`. Never hard-deleted once referenced (FK `on delete restrict`); deactivate/reactivate via RPC.

### `inventory_categories` / `inventory_subcategories`

Own tables (not free text) so names are renamable without rewriting rows, filters are multi-selects over a controlled set, and archive is possible.
Categories: `id, organization_id, name, name_key, active, sort_order, …`; unique `(organization_id, name_key)`.
Subcategories: `id, organization_id, category_id, name, name_key, active, …`; unique `(category_id, name_key)`. A subcategory **must** have a parent category (a subcategory with no category is not meaningful); products may have neither, a category only, or both.

### `inventory_products`

`id uuid pk`, `organization_id`, `vendor_id` (not null, restrict), `name`, `name_key`, `category_id null`, `subcategory_id null`, `size text null`, `size_key text`, `unit_type text not null` (check: `bottle|can|pack|case|keg|other`, D8), `unit_label text null` (required iff `other`, ≤ 40 chars; null otherwise), `unit_key text` (= type, or `other:<nameKey(label)>`), `sku text null`, `sku_key text null`, `notes text null`, `active boolean`, `archived_at`, `created_by`, `created_at`, `updated_at`, `version int`.

- Composite FK `(category_id, subcategory_id)` → subcategories(category_id, id) guarantees the subcategory belongs to the product's category.
- **Identity** unique index: `(organization_id, vendor_id, name_key, size_key, unit_key)` **where active** (an archived product does not block re-creating the same product; reactivation checks the key first).
- **SKU** unique `(organization_id, sku_key) where sku_key is not null and active` — a stronger match key for import.
- Tito's 750 mL and Tito's 1.75 L differ in `size_key`, so they are separate products.

### `inventory_stock`

PK `(product_id, location_id)`; `organization_id`; `on_hand numeric(12,2) not null default 0 check ≥ 0`; `backup numeric(12,2) not null default 0 check ≥ 0`; **`total numeric(13,2) generated always as (on_hand + backup) stored`** (permitted "generated" value — avoids drift and lets the database sort/filter/aggregate without recomputation); `cutoff numeric(12,2) null`; `warning numeric(12,2) null`; `par numeric(12,2) null`; checks `warning ≥ cutoff` when both set, `par ≥ 0`; `version int not null default 1` (optimistic concurrency); `updated_at`, `updated_by`; `last_adjusted_at`.

- Status is **not stored** and the **warning fallback is never normalized onto the row** (decided in BI-0): the `warning` column holds only an explicit entry; `effective_warning` is computed at read time. A security-invoker view `inventory_stock_status` computes `effective_warning`, `status` and `suggested_order_qty` from the §5 rules in `PRD.md`, so SQL consumers (export, Order Soon, counts) and the TypeScript mirror are checked against the same test vectors (`TEST_STRATEGY.md` §3).
- Index for the Dashboard: `(location_id, organization_id)` plus a partial index on `(location_id, total)` for non-archived rows.

### `inventory_adjustments` (append-only quantity ledger)

`id bigint identity pk`, `organization_id`, `location_id`, `product_id`, `import_batch_id null`, `source` enum (`manual_edit`, `bulk_import`, `delivery`, `count`, `receiving` (reserved), `system`), `reason` enum (`stock_count`, `delivery_restock`, `usage`, `breakage`, `comp`, `transfer_in`, `transfer_out`, `correction`, `other`), `note text null (≤ 500)`, `prev_on_hand`, `new_on_hand`, `prev_backup`, `new_backup`, `delta_on_hand` and `delta_backup` (generated), `delta_total` (generated), `cutoff_at_time numeric null`, `status_after` enum (`critical`, `low`, `healthy`, `no_cutoff`), `actor_profile_id` (composite FK to memberships), `created_at timestamptz`, `stock_version_after int`.

- **Immutable**: `before update or delete` trigger raises `23514` (cascade delete allowed only at trigger depth > 1 for tenant teardown), `before truncate` trigger likewise — copied from `task_events`.
- Written only by `private.inventory_record_adjustment`, which reads the **locked** stock row, so `prev_*` always equal what the row really held — a client cannot forge a previous value.
- Indexes: `(location_id, product_id, id desc)` for item history; `(location_id, created_at)` for analytics; `(import_batch_id)`.

### `inventory_change_log` (append-only, non-quantity audit)

`id`, `organization_id`, `location_id null`, `entity_type` (`vendor`, `category`, `subcategory`, `product`, `stock_levels`, `export`), `entity_id uuid`, `action` (`create`, `update`, `archive`, `reactivate`, `rename`, `merge`, `export`), `diff jsonb` (`{field: [old, new]}`), `actor_profile_id`, `created_at`. Covers cutoff / warning / par edits, vendor renames, archive actions and (lightweight) exports — "all mutations record the actor".

### `inventory_import_batches` and `inventory_import_rows`

Batches: `id uuid`, `organization_id`, `location_id`, `filename`, `format` (`csv`/`xlsx`), `sheet_name null`, `status` (`staged` → `committed` | `cancelled` | `failed`), counts (`row_count, created_products, updated_products, skipped_rows, error_rows, created_vendors, created_categories, created_subcategories`), `reason` (batch-level adjustment reason, default `stock_count`), `actor_profile_id`, `created_at`, `committed_at`, `summary jsonb`.
Rows: `batch_id`, `row_number`, `action` (`create`, `update`, `skip`, `error`), `raw jsonb` (the cell values as read), `resolved jsonb` (matched ids, canonical values, planned diff), `errors jsonb`, `matched_product_id null`, `expected_stock_version int null`.
Staging the plan server-side (not trusting the browser to resend it) means **Confirm** commits exactly what the manager reviewed, and `expected_stock_version` detects stock that changed after the preview. The uploaded file itself is **not** kept (raw cell values are; no file storage in V1). Staged batches expire after 24 h (cleanup sweep, same pattern as the Tasks sweeps).

## 3. Writes: RPC surface (names follow `task_*` / `board_*`: `inventory_*`)

| RPC                                                | Purpose                                                                                                                                                                                                                                             |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inventory_vendor_create / _update / _set_active`  | add, rename (re-keys; refuses collisions), deactivate / reactivate; never delete                                                                                                                                                                    |
| `inventory_category_*`, `inventory_subcategory_*`  | same shape                                                                                                                                                                                                                                          |
| `inventory_product_create / _update / _set_active` | catalog edits; creates the stock row for the location; refuses identity/SKU collisions                                                                                                                                                              |
| `inventory_stock_adjust`                           | **the only way quantities change.** Modes: `set` (needs `p_expected_version`; for counts/inline edit) and `delta` (commutative; for deliveries/usage; no version needed). Locks the row, writes stock + ledger + status snapshot in one transaction |
| `inventory_stock_set_levels`                       | cutoff / warning / par (versioned) + change-log entry                                                                                                                                                                                               |
| `inventory_import_stage`                           | validates parsed rows, resolves entities, stores the plan; no stock mutation                                                                                                                                                                        |
| `inventory_import_commit`                          | applies a staged batch atomically (below)                                                                                                                                                                                                           |
| `inventory_import_cancel`                          | discards a staged batch                                                                                                                                                                                                                             |

All take `p_organization_id`, `p_location_id`; all start with `private.inventory_begin(org, loc)` (auth.uid() present, active membership, **management role**, location accessible), mirroring `private.tasks_begin`.

## 4. Normalization keys (one SQL function, one TS mirror, shared vectors)

`name_key` / vendor key: lowercase, Unicode-normalize, strip everything except letters and digits ("Del Papa", "DelPapa", "del papa", "DEL PAPA" → `delpapa`; "Tito's" → `titos`). `size_key`: lowercase, remove spaces, unify decimal text ("750 mL" / "750ml" / "750 ML" → `750ml`; "1.75 L" → `1.75l`). **No unit conversion** in V1 (`1l` ≠ `1000ml`; documented). The display value is the first-entered, trimmed text. Keys are computed in the database (generated or trigger-set), never trusted from the client.

## 5. Concurrency design

| Case                                               | Mechanism                                                                                                                                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two managers inline-edit the same count            | `set` adjust carries `expected_version`; mismatch → `PT409` `kind: 'stale'` with current values and who/when; UI shows "Changed by Mia to 5 — apply yours (6) anyway / keep theirs". Never a silent last-write-wins |
| Two managers log deliveries at once                | `delta` mode is commutative: both apply under the row lock, in either order                                                                                                                                         |
| Import commit vs. a manual edit made after preview | per-row `expected_stock_version`; changed rows become `conflict` (not applied), the rest commit on request                                                                                                          |
| Double submit / retry                              | `set` to an identical value is a no-op (no ledger row), same idempotent rule as the Table Allocation retry                                                                                                          |
| Version bump rule                                  | every quantity or threshold change increments `version`; metadata edits on products/vendors increment theirs                                                                                                        |

## 6. Import commit (atomic)

One transaction under advisory/row locks: create missing vendors/categories/subcategories (the ones the manager approved in the preview) → create products + stock rows → for each `update` row verify `expected_stock_version`, apply `set` adjustments (`source = bulk_import`, `reason = batch.reason`, `import_batch_id`) → write change-log rows for threshold edits → update batch counts. The manager chooses at confirm time between **"commit all valid rows (skip errors)"** and **"cancel"**; there is no partial commit within a row.

## 7. RLS and grants

RLS enabled on every table. `revoke all … from public, anon, authenticated; grant select … to authenticated;` — **no client INSERT/UPDATE/DELETE policies or grants**. SELECT policies: `private.inventory_is_manager(organization_id) and private.inventory_can_access_location(organization_id, location_id)` (organization-level tables omit the location clause). `(select auth.uid())` wrapped everywhere. Helpers use the **membership-only** pattern (`has_board_role`-style, no `organizations.created_by` bypass, see #106). Detail in `SECURITY_AND_ROLES.md`.

## 8. Realtime (owner decision D7, locked: database = truth, event = invalidation, client = refetch)

Add `inventory_stock` and `inventory_adjustments` to the Realtime publication as **notifications only**; clients invalidate and refetch through the normal loaders — the Table Allocation architecture (database truth → notification → refetch). No logic in Realtime. If owner declines, managers refresh manually in V1.

## 9. Data volume assumptions

A single bar: 150–800 products; a weekly count produces ≤ 800 ledger rows/week (~40k/year). Dashboard and Inventory load the location's full active catalog (≤ 5,000 rows cap) with stock in one query and filter client-side for instant response; **History and Analytics are paginated/aggregated server-side**. Revisit with the cap if a second location or a large catalog arrives.

## 10. Alternatives considered

| Choice                          | Rejected alternative                | Reason                                                                             |
| ------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------- |
| Separate vendor/category tables | Free-text columns per product       | Duplicates ("DelPapa"), no archive, no rename                                      |
| Stored generated `total`        | Compute in every query              | Needed for sort/filter/aggregate in SQL; generated columns cannot drift            |
| Status computed in a view       | Stored status column                | A threshold edit would otherwise need a backfill; status is derived                |
| Ledger + change log             | One generic event table             | Quantity analytics need typed columns/indexes; admin audit is a different shape    |
| Server-staged import plan       | Client resends parsed rows          | TOCTOU and tampering; the manager must commit exactly what was reviewed            |
| Optimistic version + delta mode | Pessimistic locks / last write wins | Lost updates on counts are the failure mode; deliveries commute so need no version |
