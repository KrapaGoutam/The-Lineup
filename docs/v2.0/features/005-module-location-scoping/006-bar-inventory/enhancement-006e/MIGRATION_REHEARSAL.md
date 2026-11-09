# V2-005.006-E: Migration Rehearsal (populated data)

Migration: `supabase/migrations/20261109120000_inventory_physical_storage_layout.sql`
sha256 `a7a61e50b9611d89320cda53c909bac1f0f5eca9bc06cc641bc49ec46ea065e4` (PR head `277efd6`).

## Source: encrypted hosted DEV backup, restored in isolation

- Backup: `dev-20261109T191658Z.zip.dpapi` (DPAPI CurrentUser, no plaintext SQL ever written),
  ciphertext sha256 `c880609dea4e28ee5fba1dd90b62124a795f74890bbdd421a1bb2e9d1c4cfa5d`, 6 components, per-component
  sha256 verified, round-trip decrypt verified. Taken at DEV ledger 81.
- Restore target: disposable container `lineup-dev-recovery-e6-81` (`supabase/postgres:17.11.0.003`, no network, no
  ports, 1 GiB tmpfs). Never DEV, never Production, never the shared local stack.
- Restore result: 107 tables, 0 count mismatches, FK anti-join validation PASS, ledger 81 / `20261108160000`.
- Real counts restored: organizations 30, locations 44, memberships 52, profiles 53, auth.users 53,
  inventory_products 148, inventory_stock 236, inventory_adjustments 123, inventory_date_lots 47, bar_recipes 32,
  inventory_import_batches 5, storage.objects 34.

## Result of applying the exact committed migration (role `postgres`, single transaction)

| Check                                                          | Result                                                                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Apply                                                          | exit 0                                                                                                        |
| Every existing public table: row count + order-independent md5 | IDENTICAL (0 changed)                                                                                         |
| auth.users / storage.objects / storage.buckets digests         | IDENTICAL                                                                                                     |
| New tables (areas, shelves, placements, date-group receipts)   | created EMPTY: no fabricated placements, stock not redistributed                                              |
| Functions                                                      | +8 (7 storage RPCs + `inventory_date_group_import_commit`); 0 existing changed                                |
| Function grants                                                | +8, all `anon=false, authenticated=true`                                                                      |
| Policies / indexes / RLS / table grants / columns              | +8 / +27 / +4 / +4 / +51; 0 changed or removed                                                                |
| Triggers                                                       | 0 added, 0 changed                                                                                            |
| Constraints                                                    | +40; 2 changed: `inventory_change_log` action/entity-type checks WIDENED (add `delete`, storage entity types) |
| Non-deferrable inventory FKs to locations/memberships          | 0                                                                                                             |

## Rollback-only probe on the restored data (SQL role simulation, NOT live tokens)

A real active location manager from the restored data created an area, a shelf and a placement for a real product
and committed a Date Group import. Stock digest and ledger count were identical before/after; anon cannot execute;
after ROLLBACK the new tables held 0 rows.

## Compatibility

Old-app/new-schema compatibility was ASSESSED BY INSPECTION AND DIFF, not by running the old application: the
migration is additive and changes no existing function, grant, policy, index, trigger or column (proved above); the
only altered objects are two CHECK constraints that were widened.
