-- Migration: 20261105210000_location_module_configs.sql
-- Subfeature V2-004.001: Per-Location Module Configuration Contract
--
-- ADDITIVE and forward-only. Creates the data contract for per-location module
-- enablement. It deliberately changes NO operational behaviour:
--   * no existing table, policy, trigger or function is modified;
--   * no row is inserted (a location with no row is "not configured" -- see
--     docs/v2.0/features/004-location-module-configuration/001-module-configuration-contract/PLAN.md);
--   * nothing reads this table yet (navigation = V2-004.003, backend
--     enforcement = V2-004.004, legacy backfill = V2-008.004).
--
-- Contents
--   1. public.location_module_key enum  (canonical, stable module identifiers)
--   2. private.location_module_metadata_valid  (metadata envelope validator)
--   3. public.location_module_configs   (one row per location + module)
--   4. Authority helpers (read / manage) -- delegate to the existing V2-002
--      location-administration authority; NO second authorization hierarchy
--   5. Row guard (immutable ownership, server-stamped audit columns),
--      archived-location guard, hard-delete protection
--   6. RLS policies + least-privilege grants

-- -----------------------------------------------------------------------------
-- 1. Canonical module identifiers
--    Stable, readable snake_case keys. They are NOT UI labels and NOT the
--    client AppTab ids (barInventory -> bar_inventory, tips -> tips,
--    allocation -> table_allocation); the mapping lives in the TypeScript
--    registry (src/features/modules/domain/module-registry.ts).
--    `settings` is intentionally ABSENT: Settings is a system-required module
--    that no location can disable, so it can never have a row.
--    New modules are added with `alter type ... add value` in a later migration.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'location_module_key'
  ) then
    create type public.location_module_key as enum (
      'table_allocation',
      'tasks',
      'schedule',
      'tips',
      'team',
      'attendance',
      'payroll',
      'bar_inventory',
      'recipes'
    );
  end if;
end
$$;

