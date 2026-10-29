# Bar Inventory V1 — Security and roles

Status: D1 locked in BI-0 (management roles only; staff none). Conventions are those of Tasks V1 and Table Allocation V2 (audited): membership-only role helpers, SELECT-only grants, writes through `SECURITY DEFINER` RPCs with an empty `search_path`, actor from `auth.uid()`.

## 1. Role model

| Designation (UI)  | DB role (`memberships.roles`) | V1 Bar Inventory      |
| ----------------- | ----------------------------- | --------------------- |
| Owner             | `owner`                       | Full                  |
| Manager           | `general_manager`             | Full                  |
| Assistant Manager | `shift_manager`               | Full                  |
| Staff             | `host`, `server`              | **None** (D1, locked) |

"Full" = view inventory, edit quantities, manage products/vendors/categories/subcategories, import, export, view history and analytics. The management set is exactly `array['owner','general_manager','shift_manager']::public.app_role[]` (the existing `tasks_is_manager` set). Owner / Manager / Assistant Manager are **identical** for this module (consistent with Feature 014: designation is a label over the same permissions); owner-only actions are not introduced.

## 2. One seam per concern (database)

```
private.inventory_is_manager(org)               -- membership-only, no created_by bypass (#106)
private.inventory_can_access_location(org, loc) -- single seam for the multi-location future
private.inventory_begin(org, loc)               -- preamble of every RPC: auth.uid() not null (42501),
                                                --   active management membership (42501),
                                                --   location accessible (42501)
```

Changing V1 policy ("staff read-only", location-specific managers) changes these functions only. Helpers: `language sql stable security definer set search_path = ''`; predicates used in policies are `grant execute … to authenticated`; internal helpers are `revoke all … from public, anon, authenticated`.

## 3. RLS and grants

- RLS enabled on every `inventory_*` table.
- `revoke all … from public, anon, authenticated;` then `grant select … to authenticated;` — **no client DML at all**.
- SELECT policies `<table>_select`: management role **and** location access (location-bound tables). `(select auth.uid())` wrapped.
- Append-only guards on `inventory_adjustments` and `inventory_change_log` (`before update or delete` → `23514`; `before truncate` → `23514`), copied from `task_events`; service-role maintenance and tenant cascade teardown remain possible (trigger depth rule).
- Views are `security_invoker = true` so RLS of the base tables applies.

## 4. The staff-access decision (D1)

| Option                    | Effect                                                                                                              | When to choose                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **None (recommended V1)** | Module hidden from nav; route returns the "not available" state; every table/RPC refuses (`42501`)                  | Inventory contains cost-sensitive operational data; no current staff job needs it |
| Read-only                 | Staff `select` on stock status only (no thresholds/vendors/history), a second policy + helper `inventory_is_member` | If bartenders need to see "what's low" while working                              |

Either way **standard staff can never modify inventory in V1**. Not implemented in this planning task.

## 5. Application layer

- Shell gate: the secondary tab is included only when the viewer is a manager (the shell already computes `isManager`); the module's content block repeats the condition (same pattern as Team). `can()` is **not** the primary gate — the database is. Optionally add capability `bar-inventory:manage` to `roleCapabilities` for readability; if added it must be added for all three `AppRole` sets (owner, manager, server=none).
- Every server action: zod-validate `restaurantSlug`, `getCurrentUser`, `requireLiveSession` first (detects mid-session deactivation), `getPrimaryLocation`, then the RPC. Result `{ ok:true, data } | { ok:false, error, sessionInvalid?, conflict? }`, DB error text passed through `friendly()` when < 200 chars.
- The client never sends a role flag; role is derived server-side from the membership. A request for another organization's product/vendor id fails tenant-safe composite FKs and RLS (tested).

## 6. Threat model (V1)

| Threat                                                        | Control                                                                                                                                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Staff or deactivated user reads/writes inventory              | membership + management check in policies and `inventory_begin`; deactivation test                                                                                                          |
| Cross-tenant id guessing                                      | composite FKs `(id, organization_id)`, policies on `organization_id`, RPCs validate ownership of every id                                                                                   |
| Forged previous values / history rewriting                    | prev values read from the locked row; ledger immutable; no DML grants                                                                                                                       |
| Lost updates / double submit                                  | version + delta modes, idempotent no-op on identical `set`                                                                                                                                  |
| Malicious import file (formulas, zip bomb, huge rows, macros) | size/row/sheet caps, XLSX uncompressed-size cap, reject macro/legacy formats, formulas read as plain values, per-cell length limits, server-side parse only; see `IMPORT_EXPORT_SPEC.md` §6 |
| CSV/Excel formula injection on export                         | leading `= + - @ \t \r` neutralized in **text** cells (numbers untouched), export unit-tested                                                                                               |
| Supply chain (new XLSX dependency)                            | review in BI-0: maintained, no known critical advisories, pinned exact version, no `eval`, parse in a bounded server route; decision recorded (D6)                                          |
| Information disclosure through error messages                 | plain-language messages only; no SQL text; `PT409` detail carries ids/labels of the same tenant only                                                                                        |
| Search-path / privilege-escalation in trusted functions       | `set search_path = ''`, schema-qualified names, helpers not executable by clients, pgTAP asserts                                                                                            |
| Export exfiltration                                           | management-only; export logged in `inventory_change_log` (who, what filter, row count)                                                                                                      |

## 7. Required security tests (see `TEST_STRATEGY.md`)

pgTAP: RLS enabled on all tables; staff/outsider/deactivated denied on select and every RPC (`42501`); anon has no privilege; client DML denied; append-only triggers; `search_path` fixed; composite-FK tenant isolation; helpers not executable by clients. Hosted real: every role (owner, manager, assistant manager, server, outsider) gets the same decision from the same RPC; stale-version `PT409`; concurrent delta adjusts; import commit atomicity.

## V1.1 security boundary

New public RPCs inventory_date_lot_save, inventory_freshness_rule_save,
inventory_bulk_count, inventory_saved_view_save and inventory_saved_view_delete
all invoke inventory_begin, pin an empty search_path and revoke public/anon
execution. Owner/Manager/Assistant Manager retain full access; Staff retain none.
Authenticated clients cannot directly mutate the three new tables. Each RPC
checks organization/location/entity ownership. Expected versions reject stale
writes. Saved-view profile IDs derive exclusively from auth.uid(); RLS exposes
only the caller's personal views. An advisory transaction lock serializes personal
name/default changes; unique indexes enforce both invariants.

Date/rule changes reuse the immutable non-quantity audit with old/new state and
server-derived actor. Bulk Count uses the immutable quantity ledger, normal reason
vocabulary and normal source derivation. The batch validates/locks before calling
existing stock adjustment logic in one transaction; no browser-side write loop.
Realtime publishes dates/rules alongside stock/ledger under the same SELECT RLS;
events only invalidate and refetch canonical state. Personal views are not
published. No actor/role metadata supplied by the client is trusted.
