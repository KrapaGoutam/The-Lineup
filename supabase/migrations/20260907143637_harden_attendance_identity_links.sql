-- Feature 019 follow-up. The initial table migration was already applied
-- before the implementation handoff, so these tenant-integrity, RLS, and
-- index corrections are intentionally forward-only rather than edits to
-- migration 20260907090000.

-- A link target and its actor must both be members of the organization on
-- the same row. Plain profile foreign keys prove that the identities exist,
-- but not that they belong to this tenant.
alter table public.attendance_identity_links
  drop constraint attendance_identity_links_profile_id_fkey,
  drop constraint attendance_identity_links_linked_by_fkey;

alter table public.attendance_identity_links
  add constraint attendance_identity_links_profile_member_fk
    foreign key (organization_id, profile_id)
    references public.memberships (organization_id, profile_id)
    on delete cascade,
  add constraint attendance_identity_links_linked_by_member_fk
    foreign key (organization_id, linked_by)
    references public.memberships (organization_id, profile_id);

-- The organization-leading unique keys cover organization lookups, but a
-- self-read policy starts from profile_id and the linked-by FK can be checked
-- from a profile deletion. Postgres does not add FK indexes automatically.
create index attendance_identity_links_profile_org_idx
  on public.attendance_identity_links (profile_id, organization_id);
create index attendance_identity_links_linked_by_org_idx
  on public.attendance_identity_links (linked_by, organization_id);

-- nextval() only needs USAGE. Do not grant sequence-value inspection.
revoke select on sequence public.attendance_identity_links_id_seq from authenticated;

drop policy "attendance_identity_links_select"
  on public.attendance_identity_links;
drop policy "attendance_identity_links_write_manager"
  on public.attendance_identity_links;

-- A regular person may read only their own row while they remain an active
-- member. Manager-tier members retain organization-wide read access.
create policy "attendance_identity_links_select"
  on public.attendance_identity_links
  for select
  to authenticated
  using (
    (
      profile_id = (select auth.uid())
      and (select private.has_org_role(
        organization_id,
        array['owner','general_manager','shift_manager','host','server']::public.app_role[]
      ))
    )
    or (select private.has_org_role(
      organization_id,
      array['owner','general_manager','shift_manager']::public.app_role[]
    ))
  );

-- Keep each write operation explicit. The same manager predicate applies to
-- all three operations, while UPDATE has both USING and WITH CHECK so a row
-- cannot be moved into another tenant after it is selected.
create policy "attendance_identity_links_insert_manager"
  on public.attendance_identity_links
  for insert
  to authenticated
  with check ((select private.has_org_role(
    organization_id,
    array['owner','general_manager','shift_manager']::public.app_role[]
  )));

create policy "attendance_identity_links_update_manager"
  on public.attendance_identity_links
  for update
  to authenticated
  using ((select private.has_org_role(
    organization_id,
    array['owner','general_manager','shift_manager']::public.app_role[]
  )))
  with check ((select private.has_org_role(
    organization_id,
    array['owner','general_manager','shift_manager']::public.app_role[]
  )));

create policy "attendance_identity_links_delete_manager"
  on public.attendance_identity_links
  for delete
  to authenticated
  using ((select private.has_org_role(
    organization_id,
    array['owner','general_manager','shift_manager']::public.app_role[]
  )));
