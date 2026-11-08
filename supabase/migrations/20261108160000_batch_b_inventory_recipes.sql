-- Migration: 20261108160000_batch_b_inventory_recipes.sql
-- V2-005 Batch B: Bar Inventory & Recipes Location Scoping and Overall Role Compatibility
--
-- 1. Decouple composite membership foreign keys to public.profiles(id) across all
--    inventory and recipe tables so that Overall-only actors (who do not have rows
--    in public.memberships) can perform authorized actions without FK violations.
-- 2. Implement private.inventory_live_session() and private.inventory_profile_level()
--    to evaluate effective capabilities per location in accordance with V2 ACCESS_MODEL.
-- 3. Reconcile private.inventory_can_access_location(p_org, p_location) and
--    private.inventory_is_manager(p_org).
-- 4. Expose public RPC public.inventory_location_authorized(p_org, p_location).
-- 5. Reconcile private.recipes_is_member(p_org), private.recipes_is_manager(p_org),
--    and private.recipes_begin(p_org).
-- 6. Expose public RPC public.recipes_org_authorized(p_org).

-- ============================================================================
-- PART 1: Decouple Composite Membership FKs to Profiles
-- ============================================================================

-- 1.1 inventory_vendors
alter table public.inventory_vendors
  drop constraint if exists inventory_vendors_creator_fk,
  drop constraint if exists inventory_vendors_updater_fk;

alter table public.inventory_vendors
  add constraint inventory_vendors_created_by_profile_fk
    foreign key (created_by) references public.profiles(id),
  add constraint inventory_vendors_updated_by_profile_fk
    foreign key (updated_by) references public.profiles(id);

create index if not exists inventory_vendors_created_by_profile_idx
  on public.inventory_vendors(created_by);
create index if not exists inventory_vendors_updated_by_profile_idx
  on public.inventory_vendors(updated_by) where updated_by is not null;

-- 1.2 inventory_categories
alter table public.inventory_categories
  drop constraint if exists inventory_categories_creator_fk,
  drop constraint if exists inventory_categories_updater_fk;

alter table public.inventory_categories
  add constraint inventory_categories_created_by_profile_fk
    foreign key (created_by) references public.profiles(id),
  add constraint inventory_categories_updated_by_profile_fk
    foreign key (updated_by) references public.profiles(id);

create index if not exists inventory_categories_created_by_profile_idx
  on public.inventory_categories(created_by);
create index if not exists inventory_categories_updated_by_profile_idx
  on public.inventory_categories(updated_by) where updated_by is not null;

-- 1.3 inventory_subcategories
alter table public.inventory_subcategories
  drop constraint if exists inventory_subcategories_creator_fk,
  drop constraint if exists inventory_subcategories_updater_fk;

alter table public.inventory_subcategories
  add constraint inventory_subcategories_created_by_profile_fk
    foreign key (created_by) references public.profiles(id),
  add constraint inventory_subcategories_updated_by_profile_fk
    foreign key (updated_by) references public.profiles(id);

create index if not exists inventory_subcategories_created_by_profile_idx
  on public.inventory_subcategories(created_by);
create index if not exists inventory_subcategories_updated_by_profile_idx
  on public.inventory_subcategories(updated_by) where updated_by is not null;

-- 1.4 inventory_products
alter table public.inventory_products
  drop constraint if exists inventory_products_creator_fk,
  drop constraint if exists inventory_products_updater_fk;

alter table public.inventory_products
  add constraint inventory_products_created_by_profile_fk
    foreign key (created_by) references public.profiles(id),
  add constraint inventory_products_updated_by_profile_fk
    foreign key (updated_by) references public.profiles(id);

create index if not exists inventory_products_created_by_profile_idx
  on public.inventory_products(created_by);
create index if not exists inventory_products_updated_by_profile_idx
  on public.inventory_products(updated_by) where updated_by is not null;

-- 1.5 inventory_change_log
alter table public.inventory_change_log
  drop constraint if exists inventory_change_log_actor_fk;

alter table public.inventory_change_log
  add constraint inventory_change_log_actor_profile_id_profile_fk
    foreign key (actor_profile_id) references public.profiles(id);

create index if not exists inventory_change_log_actor_profile_id_idx
  on public.inventory_change_log(actor_profile_id);

