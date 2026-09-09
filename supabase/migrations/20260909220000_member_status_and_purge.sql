-- Features 034/035: Team Status Categorization & Inactive Member
-- Permanent Purge.
--
-- Feature 034 (active/inactive tabs on the Team page) needs no new
-- schema -- memberships.active has existed since the very first
-- migration, and getOrganizationRoster()/TeamWorkspace already surface
-- it. This migration adds only the one thing that feature's own spec
-- asked for and didn't already exist: an index shaped for "list active/
-- inactive members of org X" (the existing
-- memberships_profile_org_idx is (profile_id, organization_id) where
-- active -- the opposite leading column, tuned for a different access
-- pattern).
create index memberships_org_active_idx
  on public.memberships (organization_id, active);

-- Real, pre-existing bug found live-testing this feature, not something
-- either feature's own spec asked for: `private.can_view_profile`
-- (20260905065702_initial_schema.sql) requires BOTH the viewer's AND
-- the TARGET's membership to be `active` before `profiles_select_shared_org`
-- lets anyone read that profile's display_name. Confirmed directly
-- against this local database: an owner querying a deactivated
-- colleague's name back through `memberships` joined to `profiles` --
-- exactly the shape `getOrganizationRoster()` (src/features/team/data/roster.ts)
-- already runs today -- gets `display_name: null` back, silently
-- falling through to that function's own "Unknown" fallback. Feature
-- 034's whole premise is an Inactive tab that shows *who* is inactive
-- by name; this bug means it would show "Unknown" for every row in it,
-- and likely already makes every deactivated member's name show as
-- "Unknown" in today's live Team tab too (untested by Feature 017/024's
-- own pgTAP suites, which never seeded a genuinely deactivated target
-- and then re-queried their name back through this exact join).
--
-- Fix: drop the `target.active` half of the predicate. `viewer.active`
-- stays -- a deactivated person still shouldn't be able to see anyone
-- else's profile, consistent with "memberships.active blocks everything"
-- -- but another org member's own active/inactive/purged status should
-- never have gated whether their NAME is visible to their own
-- manager/owner in the first place. This also means a purged member's
-- profile (display_name = 'Deleted User' after `purge_inactive_member`
-- below) stays visible rather than reverting to "Unknown", so the UI
-- can render that scrubbed name correctly.
create or replace function private.can_view_profile(target_profile_id uuid)
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
    where viewer.profile_id = (select auth.uid())
      and viewer.active
  );
$$;

-- Feature 035: "permanent purge" does NOT mean a hard DELETE of the
-- memberships row. Every FK from real operational history to
-- memberships (shift_assignments, availability_rules, time_off_requests,
-- rotation_members, section_assignments, seatings, tip_interval_participants,
-- tip_allocations, audit_events' actor, payroll's various *_by columns)
-- is NO ACTION/RESTRICT, not CASCADE -- deliberately, per Feature 017's
-- own build notes, specifically so deactivation would never orphan that
-- history. A literal `delete from memberships` would fail immediately
-- for any member with real activity, and attendance/payroll live in a
-- wholly separate Neon database this migration can't reach at all.
--
-- So "purge" here means: irreversibly scrub the person's PII (their
-- profiles.display_name/avatar_url, and the original contact info they
-- submitted at registration) while leaving every row that references
-- them fully intact for referential and financial integrity -- a
-- GDPR-style "right to erasure," not a hard delete. `purged_at`/
-- `purged_by` mark the membership as permanently, irreversibly purged
-- (distinct from merely `active = false`) so the UI can show a third
-- state and refuse to offer this action twice.
alter table public.memberships
  add column purged_at timestamptz,
  add column purged_by uuid references public.profiles (id) on delete set null;

-- Authorization for purge mirrors `private.can_manage_member`
-- (20260908170000_profiles_manager_rename.sql) almost exactly --
-- same owner/general_manager hierarchy, same "derive the org from the
-- target's own membership row" approach (profiles has no
-- organization_id of its own) -- with the one condition flipped: purge
-- requires the target to currently be INACTIVE (can_manage_member
-- requires the opposite, active, since every OTHER personnel action
-- refuses a deactivated target). Also refuses an already-purged target,
-- making the underlying RPC naturally idempotent-safe against a
-- double-click or a retried request.
create function private.can_purge_member(target_profile_id uuid)
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
      and not target.active
      and target.purged_at is null
      and (
        (select private.has_org_role(target.organization_id, array['owner']::public.app_role[]))
        or (
          (select private.has_org_role(target.organization_id, array['general_manager']::public.app_role[]))
          and not (target.roles && array['owner', 'general_manager']::public.app_role[])
        )
      )
  );
