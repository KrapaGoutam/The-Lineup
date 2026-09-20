-- Table Rotation Upgrade 1.1, production parity fix: production has zero
-- dining_tables rows for this restaurant's only location. dining_tables
-- and dining_areas are not new -- both come from 20260905065702_initial_
-- schema.sql, already applied in production -- but nothing has ever
-- inserted rows into either for this location: no migration seeds
-- dining_tables, and there is no admin "configure your floor plan" UI
-- yet, so the table has stayed empty since the location was created.
-- That is the entire, confirmed cause of Floor/Picker/Servers rendering
-- no physical tables in production: the query
-- (getAllocationContext -> `dining_tables` filtered by location_id +
-- active) is correct and RLS already permits every org member to read
-- it -- there is simply nothing to return.
--
-- This backfills the same canonical, already-approved layout the app
-- already ships as DEMO_FLOOR_LAYOUT
-- (src/features/allocation/domain/floor-layout.ts): T1-T19 (dining
-- tables) + B1-B8 (bar seats), same label/position_x/position_y for
-- every row, so production renders pixel-identical to demo mode.
-- resourceType has no dedicated column (see allocation-data.ts's own
-- comment) -- it's inferred client-side from whether the owning
-- dining_areas.name matches /bar/i, so B1-B8 are inserted under a
-- dining area literally named 'Bar'.
--
-- A named, parameterized private function (not an inline anonymous
-- block) so pgTAP can exercise it directly -- call it twice against a
-- throwaway test organization to prove idempotency, and against two
-- different organizations to prove tenant isolation -- without ever
-- touching the real 'the-monks' org from a test. SECURITY INVOKER,
-- revoked from every client role below: it is only ever meant to be
-- run by the migration-applying role (or a test), never callable from
-- the browser/PostgREST.
create function private.seed_canonical_floor_layout(p_org_slug text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_location_id uuid;
  v_dining_area_id bigint;
  v_bar_area_id bigint;
begin
  select id into v_org_id
  from public.organizations
  where slug = p_org_slug;

  if v_org_id is null then
    return;
  end if;

  select id into v_location_id
  from public.locations
  where organization_id = v_org_id
  order by created_at
  limit 1;

  if v_location_id is null then
    return;
  end if;

  -- Scoped by organization slug and location, never a hardcoded UUID --
  -- this is a one-restaurant production data fix, not a template
  -- applied to every tenant. A future second real organization signing
  -- up must never automatically receive this specific restaurant's
  -- physical layout -- only the exact slug passed in below is ever
  -- touched.
  --
  -- Idempotent: both inserts target the existing
  -- dining_areas_location_id_name_key / dining_tables_location_id_label_key
  -- unique constraints with ON CONFLICT DO NOTHING, so calling this
  -- again, or a location that already has some/all of these rows
  -- (configured before or after this first ran), never duplicates or
  -- overwrites anything already there.
  insert into public.dining_areas (organization_id, location_id, name, area_order)
  values (v_org_id, v_location_id, 'Dining Room', 0)
  on conflict (location_id, name) do nothing;

  insert into public.dining_areas (organization_id, location_id, name, area_order)
  values (v_org_id, v_location_id, 'Bar', 1)
  on conflict (location_id, name) do nothing;

  select id into v_dining_area_id
  from public.dining_areas
  where location_id = v_location_id and name = 'Dining Room';

  select id into v_bar_area_id
  from public.dining_areas
  where location_id = v_location_id and name = 'Bar';

  -- T1-T19, same label/x/y as DEMO_FLOOR_LAYOUT.
  insert into public.dining_tables (
    organization_id, location_id, dining_area_id, label, seat_count, sequence, position_x, position_y, active
  )
  values
    (v_org_id, v_location_id, v_dining_area_id, 'T15', 4, 1, 22, 10, true),
    (v_org_id, v_location_id, v_dining_area_id, 'T16', 4, 2, 38, 10, true),
    (v_org_id, v_location_id, v_dining_area_id, 'T17', 4, 3, 54, 10, true),
    (v_org_id, v_location_id, v_dining_area_id, 'T18', 4, 4, 70, 10, true),
    (v_org_id, v_location_id, v_dining_area_id, 'T19', 4, 5, 86, 10, true),
    (v_org_id, v_location_id, v_dining_area_id, 'T14', 4, 6, 20, 34, true),
    (v_org_id, v_location_id, v_dining_area_id, 'T13', 4, 7, 34, 34, true),
    (v_org_id, v_location_id, v_dining_area_id, 'T12', 4, 8, 48, 34, true),
    (v_org_id, v_location_id, v_dining_area_id, 'T11', 4, 9, 62, 34, true),
    (v_org_id, v_location_id, v_dining_area_id, 'T10', 4, 10, 76, 34, true),
    (v_org_id, v_location_id, v_dining_area_id, 'T9', 4, 11, 90, 34, true),
    (v_org_id, v_location_id, v_dining_area_id, 'T6', 4, 12, 40, 56, true),
    (v_org_id, v_location_id, v_dining_area_id, 'T7', 4, 13, 55, 56, true),
    (v_org_id, v_location_id, v_dining_area_id, 'T8', 4, 14, 70, 56, true),
    (v_org_id, v_location_id, v_dining_area_id, 'T5', 4, 15, 8, 16, true),
    (v_org_id, v_location_id, v_dining_area_id, 'T4', 4, 16, 8, 30, true),
    (v_org_id, v_location_id, v_dining_area_id, 'T3', 4, 17, 8, 44, true),
    (v_org_id, v_location_id, v_dining_area_id, 'T2', 4, 18, 8, 58, true),
    (v_org_id, v_location_id, v_dining_area_id, 'T1', 4, 19, 8, 72, true)
  on conflict (location_id, label) do nothing;

  -- B1-B8 (bar seats), same label/x/y as DEMO_FLOOR_LAYOUT.
  insert into public.dining_tables (
    organization_id, location_id, dining_area_id, label, seat_count, sequence, position_x, position_y, active
  )
  values
    (v_org_id, v_location_id, v_bar_area_id, 'B1', 2, 1, 8, 90, true),
    (v_org_id, v_location_id, v_bar_area_id, 'B2', 2, 2, 19, 90, true),
    (v_org_id, v_location_id, v_bar_area_id, 'B3', 2, 3, 30, 90, true),
    (v_org_id, v_location_id, v_bar_area_id, 'B4', 2, 4, 41, 90, true),
    (v_org_id, v_location_id, v_bar_area_id, 'B5', 2, 5, 52, 90, true),
    (v_org_id, v_location_id, v_bar_area_id, 'B6', 2, 6, 63, 90, true),
    (v_org_id, v_location_id, v_bar_area_id, 'B7', 2, 7, 74, 90, true),
    (v_org_id, v_location_id, v_bar_area_id, 'B8', 2, 8, 85, 90, true)
  on conflict (location_id, label) do nothing;
end;
$$;

revoke all on function private.seed_canonical_floor_layout(text) from public, anon, authenticated;

-- Scoped to this specific, already-onboarded restaurant only -- see the
-- function's own comment. No-ops in every local/CI database (nothing
-- here ever seeds an organization with this slug).
select private.seed_canonical_floor_layout('the-monks');
