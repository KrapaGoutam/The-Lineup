-- Feature 005: self-serve registration replaces manager-reviewed access
-- requests. `access_requests` is renamed and repurposed as an append-only
-- registration log rather than dropped — a self-serve account-creation path
-- is exactly the kind of security-sensitive action worth an audit trail.
-- See docs/features/005-self-serve-registration.md.

-- The table's original foreign-key constraints were left unnamed at
-- creation (Postgres auto-generated their names) and are not renamed here —
-- guessing an exact auto-generated name in a migration is a real way to
-- write one that fails to apply. They keep cosmetically referencing
-- "access_requests" internally; this has no functional or security effect.
alter table public.access_requests rename to registrations;

alter table public.registrations
  add column profile_id uuid references public.profiles (id) on delete set null,
  add column self_served boolean not null default true;

-- Registration is no longer a pending-review queue: there is no more
-- accept/decline action for a manager to perform through the app.
revoke update on public.registrations from authenticated;

alter index access_requests_org_status_idx rename to registrations_org_status_idx;

drop policy "access_requests_select_manager" on public.registrations;
drop policy "access_requests_update_manager" on public.registrations;

create policy "registrations_select_manager" on public.registrations
  for select to authenticated
  using ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));
