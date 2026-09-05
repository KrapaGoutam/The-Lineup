-- ServiceFlow operational modules: restaurant hours, passcode access,
-- schedule labels, live table rotation, and interval-based tip splitting.

create type public.shift_kind as enum ('morning', 'evening', 'full_day');
create type public.access_request_status as enum ('pending', 'approved', 'declined');
create type public.tip_pool_status as enum ('draft', 'finalized');
create type public.board_event_type as enum (
  'assign', 'add_column', 'pause_column', 'resume_column', 'remove_column',
  'clear_row', 'clear_column', 'clear_board', 'undo', 'redo'
);

alter table public.locations
  add column opening_local time not null default '11:00',
  add column closing_local time not null default '23:00',
  add constraint locations_hours_different check (opening_local <> closing_local);

create table public.operating_hours (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  opening_local time,
  closing_local time,
  closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (closed and opening_local is null and closing_local is null) or
    (not closed and opening_local is not null and closing_local is not null and opening_local <> closing_local)
  ),
  unique (location_id, day_of_week),
  foreign key (location_id, organization_id)
    references public.locations (id, organization_id) on delete cascade
);

create table public.shift_kind_defaults (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null,
  kind public.shift_kind not null,
  start_local time not null,
  end_local time not null,
  updated_at timestamptz not null default now(),
  unique (location_id, kind),
  foreign key (location_id, organization_id)
    references public.locations (id, organization_id) on delete cascade
);

alter table public.shift_templates
  add column kind public.shift_kind;

alter table public.shifts
  add column service_date date,
  add column end_date date,
  add column kind public.shift_kind not null default 'full_day',
  add column series_id uuid,
  add column uses_default_time boolean not null default true;

update public.shifts
set service_date = (starts_at at time zone 'UTC')::date,
    end_date = (ends_at at time zone 'UTC')::date
where service_date is null or end_date is null;

alter table public.shifts
  alter column service_date set not null,
  alter column end_date set not null,
  add constraint shifts_end_date_valid check (end_date >= service_date);

create table public.passcode_credentials (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null,
  locator text not null check (locator ~ '^[a-f0-9]{64}$'),
  synthetic_email text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, profile_id),
  unique (organization_id, locator),
  unique (synthetic_email),
  foreign key (organization_id, profile_id)
    references public.memberships (organization_id, profile_id) on delete cascade
);

create table public.passcode_login_attempts (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  fingerprint text not null check (length(fingerprint) between 1 and 255),
  succeeded boolean not null default false,
  attempted_at timestamptz not null default now()
);

create table public.access_requests (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 100),
  contact text not null check (length(trim(contact)) between 3 and 200),
  status public.access_request_status not null default 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (organization_id, reviewed_by)
    references public.memberships (organization_id, profile_id)
);

alter table public.rotation_members
  add constraint rotation_members_id_org_key unique (id, organization_id);

create table public.rotation_rounds (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  service_session_id bigint not null,
  sequence integer not null check (sequence > 0),
  created_at timestamptz not null default now(),
  unique (service_session_id, sequence),
  unique (id, organization_id),
  foreign key (service_session_id, organization_id)
    references public.service_sessions (id, organization_id) on delete cascade
);

create table public.table_rotation_entries (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  rotation_round_id bigint not null,
  rotation_member_id bigint not null,
  table_label text not null check (length(trim(table_label)) between 1 and 80),
  assigned_by uuid not null,
  assigned_at timestamptz not null default now(),
  unique (rotation_round_id, rotation_member_id),
  foreign key (rotation_round_id, organization_id)
    references public.rotation_rounds (id, organization_id) on delete cascade,
  foreign key (rotation_member_id, organization_id)
    references public.rotation_members (id, organization_id) on delete cascade,
  foreign key (organization_id, assigned_by)
    references public.memberships (organization_id, profile_id)
);

