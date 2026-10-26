-- Bar Inventory V1 / BI-2 follow-up (3/3) -- inventory_subcategories had a
-- composite FK to its category but NO foreign key to organizations, so deleting
-- an organization (service-role / test teardown) could never remove its
-- subcategories: the category delete was blocked by them. Add the direct
-- tenant FK every other inventory table already has (cascade from the
-- organization; there is still no client delete path).
--
-- Forward-only, no data change.

alter table public.inventory_subcategories
  add constraint inventory_subcategories_org_fk
  foreign key (organization_id) references public.organizations (id) on delete cascade;
