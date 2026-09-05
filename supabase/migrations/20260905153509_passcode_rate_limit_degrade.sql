-- Feature 006: four-digit passcodes tighten the per-fingerprint cap and add
-- an organization-wide signal that degrades instead of denying. A hard
-- organization-wide block is a cheap denial-of-service vector on its own
-- (a phone's public IP resets for free on reconnect, so one person can
-- present as many fingerprints) — see docs/features/006-four-digit-passcodes.md.

-- Serves the organization-wide failure count without scanning every
-- fingerprint's rows.
create index passcode_attempts_org_limit_idx
  on public.passcode_login_attempts (organization_id, attempted_at desc)
  where not succeeded;

-- Serves the "has this fingerprint succeeded recently" exemption check.
create index passcode_attempts_recent_success_idx
  on public.passcode_login_attempts (organization_id, fingerprint, attempted_at desc)
  where succeeded;

-- Append-only: a reset moves the organization-wide counting boundary
-- forward, it never deletes or edits passcode_login_attempts history.
create table public.passcode_lockout_resets (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  cleared_by uuid not null,
  reason text not null check (length(trim(reason)) between 3 and 500),
  cleared_at timestamptz not null default now(),
  foreign key (organization_id, cleared_by)
    references public.memberships (organization_id, profile_id)
);

create index passcode_lockout_resets_org_time_idx
  on public.passcode_lockout_resets (organization_id, cleared_at desc);

revoke all on table public.passcode_lockout_resets from anon, authenticated;
grant select, insert on public.passcode_lockout_resets to authenticated;

revoke all on sequence public.passcode_lockout_resets_id_seq from anon, authenticated;
grant usage, select on sequence public.passcode_lockout_resets_id_seq to authenticated;

alter table public.passcode_lockout_resets enable row level security;

-- Only a manager/owner may clear a lockout; read access is scoped to the
-- same manager roles since only they see the "Clear login lockout" control.
create policy "passcode_lockout_resets_select_manager" on public.passcode_lockout_resets
  for select to authenticated
  using ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));

create policy "passcode_lockout_resets_insert_manager" on public.passcode_lockout_resets
  for insert to authenticated
  with check (
    cleared_by = (select auth.uid()) and
    (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[]))
  );