create table public.board_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  service_session_id bigint not null,
  actor_profile_id uuid not null,
  event_type public.board_event_type not null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  inverse_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(inverse_payload) = 'object'),
  undone_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (service_session_id, organization_id)
    references public.service_sessions (id, organization_id) on delete cascade,
  foreign key (organization_id, actor_profile_id)
    references public.memberships (organization_id, profile_id)
);

create table public.tip_pools (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null,
  service_date date not null,
  status public.tip_pool_status not null default 'draft',
  finalized_at timestamptz,
  finalized_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, service_date),
  unique (id, organization_id),
  foreign key (location_id, organization_id)
    references public.locations (id, organization_id),
  foreign key (organization_id, finalized_by)
    references public.memberships (organization_id, profile_id),
  check ((status = 'draft' and finalized_at is null and finalized_by is null) or
         (status = 'finalized' and finalized_at is not null and finalized_by is not null))
);

create table public.tip_intervals (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  tip_pool_id bigint not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  amount_cents integer not null check (amount_cents >= 0),
  note text check (length(note) <= 500),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (id, organization_id),
  foreign key (tip_pool_id, organization_id)
    references public.tip_pools (id, organization_id) on delete cascade
);

create table public.tip_interval_participants (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  tip_interval_id bigint not null,
  profile_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (tip_interval_id, profile_id),
  foreign key (tip_interval_id, organization_id)
    references public.tip_intervals (id, organization_id) on delete cascade,
  foreign key (organization_id, profile_id)
    references public.memberships (organization_id, profile_id)
);

create table public.tip_allocations (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  tip_pool_id bigint not null,
  profile_id uuid not null,
  amount_cents integer not null check (amount_cents >= 0),
  calculated_at timestamptz not null default now(),
  unique (tip_pool_id, profile_id),
  foreign key (tip_pool_id, organization_id)
    references public.tip_pools (id, organization_id) on delete cascade,
  foreign key (organization_id, profile_id)
    references public.memberships (organization_id, profile_id)
);

create index shifts_org_service_date_idx
  on public.shifts (organization_id, service_date, kind);
create index passcode_attempts_limit_idx
  on public.passcode_login_attempts (organization_id, fingerprint, attempted_at desc)
  where not succeeded;
create index access_requests_org_status_idx
  on public.access_requests (organization_id, status, created_at desc);
create index rotation_rounds_session_idx
  on public.rotation_rounds (service_session_id, sequence);
create index table_rotation_entries_round_idx
  on public.table_rotation_entries (rotation_round_id, rotation_member_id);
create index board_events_session_idx
  on public.board_events (service_session_id, created_at desc);
create index tip_pools_location_date_idx
  on public.tip_pools (location_id, service_date desc);
create index tip_intervals_pool_time_idx
  on public.tip_intervals (tip_pool_id, starts_at);
create index tip_participants_profile_idx
  on public.tip_interval_participants (profile_id, tip_interval_id);
create index tip_allocations_profile_idx
  on public.tip_allocations (profile_id, tip_pool_id);

-- Integer cents plus a deterministic profile-id order guarantees that each
-- interval distributes exactly, including remainder cents.
create function public.recalculate_tip_pool(target_tip_pool_id bigint)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_org uuid;
begin
  select organization_id into target_org
  from public.tip_pools
  where id = target_tip_pool_id and status = 'draft';

  if target_org is null then
    raise exception 'Draft tip pool not found';
  end if;

  delete from public.tip_allocations
  where tip_pool_id = target_tip_pool_id;

  insert into public.tip_allocations (
    organization_id,
    tip_pool_id,
    profile_id,
    amount_cents
  )
  with ranked as (
    select
      interval.id as interval_id,
      participant.profile_id,
      interval.amount_cents,
      count(*) over (partition by interval.id) as participant_count,
      row_number() over (partition by interval.id order by participant.profile_id) as participant_rank
    from public.tip_intervals interval
    join public.tip_interval_participants participant
      on participant.tip_interval_id = interval.id
     and participant.organization_id = interval.organization_id
    where interval.tip_pool_id = target_tip_pool_id
  ), exact_shares as (
    select
      profile_id,
      (amount_cents / participant_count) +
      case when participant_rank <= (amount_cents % participant_count) then 1 else 0 end as share_cents
    from ranked
  )
  select target_org, target_tip_pool_id, profile_id, sum(share_cents)::integer
  from exact_shares
  group by profile_id;
