-- V2-008 Security Gate S1 / D-2 evidence probe (READ-ONLY EVIDENCE, NOT A TEST).
--
-- Measures, on the DISPOSABLE local stack, what each legacy org role can do in every
-- authorization function BEFORE a mapped `location_memberships` row exists, AFTER the
-- proposed D-2 row is added, and AFTER the organization later grows to two locations.
-- The whole file runs in one transaction and ends in ROLLBACK; nothing persists.
--
-- Proposed ladder (D-2): owner -> manager, general_manager -> manager,
--                        shift_manager -> assistant_manager, host -> staff, server -> staff.
-- Org roles are NEVER changed by the mapping; only a location row is added.
--
-- Output: rows (state, role, fn, value). The final SELECTs diff states.

begin;

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
select ('00000000-0000-0000-0000-0000000d20' || lpad(n::text, 2, '0'))::uuid, 'd2_' || n || '@test.internal', 'hash', now(), 'authenticated', 'authenticated'
from generate_series(1, 5) n;
insert into public.profiles (id, display_name)
select ('00000000-0000-0000-0000-0000000d20' || lpad(n::text, 2, '0'))::uuid, 'D2 ' || n from generate_series(1, 5) n;
insert into auth.sessions (id, user_id, created_at, updated_at, not_after)
select ('00000000-0000-0000-0000-0000000d20' || lpad(n::text, 2, '0'))::uuid, ('00000000-0000-0000-0000-0000000d20' || lpad(n::text, 2, '0'))::uuid, now(), now(), null
from generate_series(1, 5) n;

insert into public.organizations (id, name, slug, created_by, settings) values
  ('00000000-0000-0000-0000-0000000d2a01', 'D2 Org', 'd2-org', '00000000-0000-0000-0000-0000000d2001', '{}');
insert into public.memberships (organization_id, profile_id, roles, active) values
  ('00000000-0000-0000-0000-0000000d2a01', '00000000-0000-0000-0000-0000000d2001', array['owner']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000d2a01', '00000000-0000-0000-0000-0000000d2002', array['general_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000d2a01', '00000000-0000-0000-0000-0000000d2003', array['shift_manager']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000d2a01', '00000000-0000-0000-0000-0000000d2004', array['host']::public.app_role[], true),
  ('00000000-0000-0000-0000-0000000d2a01', '00000000-0000-0000-0000-0000000d2005', array['server']::public.app_role[], true);
insert into public.locations (id, organization_id, name, time_zone, address, active, archived_at) values
  ('00000000-0000-0000-0000-0000000d2b01', '00000000-0000-0000-0000-0000000d2a01', 'L1', 'America/Chicago', '{}', true, null);

create table snap (state text, role text, loc text, fn text, val text);
grant all on table snap to public;

create function t_as(p_uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim', '', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated', 'session_id', p_uid)::text, true);
end $$ language plpgsql;

create function rec(p_state text, p_role text, p_loc text, p_fn text, p_sql text) returns void as $$
declare r text;
begin
  begin execute 'select (' || p_sql || ')::text' into r;
  exception when others then r := 'ERR ' || sqlstate; end;
  insert into snap values (p_state, p_role, p_loc, p_fn, r);
end $$ language plpgsql;

create function take(p_state text, p_loc_label text, p_loc uuid) returns void as $$
declare
  o constant text := '00000000-0000-0000-0000-0000000d2a01';
  l text := p_loc::text;
  r record;
begin
  for r in select * from (values
      ('owner', '00000000-0000-0000-0000-0000000d2001'), ('general_manager', '00000000-0000-0000-0000-0000000d2002'),
      ('shift_manager', '00000000-0000-0000-0000-0000000d2003'), ('host', '00000000-0000-0000-0000-0000000d2004'),
      ('server', '00000000-0000-0000-0000-0000000d2005')) v(role, uid)
  loop
    -- explicit-profile level functions (run as postgres; no session needed)
    perform rec(p_state, r.role, p_loc_label, 'level:tasks',      format('private.tasks_profile_level(%L,%L,%L)', o, l, r.uid));
    perform rec(p_state, r.role, p_loc_label, 'level:tips',       format('private.tips_profile_level(%L,%L,%L)', o, l, r.uid));
    perform rec(p_state, r.role, p_loc_label, 'level:schedule',   format('private.schedule_profile_level(%L,%L,%L)', o, l, r.uid));
    perform rec(p_state, r.role, p_loc_label, 'level:payroll',    format('private.payroll_profile_level(%L,%L,%L)', o, l, r.uid));
    perform rec(p_state, r.role, p_loc_label, 'level:inventory',  format('private.inventory_profile_level(%L,%L,%L)', o, l, r.uid));
    perform rec(p_state, r.role, p_loc_label, 'level:attendance', format('private.attendance_profile_level(%L,%L,%L)', o, l, r.uid));
    -- caller-based predicates (run as the actor, live session)
    perform t_as(r.uid::uuid);
    set local role authenticated;
    perform rec(p_state, r.role, p_loc_label, 'recipes_is_manager(org)',   format('private.recipes_is_manager(%L)', o));
    perform rec(p_state, r.role, p_loc_label, 'inventory_is_manager(org)', format('private.inventory_is_manager(%L)', o));
    perform rec(p_state, r.role, p_loc_label, 'inventory_can_access',      format('private.inventory_can_access_location(%L,%L)', o, l));
    perform rec(p_state, r.role, p_loc_label, 'kiosk_can_manage',          format('private.kiosk_can_manage_location(%L)', l));
    perform rec(p_state, r.role, p_loc_label, 'can_operate_board',         format('private.can_operate_board(%L,%L)', o, l));
    perform rec(p_state, r.role, p_loc_label, 'tasks_is_manager',          format('private.tasks_is_manager(%L,%L)', o, l));
    perform rec(p_state, r.role, p_loc_label, 'tips_is_manager',           format('private.tips_is_manager(%L,%L)', o, l));
    perform rec(p_state, r.role, p_loc_label, 'schedule_is_manager',       format('private.schedule_is_manager(%L,%L)', o, l));
    perform rec(p_state, r.role, p_loc_label, 'payroll_can_manage',        format('private.payroll_can_manage_location(%L,%L)', o, l));
    perform rec(p_state, r.role, p_loc_label, 'attendance_can_manage',     format('private.attendance_can_manage_location(%L)', l));
    reset role;
  end loop;