-- 1.6 inventory_stock
alter table public.inventory_stock
  drop constraint if exists inventory_stock_updater_fk;

alter table public.inventory_stock
  add constraint inventory_stock_updated_by_profile_fk
    foreign key (updated_by) references public.profiles(id);

create index if not exists inventory_stock_updated_by_profile_idx
  on public.inventory_stock(updated_by) where updated_by is not null;

-- 1.7 inventory_adjustments
alter table public.inventory_adjustments
  drop constraint if exists inventory_adjustments_actor_fk;

alter table public.inventory_adjustments
  add constraint inventory_adjustments_actor_profile_id_profile_fk
    foreign key (actor_profile_id) references public.profiles(id);

create index if not exists inventory_adjustments_actor_profile_id_idx
  on public.inventory_adjustments(actor_profile_id);

-- 1.8 inventory_import_batches
alter table public.inventory_import_batches
  drop constraint if exists inventory_import_batches_actor_fk;

alter table public.inventory_import_batches
  add constraint inventory_import_batches_actor_profile_id_profile_fk
    foreign key (actor_profile_id) references public.profiles(id);

create index if not exists inventory_import_batches_actor_profile_id_idx
  on public.inventory_import_batches(actor_profile_id);

-- 1.9 inventory_order_drafts
alter table public.inventory_order_drafts
  drop constraint if exists inventory_order_drafts_creator_fk,
  drop constraint if exists inventory_order_drafts_updater_fk,
  drop constraint if exists inventory_order_drafts_sender_fk;

alter table public.inventory_order_drafts
  add constraint inventory_order_drafts_created_by_profile_fk
    foreign key (created_by) references public.profiles(id),
  add constraint inventory_order_drafts_updated_by_profile_fk
    foreign key (updated_by) references public.profiles(id),
  add constraint inventory_order_drafts_sent_by_profile_fk
    foreign key (sent_by) references public.profiles(id);

create index if not exists inventory_order_drafts_created_by_profile_idx
  on public.inventory_order_drafts(created_by);
create index if not exists inventory_order_drafts_updated_by_profile_idx
  on public.inventory_order_drafts(updated_by);
create index if not exists inventory_order_drafts_sent_by_profile_idx
  on public.inventory_order_drafts(sent_by) where sent_by is not null;

-- 1.10 inventory_date_lots
alter table public.inventory_date_lots
  drop constraint if exists inventory_date_lots_organization_id_created_by_fkey,
  drop constraint if exists inventory_date_lots_organization_id_updated_by_fkey;

alter table public.inventory_date_lots
  add constraint inventory_date_lots_created_by_profile_fk
    foreign key (created_by) references public.profiles(id),
  add constraint inventory_date_lots_updated_by_profile_fk
    foreign key (updated_by) references public.profiles(id);

create index if not exists inventory_date_lots_created_by_profile_idx
  on public.inventory_date_lots(created_by);
create index if not exists inventory_date_lots_updated_by_profile_idx
  on public.inventory_date_lots(updated_by) where updated_by is not null;

-- 1.11 inventory_freshness_rules
alter table public.inventory_freshness_rules
  drop constraint if exists inventory_freshness_rules_organization_id_created_by_fkey,
  drop constraint if exists inventory_freshness_rules_organization_id_updated_by_fkey;

alter table public.inventory_freshness_rules
  add constraint inventory_freshness_rules_created_by_profile_fk
    foreign key (created_by) references public.profiles(id),
  add constraint inventory_freshness_rules_updated_by_profile_fk
    foreign key (updated_by) references public.profiles(id);

create index if not exists inventory_freshness_rules_created_by_profile_idx
  on public.inventory_freshness_rules(created_by);
create index if not exists inventory_freshness_rules_updated_by_profile_idx
  on public.inventory_freshness_rules(updated_by) where updated_by is not null;

-- 1.12 inventory_saved_views
alter table public.inventory_saved_views
  drop constraint if exists inventory_saved_views_organization_id_profile_id_fkey;

alter table public.inventory_saved_views
  add constraint inventory_saved_views_profile_id_profile_fk
    foreign key (profile_id) references public.profiles(id) on delete cascade;

