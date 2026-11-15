-- V2-009 B2 / F-2: direct Table Allocation rows follow the canonical
-- target-location board boundary. Existing permissive write-role policies
-- remain in force; these gates cannot create a new direct write capability.

create policy floor_templates_b2_location_gate on public.floor_templates
  as restrictive for all to authenticated
  using (private.can_operate_board(organization_id, location_id))
  with check (private.can_operate_board(organization_id, location_id));

create policy seatings_b2_location_gate on public.seatings
  as restrictive for all to authenticated
  using (private.can_operate_board(organization_id, location_id))
  with check (private.can_operate_board(organization_id, location_id));

-- A seating link has no location_id. Validate both linked records against the
-- stored parent location, including on INSERT and after an UPDATE. The
-- protected parent and table are read through their existing RLS policies;
-- no new SECURITY DEFINER helper is needed.
create policy seating_tables_b2_location_gate on public.seating_tables
  as restrictive for all to authenticated
  using (
    exists (
      select 1
      from public.seatings s
      join public.dining_tables dt
        on dt.id = seating_tables.dining_table_id
       and dt.organization_id = seating_tables.organization_id
       and dt.location_id = s.location_id
      where s.id = seating_tables.seating_id
        and s.organization_id = seating_tables.organization_id
        and private.can_operate_board(s.organization_id, s.location_id)
    )
  )
  with check (
    exists (
      select 1
      from public.seatings s
      join public.dining_tables dt
        on dt.id = seating_tables.dining_table_id
       and dt.organization_id = seating_tables.organization_id
       and dt.location_id = s.location_id
      where s.id = seating_tables.seating_id
        and s.organization_id = seating_tables.organization_id
        and private.can_operate_board(s.organization_id, s.location_id)
    )
  );

-- Overall roles already have canonical board-read authority at active,
-- non-archived target locations. Align only SELECT; do not add a permissive
-- INSERT, UPDATE or DELETE path. The restrictive gates above still apply.
create policy floor_templates_b2_overall_read on public.floor_templates
  for select to authenticated
  using (
    exists (
      select 1 from public.overall_roles o
      where o.profile_id = (select auth.uid())
        and o.role in ('owner', 'manager', 'assistant_manager')
    )
    and private.can_operate_board(organization_id, location_id)
  );

create policy seatings_b2_overall_read on public.seatings
  for select to authenticated
  using (
    exists (
      select 1 from public.overall_roles o
      where o.profile_id = (select auth.uid())
        and o.role in ('owner', 'manager', 'assistant_manager')
    )
    and private.can_operate_board(organization_id, location_id)
  );

create policy seating_tables_b2_overall_read on public.seating_tables
  for select to authenticated
  using (
    exists (
      select 1 from public.overall_roles o
      where o.profile_id = (select auth.uid())
        and o.role in ('owner', 'manager', 'assistant_manager')
    )
    and exists (
      select 1
      from public.seatings s
      join public.dining_tables dt
        on dt.id = seating_tables.dining_table_id
       and dt.organization_id = seating_tables.organization_id
       and dt.location_id = s.location_id
      where s.id = seating_tables.seating_id
        and s.organization_id = seating_tables.organization_id
        and private.can_operate_board(s.organization_id, s.location_id)
    )
  );

-- Assignment administration is distinct from operating the board. A valid
-- organization member can see their own (including revoked) assignment;
-- assigned floor staff see only their location roster. Owner/GM keep their
-- organization-wide administration view. Overall roles keep their existing
-- administrative visibility, including historical location assignments.
drop policy if exists location_memberships_select on public.location_memberships;
create policy location_memberships_select on public.location_memberships
  for select to authenticated
  using (
    exists (
      select 1
      from public.locations l
      where l.id = location_memberships.location_id
        and (
          exists (
            select 1 from public.overall_roles o
            where o.profile_id = (select auth.uid())
              and o.role in ('owner', 'manager', 'assistant_manager')
          )
          or (
            private.has_org_role(
              l.organization_id,
              array['owner', 'general_manager', 'shift_manager', 'host', 'server']::public.app_role[]
            )
            and (
              location_memberships.profile_id = (select auth.uid())
              or private.has_org_role(
                l.organization_id,
                array['owner', 'general_manager']::public.app_role[]
              )
              or private.can_operate_board(l.organization_id, l.id)
            )
          )
        )
    )
  );
