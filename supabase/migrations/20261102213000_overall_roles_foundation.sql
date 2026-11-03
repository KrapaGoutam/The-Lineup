-- Subfeature V2-001.001: Overall Roles Foundation
-- Canonical storage and security model for platform-wide overall roles.
-- Roles apply system-wide to the authenticated person/profile.
-- No organization or location scope.
-- Direct client writes are rejected by RLS (no self-promotion, fail-closed).

create type public.overall_role as enum (
  'owner',
  'manager',
  'assistant_manager'
);

create table public.overall_roles (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role public.overall_role not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint overall_roles_profile_id_key unique (profile_id)
);

create index overall_roles_created_by_idx
  on public.overall_roles (created_by)
  where created_by is not null;

-- Explicit API grants. Anon receives no privileges. Authenticated can only SELECT.
revoke all on table public.overall_roles from anon, authenticated;
grant select on table public.overall_roles to authenticated;

revoke all on sequence public.overall_roles_id_seq from anon, authenticated;
grant usage, select on sequence public.overall_roles_id_seq to authenticated;

-- Enable Row Level Security
alter table public.overall_roles enable row level security;

-- Authenticated users can only view their own overall role assignment.
create policy "overall_roles_select_self"
  on public.overall_roles
  for select
  to authenticated
  using (profile_id = (select auth.uid()));

-- Note: No INSERT, UPDATE, or DELETE policies are granted to authenticated.
-- Direct client-side mutations fail closed to prevent unauthorized self-promotion
-- or cross-user modification.