-- 1.13 bar_recipe_categories
alter table public.bar_recipe_categories
  drop constraint if exists bar_recipe_categories_creator_fk,
  drop constraint if exists bar_recipe_categories_updater_fk;

alter table public.bar_recipe_categories
  add constraint bar_recipe_categories_created_by_profile_fk
    foreign key (created_by) references public.profiles(id),
  add constraint bar_recipe_categories_updated_by_profile_fk
    foreign key (updated_by) references public.profiles(id);

create index if not exists bar_recipe_categories_created_by_profile_idx
  on public.bar_recipe_categories(created_by);
create index if not exists bar_recipe_categories_updated_by_profile_idx
  on public.bar_recipe_categories(updated_by) where updated_by is not null;

-- 1.14 bar_recipes
alter table public.bar_recipes
  drop constraint if exists bar_recipes_creator_fk,
  drop constraint if exists bar_recipes_updater_fk,
  drop constraint if exists bar_recipes_archiver_fk;

alter table public.bar_recipes
  add constraint bar_recipes_created_by_profile_fk
    foreign key (created_by) references public.profiles(id),
  add constraint bar_recipes_updated_by_profile_fk
    foreign key (updated_by) references public.profiles(id),
  add constraint bar_recipes_archived_by_profile_fk
    foreign key (archived_by) references public.profiles(id);

create index if not exists bar_recipes_created_by_profile_idx
  on public.bar_recipes(created_by);
create index if not exists bar_recipes_updated_by_profile_idx
  on public.bar_recipes(updated_by) where updated_by is not null;
create index if not exists bar_recipes_archived_by_profile_idx
  on public.bar_recipes(archived_by) where archived_by is not null;


-- ============================================================================
-- PART 2: Inventory Authorization Helpers
-- ============================================================================

-- Check if caller has an active, unbanned Supabase session.
create or replace function private.inventory_live_session()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = (select auth.uid())
      and (u.banned_until is null or u.banned_until <= now())
      and (
        (select auth.jwt()) ->> 'session_id' is null
        or exists (
          select 1
          from auth.sessions s
          where s.user_id = u.id
            and s.id::text = (select auth.jwt()) ->> 'session_id'
            and (s.not_after is null or s.not_after > now())
        )
      )
  );
$$;
revoke all on function private.inventory_live_session() from public, anon;
grant execute on function private.inventory_live_session() to authenticated;

-- Resolves effective level for inventory:
-- 4 = Owner, 3 = Manager, 2 = Assistant Manager, 1 = Staff, 0 = None.
create or replace function private.inventory_profile_level(
  p_org uuid,
  p_location uuid,
  p_profile uuid
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    -- Overall Role Tier
    coalesce(
      (select case r.role
         when 'owner' then 4
         when 'manager' then 3
         when 'assistant_manager' then 2
         else 0 end
       from public.overall_roles r
       where r.profile_id = p_profile),
      0
    ),
    -- Organization / Location Tier (requires active tenant membership)
    case when exists (
      select 1 from public.memberships m
      where m.organization_id = p_org
        and m.profile_id = p_profile
        and m.active
    ) then
      greatest(
        -- Location Role at p_location (if p_location provided)
        coalesce(
          (select case lm.role
             when 'manager' then 3
             when 'assistant_manager' then 2
             else 1 end
           from public.location_memberships lm
           where lm.location_id = p_location
             and lm.profile_id = p_profile
             and lm.active),
          0
        ),
        -- Organization Role
        coalesce(
          (select case
             when 'owner' = any(m.roles) then 4
             when 'general_manager' = any(m.roles) then 3
             when 'shift_manager' = any(m.roles) and (
               p_location is null or
               (select count(*) from public.locations x
                where x.organization_id = p_org and x.active and x.archived_at is null) <= 1
             ) then 2
             else 1 end
           from public.memberships m
           where m.organization_id = p_org
             and m.profile_id = p_profile
             and m.active),
          0
        )
      )
    else 0 end
  );
$$;
revoke all on function private.inventory_profile_level(uuid, uuid, uuid) from public, anon;
grant execute on function private.inventory_profile_level(uuid, uuid, uuid) to authenticated;

