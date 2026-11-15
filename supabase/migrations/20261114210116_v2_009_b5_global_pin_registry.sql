-- Expand only. Legacy credentials are enrolled after successful identity proof.
-- Global identities are intentionally not tenant-owned business rows.
create table public.personal_pin_accounts (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  locator text check (locator ~ '^[0-9a-f]{64}$'),
  synthetic_email text not null,
  operation_id uuid,
  pending_locator text check (pending_locator ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now(),
  constraint personal_pin_operation_shape check
    ((operation_id is null) = (pending_locator is null))
);
create unique index personal_pin_accounts_locator_key
  on public.personal_pin_accounts(locator) where locator is not null;

-- During a mutation BOTH the old and candidate PIN remain exclusively owned.
create table public.personal_pin_claims (
  locator text primary key check (locator ~ '^[0-9a-f]{64}$'),
  profile_id uuid not null references public.personal_pin_accounts(profile_id) on delete cascade
);
create index personal_pin_claims_profile_idx on public.personal_pin_claims(profile_id);
create table public.personal_pin_events (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  actor_profile_id uuid not null references public.profiles(id) on delete cascade,
  operation_id uuid not null,
  outcome text not null check (outcome in ('started', 'completed', 'rolled_back')),
  occurred_at timestamptz not null default now()
);
create index personal_pin_events_profile_idx on public.personal_pin_events(profile_id, occurred_at);
create index personal_pin_events_actor_idx on public.personal_pin_events(actor_profile_id);
create table public.global_pin_attempts (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  purpose text not null check (purpose in ('login', 'register', 'enroll')),
  succeeded boolean not null default false,
  attempted_at timestamptz not null default now()
);
create index global_pin_attempts_client_idx
  on public.global_pin_attempts(fingerprint, purpose, attempted_at);
create index global_pin_attempts_failure_idx
  on public.global_pin_attempts(attempted_at) where not succeeded;

alter table public.personal_pin_accounts enable row level security;
alter table public.personal_pin_claims enable row level security;
alter table public.personal_pin_events enable row level security;
alter table public.global_pin_attempts enable row level security;
revoke all on public.personal_pin_accounts, public.personal_pin_claims,
  public.personal_pin_events, public.global_pin_attempts from public, anon, authenticated;
grant all on public.personal_pin_accounts, public.personal_pin_claims,
  public.personal_pin_events, public.global_pin_attempts to service_role;
revoke all on sequence public.personal_pin_events_id_seq from public, anon, authenticated;
grant usage, select on sequence public.personal_pin_events_id_seq to service_role;

-- SECURITY INVOKER: callable only by the server's service_role. No public bypass.
create function public.begin_personal_pin_change(
  p_profile_id uuid, p_locator text, p_actor_profile_id uuid, p_synthetic_email text
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  account public.personal_pin_accounts%rowtype;
  operation uuid := gen_random_uuid();
  claim_owner uuid;
begin
  if p_locator is null or p_locator !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid locator' using errcode = '22023';
  end if;
  if p_synthetic_email is null or length(p_synthetic_email) not between 3 and 320 then
    raise exception 'invalid credential identity' using errcode = '22023';
  end if;
  insert into public.personal_pin_accounts(profile_id, synthetic_email)
    values (p_profile_id, p_synthetic_email) on conflict (profile_id) do nothing;
  select * into strict account from public.personal_pin_accounts
    where profile_id = p_profile_id for update;
  if account.operation_id is not null then
    raise exception 'personal PIN reconciliation required' using errcode = '55000';
  end if;
  insert into public.personal_pin_claims(locator, profile_id)
    values (p_locator, p_profile_id) on conflict (locator) do nothing;
  select profile_id into strict claim_owner from public.personal_pin_claims where locator = p_locator;
  if claim_owner <> p_profile_id then
    raise exception 'PIN already owned' using errcode = '23505';
  end if;
  update public.personal_pin_accounts set operation_id = operation,
    pending_locator = p_locator, synthetic_email = p_synthetic_email, updated_at = now()
    where profile_id = p_profile_id;
  insert into public.personal_pin_events(profile_id, actor_profile_id, operation_id, outcome)
    values (p_profile_id, p_actor_profile_id, operation, 'started');
  return operation;
end $$;

create function public.finish_personal_pin_change(
  p_profile_id uuid, p_operation_id uuid, p_apply boolean
) returns void language plpgsql security invoker set search_path = '' as $$
declare account public.personal_pin_accounts%rowtype;
begin
  select * into strict account from public.personal_pin_accounts
    where profile_id = p_profile_id for update;
  if p_operation_id is null or account.operation_id is distinct from p_operation_id then
    raise exception 'stale personal PIN operation' using errcode = '55000';
  end if;
  update public.personal_pin_accounts set
    locator = case when p_apply then pending_locator else locator end,
    pending_locator = null, operation_id = null, updated_at = now()
    where profile_id = p_profile_id;
  delete from public.personal_pin_claims c where c.profile_id = p_profile_id
    and c.locator is distinct from
      (select a.locator from public.personal_pin_accounts a where a.profile_id = p_profile_id);
  insert into public.personal_pin_events(profile_id, actor_profile_id, operation_id, outcome)
    select p_profile_id, e.actor_profile_id, p_operation_id,
      case when p_apply then 'completed' else 'rolled_back' end
    from public.personal_pin_events e
    where e.operation_id = p_operation_id and e.outcome = 'started';
end $$;

-- Reserve BEFORE doing any Auth/lookup work: concurrent requests cannot all
-- pass a count-then-insert race. In-flight attempts count as failures.
create function public.reserve_global_pin_attempt(p_fingerprint text, p_purpose text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  recent integer; platform_failures integer; established boolean;
  budget integer; window_start timestamptz; attempt uuid;
begin
  if p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$'
    or p_purpose is null or p_purpose not in ('login', 'register', 'enroll') then
    raise exception 'invalid attempt' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('global-pin-attempt-budget', 0));
  select count(*) into platform_failures from public.global_pin_attempts
    where not succeeded and attempted_at >= now() - interval '5 minutes';
  select exists(select 1 from public.global_pin_attempts
    where fingerprint = p_fingerprint and purpose = 'login' and succeeded
      and attempted_at >= now() - interval '24 hours') into established;
  window_start := now() - case when p_purpose = 'register' then interval '1 hour' else interval '15 minutes' end;
  budget := case when p_purpose = 'register' then 3 else 8 end;
  if platform_failures >= 100 and not established then
    budget := case when p_purpose = 'register' then 1 else 2 end;
  end if;
  select count(*) into recent from public.global_pin_attempts
    where fingerprint = p_fingerprint and purpose = p_purpose
      and (p_purpose = 'register' or not succeeded)
      and attempted_at >= window_start;
  if recent >= budget then return null; end if;
  insert into public.global_pin_attempts(fingerprint, purpose) values (p_fingerprint, p_purpose)
    returning id into attempt;
  return attempt;
end $$;

revoke all on function public.begin_personal_pin_change(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.finish_personal_pin_change(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.reserve_global_pin_attempt(text, text) from public, anon, authenticated;
grant execute on function public.begin_personal_pin_change(uuid, text, uuid, text) to service_role;
grant execute on function public.finish_personal_pin_change(uuid, uuid, boolean) to service_role;
grant execute on function public.reserve_global_pin_attempt(text, text) to service_role;
