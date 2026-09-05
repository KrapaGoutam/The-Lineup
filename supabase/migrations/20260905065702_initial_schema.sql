-- ServiceFlow foundation schema.
-- Browser-facing tables use explicit grants and RLS; `anon` receives no data access.

create schema if not exists private;

create type public.app_role as enum (
  'owner',
  'general_manager',
  'shift_manager',
  'host',
  'server'
);
create type public.schedule_status as enum ('draft', 'published', 'archived');
create type public.request_status as enum ('pending', 'approved', 'declined', 'cancelled');
create type public.service_status as enum ('planned', 'active', 'closed');
create type public.rotation_status as enum ('active', 'paused', 'closing', 'unavailable');
create type public.seating_status as enum ('seated', 'closed', 'cancelled', 'transferred');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 100),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_by uuid not null references auth.users (id),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  roles public.app_role[] not null check (cardinality(roles) > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, profile_id)
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  time_zone text not null default 'UTC',
  address jsonb not null default '{}'::jsonb check (jsonb_typeof(address) = 'object'),
  cover_weight numeric(5, 2) not null default 0.25 check (cover_weight between 0 and 10),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.shift_templates (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  role_label text not null,
  station text,
  start_local time not null,
  end_local time not null,
  created_at timestamptz not null default now(),
  unique (location_id, name)
);

create table public.schedule_periods (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  status public.schedule_status not null default 'draft',
  published_version integer not null default 0 check (published_version >= 0),
  published_at timestamptz,
  published_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  unique (location_id, starts_on, ends_on, published_version)
);