end $$ language plpgsql;

-- State 1: legacy single-location fallback (NO location rows) -------------------
select take('1 BEFORE (N=1, no row)', 'L1', '00000000-0000-0000-0000-0000000d2b01');

-- State 2: the proposed D-2 rows are added ---------------------------------------
insert into public.location_memberships (location_id, profile_id, role, active) values
  ('00000000-0000-0000-0000-0000000d2b01', '00000000-0000-0000-0000-0000000d2001', 'manager', true),
  ('00000000-0000-0000-0000-0000000d2b01', '00000000-0000-0000-0000-0000000d2002', 'manager', true),
  ('00000000-0000-0000-0000-0000000d2b01', '00000000-0000-0000-0000-0000000d2003', 'assistant_manager', true),
  ('00000000-0000-0000-0000-0000000d2b01', '00000000-0000-0000-0000-0000000d2004', 'staff', true),
  ('00000000-0000-0000-0000-0000000d2b01', '00000000-0000-0000-0000-0000000d2005', 'staff', true);
select take('2 AFTER mapping (N=1)', 'L1', '00000000-0000-0000-0000-0000000d2b01');

-- State 3: the organization later grows to two locations (L2 unassigned) -----------
insert into public.locations (id, organization_id, name, time_zone, address, active, archived_at) values
  ('00000000-0000-0000-0000-0000000d2b02', '00000000-0000-0000-0000-0000000d2a01', 'L2', 'America/Chicago', '{}', true, null);
select take('3 AFTER mapping, org grew to N=2', 'L1', '00000000-0000-0000-0000-0000000d2b01');
select take('3 AFTER mapping, org grew to N=2', 'L2', '00000000-0000-0000-0000-0000000d2b02');

-- Reports ---------------------------------------------------------------------------
\echo '== A. Capability changes caused by the D-2 rows at N=1 (state 1 -> 2). Level functions are bucketed: 0 none / 1 staff / 2+ manager.'
with b as (select role, fn, case when fn like 'level:%' and val ~ '^[0-9]+$' then (case when val::int >= 2 then '2+' else val end) else val end v from snap where state like '1 %'),
     a as (select role, fn, case when fn like 'level:%' and val ~ '^[0-9]+$' then (case when val::int >= 2 then '2+' else val end) else val end v from snap where state like '2 %')
select 'CAPABILITY CHANGE' as kind, b.role, b.fn, b.v as before, a.v as after from b join a using (role, fn) where b.v is distinct from a.v order by 2, 3;
\echo '   (zero rows above = no capability gained or lost by any role in any function)'
\echo '== B. Raw level changes at N=1 (state 1 -> 2) - informational (owner 4 -> 3 under coalesce modules).'
select 'RAW LEVEL', b.role, b.fn, b.val as before, a.val as after
from snap b join snap a on a.role = b.role and a.fn = b.fn and a.state like '2 %' and b.state like '1 %'
where b.fn like 'level:%' and b.val is distinct from a.val order by 2, 3;
\echo '== C. After the org grows to N=2: what each mapped role holds at L1 (assigned) vs L2 (unassigned).'
select role, fn, max(val) filter (where loc = 'L1') as at_l1, max(val) filter (where loc = 'L2') as at_l2
from snap where state like '3 %' and (fn in ('recipes_is_manager(org)', 'inventory_is_manager(org)', 'level:inventory', 'level:schedule', 'kiosk_can_manage', 'inventory_can_access'))
group by role, fn order by 1, 2;
\echo '== D. Same org at N=2 WITHOUT any mapping row would give (state 1 shape, for comparison, recomputed):'
delete from public.location_memberships where location_id = '00000000-0000-0000-0000-0000000d2b01';
select take('4 NO rows, N=2', 'L1', '00000000-0000-0000-0000-0000000d2b01');
select role, fn, val as no_row_at_l1 from snap where state like '4 %' and fn in ('recipes_is_manager(org)', 'inventory_is_manager(org)', 'level:inventory', 'level:schedule') order by 1, 2;

rollback;
