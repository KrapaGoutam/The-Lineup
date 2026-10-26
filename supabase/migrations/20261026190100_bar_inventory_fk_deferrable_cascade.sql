-- Bar Inventory V1 / BI-2 follow-up (2/2) -- the remaining foreign keys that
-- sit on a tenant-teardown cascade path become DEFERRABLE INITIALLY DEFERRED
-- (see 20261026190000 for the reasoning): stock / ledger / change log ->
-- locations, and the catalog's own parent links. Deleting an organization
-- (service-role / test teardown only) then cascades cleanly in any order,
-- while removing a still-referenced location, vendor, category or
-- subcategory outside a cascade still fails with 23503 at commit.
--
-- Forward-only, no data change.

alter table public.inventory_stock alter constraint inventory_stock_location_fk deferrable initially deferred;
alter table public.inventory_adjustments alter constraint inventory_adjustments_location_fk deferrable initially deferred;
alter table public.inventory_change_log alter constraint inventory_change_log_location_fk deferrable initially deferred;
alter table public.inventory_subcategories alter constraint inventory_subcategories_category_fk deferrable initially deferred;
alter table public.inventory_products alter constraint inventory_products_vendor_fk deferrable initially deferred;
alter table public.inventory_products alter constraint inventory_products_category_fk deferrable initially deferred;
alter table public.inventory_products alter constraint inventory_products_subcategory_fk deferrable initially deferred;