create table public.shifts (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  schedule_period_id bigint not null references public.schedule_periods (id) on delete cascade,
  template_id bigint references public.shift_templates (id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  role_label text not null,
  station text,
  notes text check (length(notes) <= 1000),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table public.shift_assignments (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  shift_id bigint not null references public.shifts (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (shift_id, profile_id)
);

create table public.availability_rules (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  available_from time not null,
  available_until time not null,
  effective_from date not null default current_date,
  effective_until date,
  created_at timestamptz not null default now(),
  check (available_until > available_from),
  check (effective_until is null or effective_until >= effective_from)
);

create table public.time_off_requests (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.request_status not null default 'pending',
  note text check (length(note) <= 1000),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table public.dining_areas (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  area_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (location_id, name)
);

create table public.dining_tables (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  dining_area_id bigint not null references public.dining_areas (id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 40),
  seat_count smallint not null check (seat_count between 1 and 50),
  sequence integer not null default 0,
  position_x numeric(7, 3),
  position_y numeric(7, 3),
  combinable_group uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (location_id, label)
);

create table public.floor_templates (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  name text not null,
  meal_period text not null,
  server_count smallint not null check (server_count between 1 and 100),
  assignments jsonb not null default '[]'::jsonb check (jsonb_typeof(assignments) = 'array'),
  created_at timestamptz not null default now(),
  unique (location_id, meal_period, server_count, name)
);

create table public.service_sessions (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  service_date date not null,
  meal_period text not null,
  status public.service_status not null default 'planned',
  started_at timestamptz,
  started_by uuid references public.profiles (id),
  closed_at timestamptz,
  closed_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create unique index service_sessions_one_active_per_meal
  on public.service_sessions (location_id, service_date, meal_period)
  where status = 'active';

create table public.rotation_members (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  service_session_id bigint not null references public.service_sessions (id) on delete cascade,
  server_profile_id uuid not null references public.profiles (id),
  status public.rotation_status not null default 'active',
  position integer not null,
  party_count integer not null default 0 check (party_count >= 0),
  cover_count integer not null default 0 check (cover_count >= 0),
  active_table_count integer not null default 0 check (active_table_count >= 0),
  max_concurrent_tables integer check (max_concurrent_tables > 0),
  last_seated_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (service_session_id, server_profile_id),
  unique (service_session_id, position)
);

create table public.section_assignments (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  service_session_id bigint not null references public.service_sessions (id) on delete cascade,
  dining_table_id bigint not null references public.dining_tables (id),
  server_profile_id uuid references public.profiles (id),
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  unique (service_session_id, dining_table_id)
);

create table public.seatings (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  service_session_id bigint not null references public.service_sessions (id) on delete cascade,
  server_profile_id uuid not null references public.profiles (id),
  party_size smallint not null check (party_size between 1 and 100),
  status public.seating_status not null default 'seated',
  seated_at timestamptz not null default now(),
  closed_at timestamptz,
  decided_by uuid not null references public.profiles (id),
  override_reason text check (override_reason is null or length(trim(override_reason)) between 3 and 500),
  idempotency_key uuid not null,
  notes text check (length(notes) <= 1000),
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);

create table public.seating_tables (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  seating_id bigint not null references public.seatings (id) on delete cascade,
  dining_table_id bigint not null references public.dining_tables (id),
  released_at timestamptz,
  primary key (seating_id, dining_table_id)
);

create unique index seating_tables_one_open_seating_per_table
  on public.seating_tables (dining_table_id)
  where released_at is null;

create table public.audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid references public.locations (id) on delete set null,
  actor_profile_id uuid references public.profiles (id) on delete set null,
  action text not null check (length(trim(action)) between 1 and 120),
  entity_type text not null check (length(trim(entity_type)) between 1 and 80),
  entity_id text,
  before_state jsonb,
  after_state jsonb,
  reason text check (reason is null or length(trim(reason)) between 3 and 500),
  created_at timestamptz not null default now()
);

-- Composite tenant keys prevent a row from referencing another organization's entity.
alter table public.locations add constraint locations_id_org_key unique (id, organization_id);
alter table public.shift_templates add constraint shift_templates_id_org_key unique (id, organization_id);
alter table public.schedule_periods add constraint schedule_periods_id_org_key unique (id, organization_id);
alter table public.shifts add constraint shifts_id_org_key unique (id, organization_id);
alter table public.dining_areas add constraint dining_areas_id_org_key unique (id, organization_id);
alter table public.dining_tables add constraint dining_tables_id_org_key unique (id, organization_id);
alter table public.service_sessions add constraint service_sessions_id_org_key unique (id, organization_id);
alter table public.seatings add constraint seatings_id_org_key unique (id, organization_id);

alter table public.shift_templates add constraint shift_templates_location_tenant_fk
  foreign key (location_id, organization_id) references public.locations (id, organization_id);
alter table public.schedule_periods add constraint schedule_periods_location_tenant_fk
  foreign key (location_id, organization_id) references public.locations (id, organization_id);
alter table public.schedule_periods add constraint schedule_publisher_member_fk
  foreign key (organization_id, published_by) references public.memberships (organization_id, profile_id);
alter table public.shifts add constraint shifts_location_tenant_fk
  foreign key (location_id, organization_id) references public.locations (id, organization_id);
alter table public.shifts add constraint shifts_period_tenant_fk
  foreign key (schedule_period_id, organization_id) references public.schedule_periods (id, organization_id);
alter table public.shifts add constraint shifts_template_tenant_fk
  foreign key (template_id, organization_id) references public.shift_templates (id, organization_id);
alter table public.shift_assignments add constraint shift_assignments_shift_tenant_fk
  foreign key (shift_id, organization_id) references public.shifts (id, organization_id);
alter table public.shift_assignments add constraint shift_assignments_member_fk
  foreign key (organization_id, profile_id) references public.memberships (organization_id, profile_id);
alter table public.availability_rules add constraint availability_member_fk
  foreign key (organization_id, profile_id) references public.memberships (organization_id, profile_id);
alter table public.time_off_requests add constraint time_off_member_fk
  foreign key (organization_id, profile_id) references public.memberships (organization_id, profile_id);
alter table public.time_off_requests add constraint time_off_reviewer_member_fk
  foreign key (organization_id, reviewed_by) references public.memberships (organization_id, profile_id);
alter table public.dining_areas add constraint dining_areas_location_tenant_fk
  foreign key (location_id, organization_id) references public.locations (id, organization_id);
alter table public.dining_tables add constraint dining_tables_location_tenant_fk
  foreign key (location_id, organization_id) references public.locations (id, organization_id);
alter table public.dining_tables add constraint dining_tables_area_tenant_fk
  foreign key (dining_area_id, organization_id) references public.dining_areas (id, organization_id);
alter table public.floor_templates add constraint floor_templates_location_tenant_fk
  foreign key (location_id, organization_id) references public.locations (id, organization_id);
alter table public.service_sessions add constraint service_sessions_location_tenant_fk
  foreign key (location_id, organization_id) references public.locations (id, organization_id);
alter table public.service_sessions add constraint service_started_by_member_fk
  foreign key (organization_id, started_by) references public.memberships (organization_id, profile_id);
alter table public.service_sessions add constraint service_closed_by_member_fk
  foreign key (organization_id, closed_by) references public.memberships (organization_id, profile_id);
alter table public.rotation_members add constraint rotation_members_session_tenant_fk
  foreign key (service_session_id, organization_id) references public.service_sessions (id, organization_id);
alter table public.rotation_members add constraint rotation_members_server_fk
  foreign key (organization_id, server_profile_id) references public.memberships (organization_id, profile_id);
alter table public.section_assignments add constraint section_assignments_session_tenant_fk
  foreign key (service_session_id, organization_id) references public.service_sessions (id, organization_id);
alter table public.section_assignments add constraint section_assignments_table_tenant_fk
  foreign key (dining_table_id, organization_id) references public.dining_tables (id, organization_id);
alter table public.section_assignments add constraint section_assignments_server_fk
  foreign key (organization_id, server_profile_id) references public.memberships (organization_id, profile_id);
alter table public.seatings add constraint seatings_location_tenant_fk
  foreign key (location_id, organization_id) references public.locations (id, organization_id);
alter table public.seatings add constraint seatings_session_tenant_fk
  foreign key (service_session_id, organization_id) references public.service_sessions (id, organization_id);
alter table public.seatings add constraint seatings_server_member_fk
  foreign key (organization_id, server_profile_id) references public.memberships (organization_id, profile_id);
alter table public.seatings add constraint seatings_decider_member_fk
  foreign key (organization_id, decided_by) references public.memberships (organization_id, profile_id);
alter table public.seating_tables add constraint seating_tables_seating_tenant_fk
  foreign key (seating_id, organization_id) references public.seatings (id, organization_id);
alter table public.seating_tables add constraint seating_tables_table_tenant_fk
  foreign key (dining_table_id, organization_id) references public.dining_tables (id, organization_id);
alter table public.audit_events add constraint audit_events_location_tenant_fk
  foreign key (location_id, organization_id) references public.locations (id, organization_id);
alter table public.audit_events add constraint audit_events_actor_member_fk
  foreign key (organization_id, actor_profile_id) references public.memberships (organization_id, profile_id);

-- Foreign-key and dominant-query indexes.
create index memberships_profile_org_idx on public.memberships (profile_id, organization_id) where active;
create index locations_org_idx on public.locations (organization_id);
create index shift_templates_org_location_idx on public.shift_templates (organization_id, location_id);
create index schedule_periods_org_location_dates_idx on public.schedule_periods (organization_id, location_id, starts_on, ends_on);
create index shifts_period_start_idx on public.shifts (schedule_period_id, starts_at);
create index shifts_org_location_start_idx on public.shifts (organization_id, location_id, starts_at);
create index shifts_template_idx on public.shifts (template_id) where template_id is not null;
create index shift_assignments_profile_shift_idx on public.shift_assignments (profile_id, shift_id);
create index shift_assignments_org_idx on public.shift_assignments (organization_id);
create index availability_profile_day_idx on public.availability_rules (profile_id, day_of_week, effective_from);
create index availability_org_idx on public.availability_rules (organization_id);
create index time_off_profile_dates_idx on public.time_off_requests (profile_id, starts_at, ends_at);
create index time_off_org_status_idx on public.time_off_requests (organization_id, status);
create index time_off_reviewed_by_idx on public.time_off_requests (reviewed_by) where reviewed_by is not null;
create index dining_areas_org_location_idx on public.dining_areas (organization_id, location_id, area_order);
create index dining_tables_area_idx on public.dining_tables (dining_area_id, sequence);
create index dining_tables_org_location_idx on public.dining_tables (organization_id, location_id) where active;
create index floor_templates_org_location_idx on public.floor_templates (organization_id, location_id);
create index service_sessions_org_location_date_idx on public.service_sessions (organization_id, location_id, service_date);
create index service_sessions_started_by_idx on public.service_sessions (started_by) where started_by is not null;
create index service_sessions_closed_by_idx on public.service_sessions (closed_by) where closed_by is not null;
create index rotation_members_org_idx on public.rotation_members (organization_id);
create index rotation_members_session_status_idx on public.rotation_members (service_session_id, status, last_seated_at);
create index rotation_members_profile_idx on public.rotation_members (server_profile_id);
create index section_assignments_org_idx on public.section_assignments (organization_id);
create index section_assignments_table_idx on public.section_assignments (dining_table_id);
create index section_assignments_server_idx on public.section_assignments (server_profile_id) where server_profile_id is not null;
create index seatings_org_location_time_idx on public.seatings (organization_id, location_id, seated_at desc);
create index seatings_session_status_idx on public.seatings (service_session_id, status, seated_at);
create index seatings_server_idx on public.seatings (server_profile_id, seated_at desc);
create index seatings_decided_by_idx on public.seatings (decided_by);
create index seating_tables_org_idx on public.seating_tables (organization_id);
create index seating_tables_table_idx on public.seating_tables (dining_table_id);
create index audit_events_org_created_idx on public.audit_events (organization_id, created_at desc);
create index audit_events_location_created_idx on public.audit_events (location_id, created_at desc) where location_id is not null;
create index audit_events_actor_idx on public.audit_events (actor_profile_id) where actor_profile_id is not null;

-- SECURITY DEFINER helpers are narrowly scoped, fully qualified, and not executable by public/anon.
create function private.has_org_role(
  target_organization_id uuid,
  allowed_roles public.app_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships
    where memberships.organization_id = target_organization_id
      and memberships.profile_id = (select auth.uid())
      and memberships.active
      and memberships.roles && allowed_roles
  ) or exists (
    select 1
    from public.organizations
    where organizations.id = target_organization_id
      and organizations.created_by = (select auth.uid())
  );
$$;

create function private.can_view_profile(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_profile_id = (select auth.uid()) or exists (
    select 1
    from public.memberships viewer
    join public.memberships target
      on target.organization_id = viewer.organization_id
     and target.profile_id = target_profile_id
     and target.active
    where viewer.profile_id = (select auth.uid())
      and viewer.active
  );
$$;

revoke all on function private.has_org_role(uuid, public.app_role[]) from public, anon;
revoke all on function private.can_view_profile(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.has_org_role(uuid, public.app_role[]) to authenticated;
grant execute on function private.can_view_profile(uuid) to authenticated;

-- Explicit API grants. No browser data privileges are granted to `anon`.
revoke all on table
  public.profiles,
  public.organizations,
  public.memberships,
  public.locations,
  public.shift_templates,
  public.schedule_periods,
  public.shifts,
  public.shift_assignments,
  public.availability_rules,
  public.time_off_requests,
  public.dining_areas,
  public.dining_tables,
  public.floor_templates,
  public.service_sessions,
  public.rotation_members,
  public.section_assignments,
  public.seatings,
  public.seating_tables,
  public.audit_events
from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.organizations to authenticated;
grant select, insert, update, delete on public.memberships to authenticated;
grant select, insert, update on public.locations to authenticated;
grant select, insert, update, delete on public.shift_templates to authenticated;
grant select, insert, update, delete on public.schedule_periods to authenticated;
grant select, insert, update, delete on public.shifts to authenticated;
grant select, insert, update, delete on public.shift_assignments to authenticated;
grant select, insert, update, delete on public.availability_rules to authenticated;
grant select, insert, update on public.time_off_requests to authenticated;
grant select, insert, update, delete on public.dining_areas to authenticated;
grant select, insert, update on public.dining_tables to authenticated;
grant select, insert, update, delete on public.floor_templates to authenticated;
grant select, insert, update on public.service_sessions to authenticated;
grant select, insert, update on public.rotation_members to authenticated;
grant select, insert, update, delete on public.section_assignments to authenticated;
grant select, insert, update on public.seatings to authenticated;
grant select, insert, update, delete on public.seating_tables to authenticated;
grant select, insert on public.audit_events to authenticated;
revoke all on sequence
  public.memberships_id_seq,
  public.shift_templates_id_seq,
  public.schedule_periods_id_seq,
  public.shifts_id_seq,
  public.shift_assignments_id_seq,
  public.availability_rules_id_seq,
  public.time_off_requests_id_seq,
  public.dining_areas_id_seq,
  public.dining_tables_id_seq,
  public.floor_templates_id_seq,
  public.service_sessions_id_seq,
  public.rotation_members_id_seq,
  public.section_assignments_id_seq,
  public.seatings_id_seq,
  public.audit_events_id_seq
from anon, authenticated;
grant usage, select on sequence
  public.memberships_id_seq,
  public.shift_templates_id_seq,
  public.schedule_periods_id_seq,
  public.shifts_id_seq,
  public.shift_assignments_id_seq,
  public.availability_rules_id_seq,
  public.time_off_requests_id_seq,
  public.dining_areas_id_seq,
  public.dining_tables_id_seq,
  public.floor_templates_id_seq,
  public.service_sessions_id_seq,
  public.rotation_members_id_seq,
  public.section_assignments_id_seq,
  public.seatings_id_seq,
  public.audit_events_id_seq
to authenticated;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.locations enable row level security;
alter table public.shift_templates enable row level security;
alter table public.schedule_periods enable row level security;
alter table public.shifts enable row level security;
alter table public.shift_assignments enable row level security;
alter table public.availability_rules enable row level security;
alter table public.time_off_requests enable row level security;
alter table public.dining_areas enable row level security;
alter table public.dining_tables enable row level security;
alter table public.floor_templates enable row level security;
alter table public.service_sessions enable row level security;
alter table public.rotation_members enable row level security;
alter table public.section_assignments enable row level security;
alter table public.seatings enable row level security;
alter table public.seating_tables enable row level security;
alter table public.audit_events enable row level security;

-- Identity and tenant policies.
create policy "profiles_select_shared_org" on public.profiles for select to authenticated
  using ((select private.can_view_profile(id)));
create policy "profiles_insert_self" on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy "profiles_update_self" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "organizations_select_member" on public.organizations for select to authenticated
  using ((select private.has_org_role(id, array['owner','general_manager','shift_manager','host','server']::public.app_role[])));
create policy "organizations_insert_creator" on public.organizations for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy "organizations_update_manager" on public.organizations for update to authenticated
  using ((select private.has_org_role(id, array['owner','general_manager']::public.app_role[])))
  with check ((select private.has_org_role(id, array['owner','general_manager']::public.app_role[])));

create policy "memberships_select_member" on public.memberships for select to authenticated
  using ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager','host','server']::public.app_role[])));
create policy "memberships_insert_manager" on public.memberships for insert to authenticated
  with check (
    (select private.has_org_role(organization_id, array['owner']::public.app_role[])) or
    (
      (select private.has_org_role(organization_id, array['general_manager']::public.app_role[])) and
      not (roles && array['owner','general_manager']::public.app_role[])
    )
  );
create policy "memberships_update_manager" on public.memberships for update to authenticated
  using (
    (select private.has_org_role(organization_id, array['owner']::public.app_role[])) or
    (
      (select private.has_org_role(organization_id, array['general_manager']::public.app_role[])) and
      not (roles && array['owner','general_manager']::public.app_role[])
    )
  )
  with check (
    (select private.has_org_role(organization_id, array['owner']::public.app_role[])) or
    (
      (select private.has_org_role(organization_id, array['general_manager']::public.app_role[])) and
      not (roles && array['owner','general_manager']::public.app_role[])
    )
  );
create policy "memberships_delete_manager" on public.memberships for delete to authenticated
  using (
    (select private.has_org_role(organization_id, array['owner']::public.app_role[])) or
    (
      (select private.has_org_role(organization_id, array['general_manager']::public.app_role[])) and
      not (roles && array['owner','general_manager']::public.app_role[])
    )
  );

-- Reusable tenant policies are generated with fixed table names and role sets.
do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'locations', 'shift_templates', 'schedule_periods', 'shifts', 'shift_assignments',
    'availability_rules', 'time_off_requests', 'dining_areas', 'dining_tables',
    'floor_templates', 'service_sessions', 'rotation_members', 'section_assignments',
    'seatings', 'seating_tables'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select private.has_org_role(organization_id, array[''owner'',''general_manager'',''shift_manager'',''host'',''server'']::public.app_role[])))',
      target_table || '_select_member',
      target_table
    );
  end loop;
end;
$$;

-- Manager-authored configuration and scheduling.
do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'locations', 'shift_templates', 'schedule_periods', 'shifts', 'shift_assignments',
    'dining_areas', 'dining_tables', 'floor_templates'
  ]
  loop
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select private.has_org_role(organization_id, array[''owner'',''general_manager'',''shift_manager'']::public.app_role[]))) with check ((select private.has_org_role(organization_id, array[''owner'',''general_manager'',''shift_manager'']::public.app_role[])))',
      target_table || '_write_manager',
      target_table
    );
  end loop;
