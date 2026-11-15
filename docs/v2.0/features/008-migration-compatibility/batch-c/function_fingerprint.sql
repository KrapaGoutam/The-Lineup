-- Read-only. Fingerprint of every function the three pending migrations create or replace.
-- Output: signature | md5(pg_get_functiondef) | security definer | proconfig | ACL | owner.
-- Run identically against a disposable local DB and (read-only, begin read only) Hosted DEV.
select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig,
       md5(pg_get_functiondef(p.oid)) as def_md5,
       p.prosecdef as secdef,
       coalesce(p.proconfig::text, '') as cfg,
       coalesce(p.proacl::text, '') as acl,
       p.proowner::regrole::text as owner
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private')
  and p.proname in (
    'kiosk_live_session', 'kiosk_can_manage_location', 'kiosk_list_manageable_locations',
    'kiosk_reassign_device', 'catalog_can_manage_org', 'inventory_catalog_begin',
    'recipes_begin', 'recipes_can_write_image', 'catalog_authorized',
    'inventory_category_create', 'inventory_category_set_active', 'inventory_category_update',
    'inventory_product_create', 'inventory_product_set_active', 'inventory_product_update',
    'inventory_subcategory_create', 'inventory_subcategory_set_active', 'inventory_subcategory_update',
    'inventory_vendor_create', 'inventory_vendor_set_active', 'inventory_vendor_update')
order by 1;
