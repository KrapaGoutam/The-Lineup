-- Bar Inventory V1 / BI-2 follow-up -- make the actor foreign keys to
-- memberships DEFERRABLE INITIALLY DEFERRED.
--
-- Why: every inventory row records who made it (created_by / updated_by /
-- actor_profile_id) with a composite FK to memberships. When an organization
-- is deleted (tenant teardown; there is no client delete path) PostgreSQL
-- cascades memberships and the inventory tables as sibling actions, and an
-- immediate NO ACTION check on a membership row can run BEFORE a deeper
-- cascade (product -> stock / ledger) has removed the referencing rows.
-- Deferring the check to the end of the statement lets the whole cascade
-- finish first. Protection is unchanged: removing a membership that is still
-- referenced (outside a cascade) fails at commit with the same 23503.
--
-- Forward-only, no data change.

alter table public.inventory_vendors alter constraint inventory_vendors_creator_fk deferrable initially deferred;
alter table public.inventory_vendors alter constraint inventory_vendors_updater_fk deferrable initially deferred;
alter table public.inventory_categories alter constraint inventory_categories_creator_fk deferrable initially deferred;
alter table public.inventory_categories alter constraint inventory_categories_updater_fk deferrable initially deferred;
alter table public.inventory_subcategories alter constraint inventory_subcategories_creator_fk deferrable initially deferred;
alter table public.inventory_subcategories alter constraint inventory_subcategories_updater_fk deferrable initially deferred;
alter table public.inventory_products alter constraint inventory_products_creator_fk deferrable initially deferred;
alter table public.inventory_products alter constraint inventory_products_updater_fk deferrable initially deferred;
alter table public.inventory_change_log alter constraint inventory_change_log_actor_fk deferrable initially deferred;
alter table public.inventory_stock alter constraint inventory_stock_updater_fk deferrable initially deferred;
alter table public.inventory_adjustments alter constraint inventory_adjustments_actor_fk deferrable initially deferred;