end;
$$;

-- Staff own availability requests; managers can review them.
create policy "availability_write_self_or_manager" on public.availability_rules for all to authenticated
  using (
    (
      profile_id = (select auth.uid()) and
      (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager','host','server']::public.app_role[]))
    ) or
    (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[]))
  )
  with check (
    (
      profile_id = (select auth.uid()) and
      (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager','host','server']::public.app_role[]))
    ) or
    (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[]))
  );
create policy "time_off_insert_self" on public.time_off_requests for insert to authenticated
  with check (
    profile_id = (select auth.uid()) and
    status = 'pending' and
    (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager','host','server']::public.app_role[]))
  );
create policy "time_off_update_self_or_manager" on public.time_off_requests for update to authenticated
  using (
    profile_id = (select auth.uid()) or
    (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[]))
  )
  with check (
    (
      profile_id = (select auth.uid()) and
      status in ('pending', 'cancelled') and
      reviewed_by is null and reviewed_at is null and
      (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager','host','server']::public.app_role[]))
    ) or
    (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[]))
  );

-- Live service can be operated by hosts and managers.
do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'service_sessions', 'rotation_members', 'section_assignments', 'seatings', 'seating_tables'
  ]
  loop
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select private.has_org_role(organization_id, array[''owner'',''general_manager'',''shift_manager'',''host'']::public.app_role[]))) with check ((select private.has_org_role(organization_id, array[''owner'',''general_manager'',''shift_manager'',''host'']::public.app_role[])))',
      target_table || '_operate_service',
      target_table
    );
  end loop;
end;
$$;

create policy "audit_events_select_manager" on public.audit_events for select to authenticated
  using ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));
create policy "audit_events_insert_operator" on public.audit_events for insert to authenticated
  with check (
    actor_profile_id = (select auth.uid()) and
    (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager','host']::public.app_role[]))
  );

-- Realtime is limited to the operational tables required at the host stand.
alter publication supabase_realtime add table
  public.service_sessions,
  public.rotation_members,
  public.section_assignments,
  public.seatings,
  public.seating_tables;
