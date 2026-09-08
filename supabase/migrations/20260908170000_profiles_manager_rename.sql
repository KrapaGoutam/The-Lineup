-- Feature 024: lets a manager/owner rename a fellow organization member's
-- display name from the Team panel. `profiles` currently has only
-- `profiles_update_self` (id = auth.uid()) -- nothing lets an actor touch
-- a different member's row. This adds one new, additive UPDATE policy;
-- profiles_update_self is untouched, so self-rename still works exactly
-- as before (Postgres RLS policies of the same command are OR'd).
--
-- Authorization mirrors `memberships_update_manager`'s exact hierarchy
-- (see 20260905065702_initial_schema.sql): owner unrestricted; a
-- general_manager may act only on a target whose current roles don't
-- include owner or general_manager; shift_manager/host/server get no
-- membership-write capability here either, same as that policy. `profiles`
-- has no organization_id column of its own, so this finds the target's
-- (active) membership row first, then delegates the actor-side check to
-- `private.has_org_role` against that row's organization -- reusing it
-- rather than re-deriving the actor check keeps the org-creator bypass
-- `has_org_role` already has (see 0008_member_deactivation.test.sql)
-- consistent here too, instead of silently losing it in a hand-rolled
-- join. A deactivated target is refused entirely, matching every other
-- personnel action in this app (see designations.ts's own note: "a
-- deactivated member gets no other action").
create function private.can_manage_member(target_profile_id uuid)
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
        (select private.has_org_role(target.organization_id, array['owner']::public.app_role[]))
        or (
          (select private.has_org_role(target.organization_id, array['general_manager']::public.app_role[]))
          and not (target.roles && array['owner', 'general_manager']::public.app_role[])
        )
      )
  );
$$;

revoke all on function private.can_manage_member(uuid) from public, anon;
grant execute on function private.can_manage_member(uuid) to authenticated;

create policy "profiles_update_manager" on public.profiles for update to authenticated
  using ((select private.can_manage_member(id)))
  with check ((select private.can_manage_member(id)));