-- Reconciled: Can access inventory at verified location (effective level >= 2).
create or replace function private.inventory_can_access_location(
  p_organization_id uuid,
  p_location_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.inventory_live_session()
    and exists (
      select 1 from public.locations l
      where l.id = p_location_id
        and l.organization_id = p_organization_id
        and l.active
        and l.archived_at is null
    )
    and private.inventory_profile_level(p_organization_id, p_location_id, (select auth.uid())) >= 2;
$$;
revoke all on function private.inventory_can_access_location(uuid, uuid) from public, anon;
grant execute on function private.inventory_can_access_location(uuid, uuid) to authenticated;

-- Reconciled: Can read organization-wide catalog items.
create or replace function private.inventory_is_manager(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.inventory_live_session()
    and (
      exists (
        select 1 from public.overall_roles r
        where r.profile_id = (select auth.uid())
          and r.role in ('owner', 'manager', 'assistant_manager')
      )
      or exists (
        select 1 from public.memberships m
        where m.organization_id = p_organization_id
          and m.profile_id = (select auth.uid())
          and m.active
          and (
            m.roles && array['owner', 'general_manager', 'shift_manager']::public.app_role[]
            or exists (
              select 1 from public.location_memberships lm
              join public.locations l on l.id = lm.location_id
              where l.organization_id = p_organization_id
                and l.active
                and l.archived_at is null
                and lm.profile_id = m.profile_id
                and lm.active
                and lm.role in ('manager', 'assistant_manager')
            )
          )
      )
    );
$$;
revoke all on function private.inventory_is_manager(uuid) from public, anon;
grant execute on function private.inventory_is_manager(uuid) to authenticated;

-- Public RPC for server-side verification of active location authority.
create or replace function public.inventory_location_authorized(
  p_organization_id uuid,
  p_location_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.inventory_can_access_location(p_organization_id, p_location_id);
$$;
revoke all on function public.inventory_location_authorized(uuid, uuid) from public, anon;
grant execute on function public.inventory_location_authorized(uuid, uuid) to authenticated;


-- ============================================================================
-- PART 3: Recipes Authorization Helpers
-- ============================================================================

-- Reconciled: Is member of organization for reading active recipes.
create or replace function private.recipes_is_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.inventory_live_session()
    and (
      exists (
        select 1 from public.overall_roles r
        where r.profile_id = (select auth.uid())
      )
      or exists (
        select 1 from public.memberships m
        where m.organization_id = p_org
          and m.profile_id = (select auth.uid())
          and m.active
      )
    );
$$;
revoke all on function private.recipes_is_member(uuid) from public, anon;
grant execute on function private.recipes_is_member(uuid) to authenticated;

-- Reconciled: Is manager in organization for recipe editing, category management, and images.
create or replace function private.recipes_is_manager(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.inventory_live_session()
    and (
      exists (
        select 1 from public.overall_roles r
        where r.profile_id = (select auth.uid())
          and r.role in ('owner', 'manager', 'assistant_manager')
      )
      or exists (
        select 1 from public.memberships m
        where m.organization_id = p_org
          and m.profile_id = (select auth.uid())
          and m.active
          and (
            m.roles && array['owner', 'general_manager', 'shift_manager']::public.app_role[]
            or exists (
              select 1 from public.location_memberships lm
              join public.locations l on l.id = lm.location_id
              where l.organization_id = p_org
                and l.active
                and l.archived_at is null
                and lm.profile_id = m.profile_id
                and lm.active
                and lm.role in ('manager', 'assistant_manager')
            )
          )
      )
    );
$$;
revoke all on function private.recipes_is_manager(uuid) from public, anon;
grant execute on function private.recipes_is_manager(uuid) to authenticated;

-- Reconciled: Entry guard for recipe mutation RPCs.
create or replace function private.recipes_begin(p_org uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not private.recipes_is_manager(p_org) then
    raise exception 'You do not have permission to change recipes' using errcode = '42501';
  end if;
  return v_actor;
end;
$$;
revoke all on function private.recipes_begin(uuid) from public, anon, authenticated;

-- Public RPC for server-side verification of recipes organization authority.
create or replace function public.recipes_org_authorized(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.recipes_is_member(p_organization_id);
$$;
revoke all on function public.recipes_org_authorized(uuid) from public, anon;
grant execute on function public.recipes_org_authorized(uuid) to authenticated;
