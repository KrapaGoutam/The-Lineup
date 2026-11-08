-- V2-005 Batch A: Schedule / Roster (.004) + Team / Settings (.008) + Tips Audit Integrity
-- Forward-only migration.
-- 1. Closes Tips direct-table audit bypass on tip_pools and audit_events.
-- 2. Scopes Schedule periods, shifts, templates, operating hours, shift defaults to verified active location.
-- 3. Provides public.schedule_location_roster RPC with workforce eligibility and historical coverage.
-- 4. Harmonizes memberships and profile management for Overall and Organization executive tiers.
begin;

-- =============================================================================
-- PART 1: TIPS AUDIT INTEGRITY (PRIORITY CORRECTION)
-- =============================================================================

-- Drop the direct reopen policy on tip_pools. Reopening MUST invoke public.tips_reopen_pool.
drop policy if exists "tip_pools_reopen_manager" on public.tip_pools;

-- Tighten tip_pools_update_draft_manager so direct UPDATE cannot finalize or tamper with finalization columns.
drop policy if exists "tip_pools_update_draft_manager" on public.tip_pools;
create policy "tip_pools_update_draft_manager" on public.tip_pools
  for update to authenticated
  using (
    status = 'draft' and
    private.tips_is_manager(organization_id, location_id)
  )
  with check (
    status = 'draft' and
    finalized_at is null and
    finalized_by is null and
    private.tips_is_manager(organization_id, location_id)
  );

-- =============================================================================
-- PART 2: SCHEDULE ATTRIBUTION FOREIGN KEY REPAIR
-- =============================================================================

-- Drop composite membership FK on schedule_periods.published_by so Overall administrators
-- without tenant memberships can publish schedules (published_by already references profiles(id)).
alter table public.schedule_periods
  drop constraint if exists schedule_publisher_member_fk;

create index if not exists schedule_periods_published_by_idx
  on public.schedule_periods (published_by) where published_by is not null;

-- =============================================================================
-- PART 3: SCHEDULE LOCATION AUTHORIZATION HELPERS
-- =============================================================================

-- 1. Helper: Determine if a profile is an eligible workforce member for a location.
create or replace function private.schedule_workforce_eligible(
  p_org uuid,
  p_location uuid,
  p_profile uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.locations l
    join public.memberships m
      on m.organization_id = l.organization_id
     and m.profile_id = p_profile
     and m.active
    where l.id = p_location
      and l.organization_id = p_org
      and l.active
      and l.archived_at is null
      and (
        exists (
          select 1
          from public.location_memberships lm
          where lm.location_id = l.id
            and lm.profile_id = p_profile
            and lm.active
        )
        or (
          (select count(*) from public.locations x
           where x.organization_id = p_org and x.active and x.archived_at is null) = 1
          and not exists (
            select 1 from public.location_memberships lm2
            join public.locations x2 on x2.id = lm2.location_id
            where x2.organization_id = p_org
          )
        )
      )
  );
$$;
revoke all on function private.schedule_workforce_eligible(uuid, uuid, uuid) from public, anon, authenticated;