grant usage on type public.location_module_key to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Metadata envelope validator
--    `metadata` is INFORMATIONAL ONLY. It can never carry authorization:
--    unknown keys are rejected, so roles, memberships, permissions, tokens or
--    credentials cannot be stored here.
--      schemaVersion : optional, must be the integer 1
--      note          : optional, trimmed string of 1-280 characters
--      settings      : optional, reserved for future module-specific settings;
--                      MUST be an empty object in this phase. A later
--                      migration replaces this function to admit typed
--                      per-module settings (p_module_key is the hook).
--    Total payload is capped at 2048 bytes. CASE guarantees evaluation order.
-- -----------------------------------------------------------------------------
create or replace function private.location_module_metadata_valid(
  p_module_key public.location_module_key,
  p_metadata jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_module_key is null or p_metadata is null then false
    when jsonb_typeof(p_metadata) <> 'object' then false
    when octet_length(p_metadata::text) > 2048 then false
    when exists (
      select 1 from jsonb_object_keys(p_metadata) k
      where k not in ('schemaVersion', 'note', 'settings')
    ) then false
    when p_metadata ? 'schemaVersion' and p_metadata -> 'schemaVersion' <> '1'::jsonb then false
    when p_metadata ? 'note' and (
      jsonb_typeof(p_metadata -> 'note') <> 'string'
      or char_length(btrim(p_metadata ->> 'note')) not between 1 and 280
    ) then false
    when p_metadata ? 'settings' and p_metadata -> 'settings' <> '{}'::jsonb then false
    else true
  end;
$$;

revoke all on function private.location_module_metadata_valid(public.location_module_key, jsonb) from public, anon;
grant execute on function private.location_module_metadata_valid(public.location_module_key, jsonb) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. public.location_module_configs
--    * Ownership: exactly one location. organization_id is NOT stored; it is
--      derived from public.locations (whose organization_id is immutable), so
--      organization ownership cannot drift.
--    * Natural primary key (location_id, module_key): unique per location,
--      independently configurable across locations of the same organization.
--    * is_enabled has NO default: every row records an explicit decision. A
--      missing row is a distinct "not configured" state, never "enabled".
--    * ON DELETE RESTRICT: deleting a location can never silently erase its
--      configuration (clients cannot delete locations anyway).
--    * updated_by is a plain uuid (no FK), stamped by trigger from auth.uid(),
--      so deleting an account never blocks or erases the audit pointer.
-- -----------------------------------------------------------------------------
create table if not exists public.location_module_configs (
  location_id uuid not null
    references public.locations (id) on delete restrict,
  module_key public.location_module_key not null,
  is_enabled boolean not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint location_module_configs_pkey primary key (location_id, module_key),
  constraint location_module_configs_metadata_valid
    check (private.location_module_metadata_valid(module_key, metadata))
);

comment on table public.location_module_configs is
  'V2-004.001. Per-location module enablement. One row per (location, module). A MISSING row means "not configured" and is never treated as enabled. Carries no permissions; authorization stays in memberships / location_memberships / overall_roles.';
comment on column public.location_module_configs.location_id is
  'Owning physical location. Immutable. Organization is derived via public.locations.organization_id.';
comment on column public.location_module_configs.module_key is
  'Canonical module identifier (public.location_module_key). Immutable. System-required modules (settings) have no key and cannot be disabled.';
comment on column public.location_module_configs.is_enabled is
  'Explicit enabled/disabled decision. No default by design.';
comment on column public.location_module_configs.metadata is
  'Informational envelope only: schemaVersion, note, and a reserved empty settings object. Validated by private.location_module_metadata_valid. NEVER authorization data.';
comment on column public.location_module_configs.updated_by is
  'Last writer, stamped from auth.uid() for client roles. Not forgeable by clients.';

-- -----------------------------------------------------------------------------
-- 4. Authority helpers
--    MANAGE = the existing location-administration authority (V2-002):
--      Overall Owner / Overall Manager, OR active Organization Owner / General
--      Manager of the location's OWNING organization. Location managers, shift
--      managers, host/server, Overall Assistant Managers and revoked/inactive
--      memberships are denied. The thin wrapper gives V2-004.002 one seam to
--      change if the policy ever needs to diverge; today it IS the lifecycle
--      authority, not a parallel one.
--
--    READ = MANAGE, OR any Overall role holder, OR an ACTIVE assignment at that
--      exact location backed by an ACTIVE membership of the owning
--      organization. Belonging to an organization alone does not reveal the
--      configuration of locations the caller is not assigned to.
-- -----------------------------------------------------------------------------
create or replace function private.can_manage_location_module_configs(p_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.locations l
    where l.id = p_location_id
      and private.can_manage_location_lifecycle(l.organization_id)
  );
$$;

revoke all on function private.can_manage_location_module_configs(uuid) from public, anon;
grant execute on function private.can_manage_location_module_configs(uuid) to authenticated;

create or replace function private.can_read_location_module_configs(p_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.locations l
    where l.id = p_location_id
      and (
        exists (
          select 1 from public.overall_roles orl
          where orl.profile_id = (select auth.uid())
        )
        or private.can_manage_location_lifecycle(l.organization_id)
        or exists (
          select 1
          from public.location_memberships lm
          join public.memberships m
            on m.organization_id = l.organization_id
           and m.profile_id = lm.profile_id
           and m.active
          where lm.location_id = l.id
            and lm.profile_id = (select auth.uid())
            and lm.active
        )
      )
  );
$$;

revoke all on function private.can_read_location_module_configs(uuid) from public, anon;
grant execute on function private.can_read_location_module_configs(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 5a. Row guard (SECURITY INVOKER so current_user is the real caller)
--     * location_id / module_key / created_at are immutable: a configuration
--       cannot be silently reassigned across locations, organizations or
--       modules.
--     * For client roles (authenticated / anon) the audit columns are stamped
--       by the server and cannot be forged. Privileged maintenance sessions
--       (postgres / service_role, e.g. the V2-008.004 backfill) may supply
--       created_at on INSERT.
-- -----------------------------------------------------------------------------
create or replace function private.location_module_configs_guard_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.location_id is distinct from old.location_id then
      raise exception 'Module configuration cannot be reassigned to another location'
        using errcode = '22023';
    end if;
    if new.module_key is distinct from old.module_key then
      raise exception 'Module configuration key is immutable'
        using errcode = '22023';
    end if;
    if new.created_at is distinct from old.created_at then
      raise exception 'Module configuration created_at is immutable'
        using errcode = '22023';
    end if;
    new.updated_at := now();
  elsif current_user in ('authenticated', 'anon') then
    new.created_at := now();
    new.updated_at := now();
  end if;

  if current_user in ('authenticated', 'anon') then
    new.updated_by := (select auth.uid());
  end if;

  return new;
end;
$$;

revoke all on function private.location_module_configs_guard_row() from public, anon, authenticated;

drop trigger if exists location_module_configs_guard_row on public.location_module_configs;
create trigger location_module_configs_guard_row
  before insert or update on public.location_module_configs
  for each row execute function private.location_module_configs_guard_row();

-- -----------------------------------------------------------------------------
-- 5b. Archived-location guard (SECURITY DEFINER; same FOR SHARE serialization
--     idea as private.guard_location_operational_write)
--     Configuration may be prepared or corrected while a location is ACTIVE or
--     INACTIVE (it is not operational activity, consistent with V2-002.005),
--     but an ARCHIVED location is retired: its configuration is frozen until
--     the location is restored. FOR SHARE serializes against a concurrent
--     archive transition (which holds FOR NO KEY UPDATE).
-- -----------------------------------------------------------------------------
create or replace function private.location_module_configs_lifecycle_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_archived_at timestamptz;
begin
  select l.archived_at
  into v_archived_at
  from public.locations l
  where l.id = new.location_id
  for share;

  if found and v_archived_at is not null then
    raise exception 'LOCATION_ARCHIVED: module configuration of an archived location is read-only'
      using errcode = '55000',
            hint = 'Restore the location from the archive before changing its module configuration.';
  end if;

  return new;
end;
$$;

revoke all on function private.location_module_configs_lifecycle_guard() from public, anon, authenticated;

drop trigger if exists location_module_configs_lifecycle_guard on public.location_module_configs;
create trigger location_module_configs_lifecycle_guard
  before insert or update on public.location_module_configs
  for each row execute function private.location_module_configs_lifecycle_guard();

-- -----------------------------------------------------------------------------
-- 5c. Hard-delete protection
--     Removing a row would silently turn an explicit decision back into
--     "not configured". Disable a module with is_enabled = false instead.
--     (a) no DELETE/TRUNCATE privilege for client roles, (b) a trigger rejects
--     DELETE executed as a client role. Privileged maintenance sessions remain
--     possible for break-glass work and test teardown.
-- -----------------------------------------------------------------------------
create or replace function private.location_module_configs_forbid_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    raise exception 'Module configuration cannot be deleted; set is_enabled = false instead'
      using errcode = '42501';
  end if;
  return old;
end;
$$;

revoke all on function private.location_module_configs_forbid_delete() from public, anon, authenticated;

drop trigger if exists location_module_configs_forbid_delete on public.location_module_configs;
create trigger location_module_configs_forbid_delete
  before delete on public.location_module_configs
  for each row execute function private.location_module_configs_forbid_delete();

-- -----------------------------------------------------------------------------
-- 6. RLS + grants
--    Least privilege: authenticated may SELECT / INSERT / UPDATE (each behind a
--    policy). anon gets nothing. No DELETE / TRUNCATE for client roles. No
--    policy is a function of user-editable metadata.
-- -----------------------------------------------------------------------------
alter table public.location_module_configs enable row level security;

revoke all on table public.location_module_configs from public, anon, authenticated;
grant select, insert, update on table public.location_module_configs to authenticated;

drop policy if exists "location_module_configs_select" on public.location_module_configs;
create policy "location_module_configs_select" on public.location_module_configs
  for select
  to authenticated
  using (private.can_read_location_module_configs(location_id));

drop policy if exists "location_module_configs_insert_manager" on public.location_module_configs;
create policy "location_module_configs_insert_manager" on public.location_module_configs
  for insert
  to authenticated
  with check (private.can_manage_location_module_configs(location_id));

drop policy if exists "location_module_configs_update_manager" on public.location_module_configs;
create policy "location_module_configs_update_manager" on public.location_module_configs
  for update
  to authenticated
  using (private.can_manage_location_module_configs(location_id))
  with check (private.can_manage_location_module_configs(location_id));

-- Note: no DELETE policy exists by design (see 5c).