$$;

revoke all on function private.can_purge_member(uuid) from public, anon;
grant execute on function private.can_purge_member(uuid) to authenticated;

-- The actual purge. SECURITY DEFINER for two independent reasons, not
-- just atomicity: (1) genuine single-transaction atomicity across three
-- table writes plus the audit row, matching this schema's established
-- "one RPC per atomic multi-write action" pattern (board_assign and
-- friends, 20260906140000_allocation_board_rpcs.sql); (2)
-- `registrations` has UPDATE revoked from `authenticated` entirely
-- (20260905163719_self_serve_registration.sql -- "no more accept/
-- decline action"), so a plain SECURITY INVOKER caller could not
-- anonymize that table's contact info under any circumstance, elevated
-- privileges are structurally required, not just convenient.
--
-- The membership-count guard exists because `profiles.display_name`/
-- `avatar_url` are single global columns, not one-per-membership --
-- this schema allows the same person (profile) to hold memberships in
-- more than one organization. Scrubbing their name here would also
-- blank their identity in any OTHER org they belong to, which this
-- org's manager has no authority over and the purging manager likely
-- doesn't even know exists. Refusing outright when a second membership
-- row exists anywhere is the conservative choice -- there is no
-- per-membership display name in the current data model to scrub
-- instead.
create function public.purge_inactive_member(
  p_organization_id uuid,
  p_target_profile_id uuid,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership_count int;
  v_display_name_before text;
begin
  if p_target_profile_id = (select auth.uid()) then
    raise exception 'You cannot purge your own account.';
  end if;

  if not private.can_purge_member(p_target_profile_id) then
    raise exception 'You are not authorized to purge this member, they are not currently inactive, or they have already been purged.';
  end if;

  -- Defense in depth: can_purge_member authorizes against whichever
  -- org the target's (inactive, unpurged) membership row happens to
  -- belong to -- it never looks at p_organization_id at all. This pins
  -- the actual write to the caller's claimed organization explicitly,
  -- so a caller cannot purge a real target while passing a stray or
  -- mismatched organization id.
  if not exists (
    select 1 from public.memberships
    where organization_id = p_organization_id
      and profile_id = p_target_profile_id
      and not active
      and purged_at is null
  ) then
    raise exception 'That person is not an inactive, unpurged member of this organization.';
  end if;

  select count(*) into v_membership_count
  from public.memberships
  where profile_id = p_target_profile_id;

  if v_membership_count > 1 then
    raise exception 'This person belongs to more than one organization and cannot be purged from here.';
  end if;

  select display_name into v_display_name_before
  from public.profiles
  where id = p_target_profile_id;

  update public.profiles
  set display_name = 'Deleted User',
      avatar_url = null,
      updated_at = now()
  where id = p_target_profile_id;

  -- The self-serve registration log (renamed from access_requests) is
  -- append-only by product design, but it stores the raw display
  -- name/contact the person originally typed in -- a genuine erasure
  -- has to reach this too, not just the live profiles row.
  update public.registrations
  set display_name = 'Deleted User',
      contact = null
  where profile_id = p_target_profile_id;

  update public.memberships
  set purged_at = now(),
      purged_by = (select auth.uid())
  where organization_id = p_organization_id
    and profile_id = p_target_profile_id;

  insert into public.audit_events (
    organization_id, actor_profile_id, action, entity_type, entity_id,
    before_state, after_state, reason
  )
  values (
    p_organization_id,
    (select auth.uid()),
    'member_purged',
    'membership',
    p_target_profile_id::text,
    jsonb_build_object('display_name', v_display_name_before),
    jsonb_build_object('display_name', 'Deleted User', 'purged', true),
    p_reason
  );
end;
$$;

revoke all on function public.purge_inactive_member(uuid, uuid, text) from public, anon;
grant execute on function public.purge_inactive_member(uuid, uuid, text) to authenticated;