end;
$$;

revoke all on function public.recalculate_tip_pool(bigint) from public, anon;
grant execute on function public.recalculate_tip_pool(bigint) to authenticated;

-- Browser-facing access is explicit. Credential lookup and login attempts are
-- server-only and therefore exposed only to the service role.
revoke all on table
  public.operating_hours,
  public.shift_kind_defaults,
  public.passcode_credentials,
  public.passcode_login_attempts,
  public.access_requests,
  public.rotation_rounds,
  public.table_rotation_entries,
  public.board_events,
  public.tip_pools,
  public.tip_intervals,
  public.tip_interval_participants,
  public.tip_allocations
from anon, authenticated;

grant select, insert, update, delete on public.operating_hours to authenticated;
grant select, insert, update, delete on public.shift_kind_defaults to authenticated;
grant select, update on public.access_requests to authenticated;
grant select, insert, update, delete on public.rotation_rounds to authenticated;
grant select, insert, update, delete on public.table_rotation_entries to authenticated;
grant select, insert, update on public.board_events to authenticated;
grant select, insert, update, delete on public.tip_pools to authenticated;
grant select, insert, update, delete on public.tip_intervals to authenticated;
grant select, insert, update, delete on public.tip_interval_participants to authenticated;
grant select, insert, update, delete on public.tip_allocations to authenticated;

grant all on table
  public.passcode_credentials,
  public.passcode_login_attempts,
  public.access_requests
to service_role;

revoke all on sequence
  public.operating_hours_id_seq,
  public.shift_kind_defaults_id_seq,
  public.passcode_credentials_id_seq,
  public.passcode_login_attempts_id_seq,
  public.access_requests_id_seq,
  public.rotation_rounds_id_seq,
  public.table_rotation_entries_id_seq,
  public.board_events_id_seq,
  public.tip_pools_id_seq,
  public.tip_intervals_id_seq,
  public.tip_allocations_id_seq
from anon, authenticated;

grant usage, select on sequence
  public.operating_hours_id_seq,
  public.shift_kind_defaults_id_seq,
  public.access_requests_id_seq,
  public.rotation_rounds_id_seq,
  public.table_rotation_entries_id_seq,
  public.board_events_id_seq,
  public.tip_pools_id_seq,
  public.tip_intervals_id_seq,
  public.tip_allocations_id_seq
to authenticated;

grant usage, select on sequence
  public.passcode_credentials_id_seq,
  public.passcode_login_attempts_id_seq,
  public.access_requests_id_seq
to service_role;

alter table public.operating_hours enable row level security;
alter table public.shift_kind_defaults enable row level security;
alter table public.passcode_credentials enable row level security;
alter table public.passcode_login_attempts enable row level security;
alter table public.access_requests enable row level security;
alter table public.rotation_rounds enable row level security;
alter table public.table_rotation_entries enable row level security;
alter table public.board_events enable row level security;
alter table public.tip_pools enable row level security;
alter table public.tip_intervals enable row level security;
alter table public.tip_interval_participants enable row level security;
alter table public.tip_allocations enable row level security;

-- Schedule drafts remain manager-only; all active members may see published
-- team schedules. These restrictive policies tighten the foundation policies.
create policy "schedule_periods_published_or_manager"
  on public.schedule_periods as restrictive for select to authenticated
  using (
    status = 'published' or
    (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[]))
  );

create policy "shifts_published_or_manager"
  on public.shifts as restrictive for select to authenticated
  using (
    exists (
      select 1 from public.schedule_periods period
      where period.id = schedule_period_id
        and period.organization_id = shifts.organization_id
        and (
          period.status = 'published' or
          (select private.has_org_role(shifts.organization_id, array['owner','general_manager','shift_manager']::public.app_role[]))
        )
    )
  );

