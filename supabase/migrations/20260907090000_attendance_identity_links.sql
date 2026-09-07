-- Feature 019: attendance identity links -- maps a signed-in Lineup
-- person (profiles.id) to the Neon attendance system's users.id, the
-- only mechanism this app ever uses to know "which Neon rows are this
-- person's own" (see docs/features/019-attendance-access-and-dashboard.md).
-- Deliberately never inferred by name -- Feature 018 already found real
-- duplicate/near-duplicate names in Neon's own data (two "Anil"s,
-- "Bhoomi"/"Bloomi"/"BHOOMII"), so matching by name would eventually
-- mislink someone to a stranger's hours (and, once payroll ships, a
-- stranger's pay). Every link is a deliberate, audited action by a
-- privileged member (owner/manager/assistant manager), set from the
-- Team tab -- never automatic.

create table public.attendance_identity_links (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  neon_user_id integer not null check (neon_user_id > 0),
  linked_by uuid not null references public.profiles (id),
  linked_at timestamptz not null default now(),
  -- One person, one Neon identity.
  unique (organization_id, profile_id),
  -- One Neon identity, one person -- prevents two Lineup accounts both
  -- claiming to be, say, "Anil": without this, they'd see each other's
  -- hours (and, once Feature 020 ships, each other's pay).
  unique (organization_id, neon_user_id)
);

comment on table public.attendance_identity_links is
  'Feature 019. Maps a Supabase profile to a Neon attendance users.id. Manager-set only, never inferred.';

revoke all on table public.attendance_identity_links from anon, authenticated;
grant select, insert, update, delete on public.attendance_identity_links to authenticated;

revoke all on sequence public.attendance_identity_links_id_seq from anon, authenticated;
grant usage, select on sequence public.attendance_identity_links_id_seq to authenticated;

alter table public.attendance_identity_links enable row level security;

-- A privileged member (owner/general_manager/shift_manager) reads every
-- row in their organization; a regular member reads only their own row
-- (to resolve their own attendance scope, or to know they have none) --
-- never anyone else's.
create policy "attendance_identity_links_select" on public.attendance_identity_links
  for select to authenticated
  using (
    (select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[]))
    or profile_id = (select auth.uid())
  );

-- Only a privileged member may create, change, or remove any link,
-- including their own -- a regular member can read their own row but
-- never write one. `for all` here also covers select for the privileged
-- branch, overlapping (harmlessly -- permissive policies OR together)
-- with the select policy above, which additionally covers self-select.
create policy "attendance_identity_links_write_manager" on public.attendance_identity_links
  for all to authenticated
  using ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])))
  with check ((select private.has_org_role(organization_id, array['owner','general_manager','shift_manager']::public.app_role[])));