-- 2. Helper: Canonical role tier resolution for a profile at a location.
-- 4 = Owner, 3 = Manager, 2 = Assistant Manager, 1 = Staff, 0 = None.
create or replace function private.schedule_profile_level(
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
  select case when exists (
    select 1 from public.locations l
    where l.id = p_location
      and l.organization_id = p_org
  ) then
    greatest(
      coalesce(
        (select case r.role
           when 'owner' then 4
           when 'manager' then 3
           else 2 end
         from public.overall_roles r
         where r.profile_id = p_profile),
        0
      ),
      case when exists (
        select 1 from public.memberships m
        where m.organization_id = p_org
          and m.profile_id = p_profile
          and m.active
      ) then
        coalesce(
          (select case lm.role
             when 'manager' then 3
             when 'assistant_manager' then 2
             else 1 end
           from public.location_memberships lm
           where lm.location_id = p_location
             and lm.profile_id = p_profile
             and lm.active),
          (select case
             when 'owner' = any(m.roles) then 4
             when 'general_manager' = any(m.roles) then 3
             when 'shift_manager' = any(m.roles) then 2
             else 1 end
           from public.memberships m
           where m.organization_id = p_org
             and m.profile_id = p_profile
             and m.active
             and (
               'owner' = any(m.roles)
               or 'general_manager' = any(m.roles)
               or (
                 (select count(*) from public.locations x
                  where x.organization_id = p_org and x.active and x.archived_at is null) = 1
                 and not exists (
                   select 1 from public.location_memberships lm2
                   join public.locations x2 on x2.id = lm2.location_id
                   where x2.organization_id = p_org
                 )
               )
             ))
        )
      else 0 end
    )
  else 0 end;
$$;
revoke all on function private.schedule_profile_level(uuid, uuid, uuid) from public, anon, authenticated;

-- 3. Helper: Check if caller has an active, unbanned Supabase session.
create or replace function private.schedule_live_session()
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
revoke all on function private.schedule_live_session() from public, anon, authenticated;

-- 4. Helper: Can access schedule at location (level > 0 and live session).
create or replace function private.schedule_can_access_location(
  p_organization_id uuid,
  p_location_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.schedule_live_session()
    and private.schedule_profile_level(p_organization_id, p_location_id, (select auth.uid())) > 0;
$$;
revoke all on function private.schedule_can_access_location(uuid, uuid) from public, anon;
grant execute on function private.schedule_can_access_location(uuid, uuid) to authenticated;

-- 5. Helper: Is schedule manager at location (level >= 2 and live session).
create or replace function private.schedule_is_manager(
  p_organization_id uuid,
  p_location_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.schedule_live_session()
    and private.schedule_profile_level(p_organization_id, p_location_id, (select auth.uid())) >= 2;
$$;
revoke all on function private.schedule_is_manager(uuid, uuid) from public, anon;
grant execute on function private.schedule_is_manager(uuid, uuid) to authenticated;

-- 6. Helper: Public authority check RPC for client verification and Preview readiness.
create or replace function public.schedule_location_authorized(
  p_organization_id uuid,
  p_location_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.schedule_can_access_location(p_organization_id, p_location_id);
$$;
revoke all on function public.schedule_location_authorized(uuid, uuid) from public, anon;
grant execute on function public.schedule_location_authorized(uuid, uuid) to authenticated;

-- 7. Helper: Shift assignment access and write validation.
create or replace function private.shift_assignment_can_access(
  p_org uuid,
  p_shift_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.shifts s
    where s.id = p_shift_id
      and s.organization_id = p_org
      and private.schedule_can_access_location(s.organization_id, s.location_id)
  );
$$;
revoke all on function private.shift_assignment_can_access(uuid, bigint) from public, anon;
grant execute on function private.shift_assignment_can_access(uuid, bigint) to authenticated;

create or replace function private.shift_assignment_can_write(
  p_org uuid,
  p_shift_id bigint,
  p_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.shifts s
    where s.id = p_shift_id
      and s.organization_id = p_org
      and private.schedule_is_manager(s.organization_id, s.location_id)
      and private.schedule_workforce_eligible(s.organization_id, s.location_id, p_profile_id)
  );
$$;
revoke all on function private.shift_assignment_can_write(uuid, bigint, uuid) from public, anon;
grant execute on function private.shift_assignment_can_write(uuid, bigint, uuid) to authenticated;

-- =============================================================================
-- PART 4: AUDIT EVENTS LOCATION POLICIES UPDATE
-- =============================================================================

drop policy if exists "audit_events_insert_operator" on public.audit_events;
create policy "audit_events_insert_operator" on public.audit_events
  for insert to authenticated
  with check (
    actor_profile_id = (select auth.uid())
    and entity_type <> 'tip_pool'
    and (
      (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager','host']::public.app_role[]))
      or (
        entity_type in ('schedule_period', 'shift', 'operating_hours', 'shift_kind_defaults')
        and location_id is not null
        and private.schedule_is_manager(organization_id, location_id)
      )
    )
  );

drop policy if exists "audit_events_select_manager" on public.audit_events;
create policy "audit_events_select_manager" on public.audit_events
  for select to authenticated
  using (
    (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[]))
    or (
      entity_type = 'tip_pool'
      and location_id is not null
      and private.tips_is_manager(organization_id, location_id)
    )
    or (
      entity_type in ('schedule_period', 'shift', 'operating_hours', 'shift_kind_defaults')
      and location_id is not null
      and private.schedule_is_manager(organization_id, location_id)
    )
  );

-- =============================================================================
-- PART 5: PUBLIC LOCATION ROSTER RPC FOR SCHEDULE
-- =============================================================================

drop function if exists public.schedule_location_roster(uuid, uuid);
create function public.schedule_location_roster(
  p_organization_id uuid,
  p_location_id uuid
)
returns table(
  profile_id uuid,
  display_name text,
  roles public.app_role[],
  active boolean,
  eligible boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
begin
  if p_location_id is null or not private.schedule_can_access_location(p_organization_id, p_location_id) then
    raise exception 'You do not have access to schedule for this location.' using errcode = '42501';
  end if;
  perform private.assert_location_module_enabled(p_location_id, 'schedule');

  return query
  with roster_profiles as (
    -- 1. Organization members affiliated with the location or historically assigned to shifts
    select m.profile_id, p.display_name, m.roles, m.active, m.created_at
    from public.memberships m
    join public.profiles p on p.id = m.profile_id
    where m.organization_id = p_organization_id
      and (
        exists (
          select 1 from public.location_memberships lm
          where lm.location_id = p_location_id
            and lm.profile_id = m.profile_id
            and lm.active
        )
        or exists (
          select 1 from public.shift_assignments sa
          join public.shifts sh on sh.id = sa.shift_id
          where sa.profile_id = m.profile_id
            and sh.location_id = p_location_id
            and sh.organization_id = p_organization_id
        )
        or exists (
          select 1 from public.schedule_periods sp
          where sp.published_by = m.profile_id
            and sp.location_id = p_location_id
            and sp.organization_id = p_organization_id
        )
        or exists (
          select 1 from public.audit_events ae
          where ae.actor_profile_id = m.profile_id
            and ae.location_id = p_location_id
            and ae.organization_id = p_organization_id
            and ae.entity_type in ('schedule_period', 'shift')
        )
        or (
          (select count(*) from public.locations l
           where l.organization_id = p_organization_id and l.active and l.archived_at is null) = 1
          and not exists (
            select 1 from public.location_memberships lm
            join public.locations l on l.id = lm.location_id
            where l.organization_id = p_organization_id
          )
        )
      )
    union
    -- 2. Overall actors who published schedules or acted in schedule audit events
    select p.id as profile_id, p.display_name, array[]::public.app_role[] as roles, true as active, p.created_at
    from public.profiles p
    where (
      exists (
        select 1 from public.schedule_periods sp
        where sp.published_by = p.id
          and sp.location_id = p_location_id
          and sp.organization_id = p_organization_id
      )
      or exists (
        select 1 from public.audit_events ae
        where ae.actor_profile_id = p.id
          and ae.location_id = p_location_id
          and ae.organization_id = p_organization_id
          and ae.entity_type in ('schedule_period', 'shift')
      )
    )
    and not exists (
      select 1 from public.memberships m
      where m.organization_id = p_organization_id and m.profile_id = p.id
    )
  )
  select
    r.profile_id,
    r.display_name,
    r.roles,
    r.active,
    private.schedule_workforce_eligible(p_organization_id, p_location_id, r.profile_id) as eligible
  from roster_profiles r
  order by r.created_at, r.profile_id;
end;
$$;
revoke all on function public.schedule_location_roster(uuid, uuid) from public, anon;
grant execute on function public.schedule_location_roster(uuid, uuid) to authenticated;

-- =============================================================================
-- PART 6: SCHEDULE & SETTINGS RLS POLICIES
-- =============================================================================

-- 1. operating_hours
drop policy if exists "operating_hours_select_member" on public.operating_hours;
drop policy if exists "operating_hours_write_manager" on public.operating_hours;

create policy "operating_hours_select" on public.operating_hours
  for select to authenticated
  using (private.schedule_can_access_location(organization_id, location_id));

create policy "operating_hours_write_manager" on public.operating_hours
  for all to authenticated
  using (private.schedule_is_manager(organization_id, location_id))
  with check (private.schedule_is_manager(organization_id, location_id));

-- 2. shift_kind_defaults
drop policy if exists "shift_kind_defaults_select_member" on public.shift_kind_defaults;
drop policy if exists "shift_kind_defaults_write_manager" on public.shift_kind_defaults;

create policy "shift_kind_defaults_select" on public.shift_kind_defaults
  for select to authenticated
  using (private.schedule_can_access_location(organization_id, location_id));

create policy "shift_kind_defaults_write_manager" on public.shift_kind_defaults
  for all to authenticated
  using (private.schedule_is_manager(organization_id, location_id))
  with check (private.schedule_is_manager(organization_id, location_id));

-- 3. shift_templates
drop policy if exists "shift_templates_select_member" on public.shift_templates;
drop policy if exists "shift_templates_write_manager" on public.shift_templates;

create policy "shift_templates_select" on public.shift_templates
  for select to authenticated
  using (private.schedule_can_access_location(organization_id, location_id));

create policy "shift_templates_write_manager" on public.shift_templates
  for all to authenticated
  using (private.schedule_is_manager(organization_id, location_id))
  with check (private.schedule_is_manager(organization_id, location_id));

-- 4. schedule_periods
drop policy if exists "schedule_periods_select_member" on public.schedule_periods;
drop policy if exists "schedule_periods_write_manager" on public.schedule_periods;
drop policy if exists "schedule_periods_published_or_manager" on public.schedule_periods;

create policy "schedule_periods_select" on public.schedule_periods
  for select to authenticated
  using (private.schedule_can_access_location(organization_id, location_id));

create policy "schedule_periods_published_or_manager" on public.schedule_periods
  as restrictive for select to authenticated
  using (
    status = 'published'
    or private.schedule_is_manager(organization_id, location_id)
  );

create policy "schedule_periods_write_manager" on public.schedule_periods
  for all to authenticated
  using (private.schedule_is_manager(organization_id, location_id))
  with check (private.schedule_is_manager(organization_id, location_id));

-- 5. shifts
drop policy if exists "shifts_select_member" on public.shifts;
drop policy if exists "shifts_write_manager" on public.shifts;
drop policy if exists "shifts_published_or_manager" on public.shifts;

create policy "shifts_select" on public.shifts
  for select to authenticated
  using (private.schedule_can_access_location(organization_id, location_id));

create policy "shifts_published_or_manager" on public.shifts
  as restrictive for select to authenticated
  using (
    exists (
      select 1 from public.schedule_periods period
      where period.id = schedule_period_id
        and period.organization_id = shifts.organization_id
        and (
          period.status = 'published'
          or private.schedule_is_manager(shifts.organization_id, shifts.location_id)
        )
    )
  );

create policy "shifts_write_manager" on public.shifts
  for all to authenticated
  using (private.schedule_is_manager(organization_id, location_id))
  with check (private.schedule_is_manager(organization_id, location_id));

-- 6. shift_assignments
drop policy if exists "shift_assignments_select_member" on public.shift_assignments;
drop policy if exists "shift_assignments_write_manager" on public.shift_assignments;
drop policy if exists "shift_assignments_published_or_manager" on public.shift_assignments;

create policy "shift_assignments_select" on public.shift_assignments
  for select to authenticated
  using (private.shift_assignment_can_access(organization_id, shift_id));

create policy "shift_assignments_published_or_manager" on public.shift_assignments
  as restrictive for select to authenticated
  using (
    exists (
      select 1
      from public.shifts s
      join public.schedule_periods period on period.id = s.schedule_period_id
      where s.id = shift_id
        and s.organization_id = shift_assignments.organization_id
        and (
          period.status = 'published'
          or private.schedule_is_manager(s.organization_id, s.location_id)
        )
    )
  );

create policy "shift_assignments_insert_manager" on public.shift_assignments
  for insert to authenticated
  with check (private.shift_assignment_can_write(organization_id, shift_id, profile_id));

create policy "shift_assignments_update_manager" on public.shift_assignments
  for update to authenticated
  using (
    exists (
      select 1 from public.shifts s
      where s.id = shift_id
        and s.organization_id = shift_assignments.organization_id
        and private.schedule_is_manager(s.organization_id, s.location_id)
    )
  )
  with check (private.shift_assignment_can_write(organization_id, shift_id, profile_id));

create policy "shift_assignments_delete_manager" on public.shift_assignments
  for delete to authenticated
  using (
    exists (
      select 1 from public.shifts s
      where s.id = shift_id
        and s.organization_id = shift_assignments.organization_id
        and private.schedule_is_manager(s.organization_id, s.location_id)
    )
  );

-- =============================================================================
-- PART 7: TEAM & PROFILES MANAGEMENT HARMONIZATION
-- =============================================================================

-- 1. private.can_view_profile admits Overall roles
create or replace function private.can_view_profile(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_profile_id = (select auth.uid())
    or exists (
      select 1 from public.overall_roles
      where profile_id = (select auth.uid())
    )
    or exists (
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

-- 2. private.can_manage_member admits Overall Owner and Manager
create or replace function private.can_manage_member(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships target
    where target.profile_id = target_profile_id
      and target.active
      and (
        exists (
          select 1 from public.overall_roles r
          where r.profile_id = (select auth.uid())
            and r.role = 'owner'
        )
        or (
          exists (
            select 1 from public.overall_roles r
            where r.profile_id = (select auth.uid())
              and r.role = 'manager'
          )
          and not (target.roles && array['owner', 'general_manager']::public.app_role[])
        )
        or (
          (select private.has_org_role(target.organization_id, array['owner']::public.app_role[]))
        )
        or (
          (select private.has_org_role(target.organization_id, array['general_manager']::public.app_role[]))
          and not (target.roles && array['owner', 'general_manager']::public.app_role[])
        )
      )
  );
$$;

-- 3. memberships RLS policies: admit Overall roles while preserving tenant isolation
drop policy if exists "memberships_select_member" on public.memberships;
create policy "memberships_select_member" on public.memberships
  for select to authenticated
  using (
    exists (
      select 1 from public.overall_roles
      where profile_id = (select auth.uid())
    )
    or (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager','host','server']::public.app_role[]))
  );

drop policy if exists "memberships_insert_manager" on public.memberships;
create policy "memberships_insert_manager" on public.memberships
  for insert to authenticated
  with check (
    exists (
      select 1 from public.overall_roles r
      where r.profile_id = (select auth.uid())
        and r.role = 'owner'
    ) or
    (
      exists (
        select 1 from public.overall_roles r
        where r.profile_id = (select auth.uid())
          and r.role = 'manager'
      ) and not (roles && array['owner', 'general_manager']::public.app_role[])
    ) or
    (select private.has_org_role(organization_id, array['owner']::public.app_role[])) or
    (
      (select private.has_org_role(organization_id, array['general_manager']::public.app_role[])) and
      not (roles && array['owner','general_manager']::public.app_role[])
    )
  );

drop policy if exists "memberships_update_manager" on public.memberships;
create policy "memberships_update_manager" on public.memberships
  for update to authenticated
  using (
    exists (
      select 1 from public.overall_roles r
      where r.profile_id = (select auth.uid())
        and r.role = 'owner'
    ) or
    (
      exists (
        select 1 from public.overall_roles r
        where r.profile_id = (select auth.uid())
          and r.role = 'manager'
      ) and not (roles && array['owner', 'general_manager']::public.app_role[])
    ) or
    (select private.has_org_role(organization_id, array['owner']::public.app_role[])) or
    (
      (select private.has_org_role(organization_id, array['general_manager']::public.app_role[])) and
      not (roles && array['owner','general_manager']::public.app_role[])
    )
  )
  with check (
    exists (
      select 1 from public.overall_roles r
      where r.profile_id = (select auth.uid())
        and r.role = 'owner'
    ) or
    (
      exists (
        select 1 from public.overall_roles r
        where r.profile_id = (select auth.uid())
          and r.role = 'manager'
      ) and not (roles && array['owner', 'general_manager']::public.app_role[])
    ) or
    (select private.has_org_role(organization_id, array['owner']::public.app_role[])) or
    (
      (select private.has_org_role(organization_id, array['general_manager']::public.app_role[])) and
      not (roles && array['owner','general_manager']::public.app_role[])
    )
  );

drop policy if exists "memberships_delete_manager" on public.memberships;
create policy "memberships_delete_manager" on public.memberships
  for delete to authenticated
  using (
    exists (
      select 1 from public.overall_roles r
      where r.profile_id = (select auth.uid())
        and r.role = 'owner'
    ) or
    (
      exists (
        select 1 from public.overall_roles r
        where r.profile_id = (select auth.uid())
          and r.role = 'manager'
      ) and not (roles && array['owner', 'general_manager']::public.app_role[])
    ) or
    (select private.has_org_role(organization_id, array['owner']::public.app_role[])) or
    (
      (select private.has_org_role(organization_id, array['general_manager']::public.app_role[])) and
      not (roles && array['owner','general_manager']::public.app_role[])
    )
  );

commit;