create policy "shift_assignments_published_or_manager"
  on public.shift_assignments as restrictive for select to authenticated
  using (
    exists (
      select 1
      from public.shifts shift_row
      join public.schedule_periods period
        on period.id = shift_row.schedule_period_id
       and period.organization_id = shift_row.organization_id
      where shift_row.id = shift_id
        and shift_row.organization_id = shift_assignments.organization_id
        and (
          period.status = 'published' or
          (select private.has_org_role(shift_assignments.organization_id, array['owner','general_manager','shift_manager']::public.app_role[]))
        )
    )
  );

do $$
declare
  target_table text;
begin
  foreach target_table in array array['operating_hours', 'shift_kind_defaults']
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select private.has_org_role(organization_id, array[''owner'',''general_manager'',''shift_manager'',''host'',''server'']::public.app_role[])))',
      target_table || '_select_member',
      target_table
    );
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select private.has_org_role(organization_id, array[''owner'',''general_manager'',''shift_manager'']::public.app_role[]))) with check ((select private.has_org_role(organization_id, array[''owner'',''general_manager'',''shift_manager'']::public.app_role[])))',
      target_table || '_write_manager',
      target_table
    );
  end loop;
end;
$$;

create policy "access_requests_select_manager" on public.access_requests
  for select to authenticated
  using ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));
create policy "access_requests_update_manager" on public.access_requests
  for update to authenticated
  using ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])))
  with check ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));

do $$
declare
  target_table text;
begin
  foreach target_table in array array['rotation_rounds', 'table_rotation_entries', 'board_events']
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select private.has_org_role(organization_id, array[''owner'',''general_manager'',''shift_manager'',''host'',''server'']::public.app_role[])))',
      target_table || '_select_member',
      target_table
    );
  end loop;
end;
$$;

create policy "rotation_rounds_write_manager" on public.rotation_rounds
  for all to authenticated
  using ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])))
  with check ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));

create policy "table_rotation_entries_write_manager" on public.table_rotation_entries
  for all to authenticated
  using ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])))
  with check ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));

create policy "table_rotation_entries_write_own" on public.table_rotation_entries
  for all to authenticated
  using (
    assigned_by = (select auth.uid()) and exists (
      select 1 from public.rotation_members member
      where member.id = rotation_member_id
        and member.organization_id = table_rotation_entries.organization_id
        and member.server_profile_id = (select auth.uid())
        and member.status = 'active'
    )
  )
  with check (
    assigned_by = (select auth.uid()) and exists (
      select 1 from public.rotation_members member
      where member.id = rotation_member_id
        and member.organization_id = table_rotation_entries.organization_id
        and member.server_profile_id = (select auth.uid())
        and member.status = 'active'
    )
  );

create policy "board_events_insert_member" on public.board_events
  for insert to authenticated
  with check (
    actor_profile_id = (select auth.uid()) and
    (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager','host','server']::public.app_role[]))
  );
create policy "board_events_update_manager" on public.board_events
  for update to authenticated
  using ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])))
  with check ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'tip_intervals', 'tip_interval_participants', 'tip_allocations'
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

create policy "tip_pools_select_manager" on public.tip_pools
  for select to authenticated
  using ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));
create policy "tip_pools_insert_manager" on public.tip_pools
  for insert to authenticated
  with check (
    status = 'draft' and
    (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[]))
  );
create policy "tip_pools_update_draft_manager" on public.tip_pools
  for update to authenticated
  using (
    status = 'draft' and
    (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[]))
  )
  with check ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));
create policy "tip_pools_delete_draft_manager" on public.tip_pools
  for delete to authenticated
  using (
    status = 'draft' and
    (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[]))
  );

create policy "tip_intervals_update_draft_only" on public.tip_intervals
  as restrictive for update to authenticated
  using (
    exists (
      select 1 from public.tip_pools pool
      where pool.id = tip_pool_id
        and pool.organization_id = tip_intervals.organization_id
        and pool.status = 'draft'
    )
  )
  with check (
    exists (
      select 1 from public.tip_pools pool
      where pool.id = tip_pool_id
        and pool.organization_id = tip_intervals.organization_id
        and pool.status = 'draft'
    )
  );

create policy "tip_intervals_insert_draft_only" on public.tip_intervals
  as restrictive for insert to authenticated
  with check (
    exists (
      select 1 from public.tip_pools pool
      where pool.id = tip_pool_id
        and pool.organization_id = tip_intervals.organization_id
        and pool.status = 'draft'
    )
  );
create policy "tip_intervals_delete_draft_only" on public.tip_intervals
  as restrictive for delete to authenticated
  using (
    exists (
      select 1 from public.tip_pools pool
      where pool.id = tip_pool_id
        and pool.organization_id = tip_intervals.organization_id
        and pool.status = 'draft'
    )
  );

create policy "tip_participants_update_draft_only" on public.tip_interval_participants
  as restrictive for update to authenticated
  using (
    exists (
      select 1
      from public.tip_intervals interval
      join public.tip_pools pool
        on pool.id = interval.tip_pool_id
       and pool.organization_id = interval.organization_id
      where interval.id = tip_interval_id
        and interval.organization_id = tip_interval_participants.organization_id
        and pool.status = 'draft'
    )
  )
  with check (
    exists (
      select 1
      from public.tip_intervals interval
      join public.tip_pools pool
        on pool.id = interval.tip_pool_id
       and pool.organization_id = interval.organization_id
      where interval.id = tip_interval_id
        and interval.organization_id = tip_interval_participants.organization_id
        and pool.status = 'draft'
    )
  );

create policy "tip_participants_insert_draft_only" on public.tip_interval_participants
  as restrictive for insert to authenticated
  with check (
    exists (
      select 1
      from public.tip_intervals interval
      join public.tip_pools pool
        on pool.id = interval.tip_pool_id
       and pool.organization_id = interval.organization_id
      where interval.id = tip_interval_id
        and interval.organization_id = tip_interval_participants.organization_id
        and pool.status = 'draft'
    )
  );
create policy "tip_participants_delete_draft_only" on public.tip_interval_participants
  as restrictive for delete to authenticated
  using (
    exists (
      select 1
      from public.tip_intervals interval
      join public.tip_pools pool
        on pool.id = interval.tip_pool_id
       and pool.organization_id = interval.organization_id
      where interval.id = tip_interval_id
        and interval.organization_id = tip_interval_participants.organization_id
        and pool.status = 'draft'
    )
  );

create policy "tip_allocations_mutate_draft_only" on public.tip_allocations
  as restrictive for insert to authenticated
  with check (
    exists (
      select 1 from public.tip_pools pool
      where pool.id = tip_pool_id
        and pool.organization_id = tip_allocations.organization_id
        and pool.status = 'draft'
    )
  );
create policy "tip_allocations_update_draft_only" on public.tip_allocations
  as restrictive for update to authenticated
  using (
    exists (
      select 1 from public.tip_pools pool
      where pool.id = tip_pool_id
        and pool.organization_id = tip_allocations.organization_id
        and pool.status = 'draft'
    )
  )
  with check (
    exists (
      select 1 from public.tip_pools pool
      where pool.id = tip_pool_id
        and pool.organization_id = tip_allocations.organization_id
        and pool.status = 'draft'
    )
  );
create policy "tip_allocations_delete_draft_only" on public.tip_allocations
  as restrictive for delete to authenticated
  using (
    exists (
      select 1 from public.tip_pools pool
      where pool.id = tip_pool_id
        and pool.organization_id = tip_allocations.organization_id
        and pool.status = 'draft'
    )
  );

create policy "tip_allocations_select_own" on public.tip_allocations
  for select to authenticated
  using (
    profile_id = (select auth.uid()) and
    (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager','host','server']::public.app_role[]))
  );

alter publication supabase_realtime add table
  public.rotation_rounds,
  public.table_rotation_entries,
  public.board_events,
  public.tip_allocations;
