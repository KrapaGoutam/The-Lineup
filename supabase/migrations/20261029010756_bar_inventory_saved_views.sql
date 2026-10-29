-- BI-E3 personal preferences. No organization-wide shared views.
create table public.inventory_saved_views (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null,
  profile_id uuid not null,
  table_key text not null default 'inv' check (table_key='inv'),
  name text not null check (length(name) between 1 and 80 and name=trim(name)),
  name_key text generated always as (lower(regexp_replace(trim(name),'\s+',' ','g'))) stored,
  payload jsonb not null check (jsonb_typeof(payload)='object' and octet_length(payload::text)<=30000
    and payload->>'version'='1' and jsonb_typeof(payload->'owns')='array' and jsonb_typeof(payload->'state')='object'),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check(version>=1),
  foreign key(location_id,organization_id) references public.locations(id,organization_id) on delete cascade,
  foreign key(organization_id,profile_id) references public.memberships(organization_id,profile_id) on delete cascade,
  unique(organization_id,location_id,profile_id,table_key,name_key)
);
create unique index inventory_saved_views_default_idx on public.inventory_saved_views(organization_id,location_id,profile_id,table_key) where is_default;
create index inventory_saved_views_profile_idx on public.inventory_saved_views(profile_id,organization_id);
create index inventory_saved_views_location_idx on public.inventory_saved_views(location_id,organization_id);
alter table public.inventory_saved_views enable row level security;
revoke all on public.inventory_saved_views from public,anon,authenticated;
grant select on public.inventory_saved_views to authenticated;
create policy inventory_saved_views_select on public.inventory_saved_views for select to authenticated
  using(profile_id=(select auth.uid()) and private.inventory_can_access_location(organization_id,location_id));

create function public.inventory_saved_view_save(p_organization_id uuid,p_location_id uuid,p_id uuid,p_name text,p_payload jsonb,p_is_default boolean,p_expected_version integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=private.inventory_begin(p_organization_id,p_location_id);
  v_old public.inventory_saved_views;
  v_name text:=private.inventory_clean_text(p_name);
  v_id uuid;
begin
  if length(v_name) not between 1 and 80 or p_is_default is null then raise exception 'Enter a view name of 1–80 characters.' using errcode='22023'; end if;
  if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object' or p_payload->>'version' is distinct from '1'
    or jsonb_typeof(p_payload->'owns') is distinct from 'array' or jsonb_typeof(p_payload->'state') is distinct from 'object'
    or octet_length(p_payload::text)>30000 then raise exception 'Invalid saved view. Save the current view again.' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_payload->'owns') p where p not in ('search','filters','sort','hidden','order','showArchived')) then
    raise exception 'Invalid saved view options.' using errcode='22023'; end if;
  -- Serialize names/default changes per person/location, including concurrent creates.
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||p_location_id::text||v_actor::text||'inventory_views',0));
  if p_id is not null then
    select * into v_old from public.inventory_saved_views where id=p_id and organization_id=p_organization_id and location_id=p_location_id and profile_id=v_actor for update;
    if not found then raise exception 'That personal view is not available.' using errcode='42501'; end if;
    if p_expected_version is null or p_expected_version<>v_old.version then
      raise exception 'This saved view changed. Reload and try again.' using errcode='PT409',detail=jsonb_build_object('kind','stale','entity','saved_view','id',p_id,'current_version',v_old.version)::text;
    end if;
  elsif p_expected_version is not null then raise exception 'A new view cannot have an expected version.' using errcode='22023';
  elsif (select count(*) from public.inventory_saved_views where organization_id=p_organization_id and location_id=p_location_id and profile_id=v_actor)>=100 then
    raise exception 'You can save up to 100 personal views.' using errcode='22023';
  end if;
  if exists(select 1 from public.inventory_saved_views where organization_id=p_organization_id and location_id=p_location_id and profile_id=v_actor and name_key=lower(v_name) and id is distinct from p_id) then
    raise exception 'You already have a view with that name.' using errcode='22023'; end if;
  if p_is_default then
    update public.inventory_saved_views set is_default=false,version=version+1,updated_at=now()
      where organization_id=p_organization_id and location_id=p_location_id and profile_id=v_actor and is_default and id is distinct from p_id;
  end if;
  if p_id is null then
    insert into public.inventory_saved_views(organization_id,location_id,profile_id,name,payload,is_default)
      values(p_organization_id,p_location_id,v_actor,v_name,p_payload,p_is_default) returning id into v_id;
  else
    update public.inventory_saved_views set name=v_name,payload=p_payload,is_default=p_is_default,version=version+1,updated_at=now() where id=p_id returning id into v_id;
  end if;
  return v_id;
end $$;
create function public.inventory_saved_view_delete(p_organization_id uuid,p_location_id uuid,p_id uuid,p_expected_version integer)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=private.inventory_begin(p_organization_id,p_location_id);
  v_old public.inventory_saved_views;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||p_location_id::text||v_actor::text||'inventory_views',0));
  select * into v_old from public.inventory_saved_views where id=p_id and organization_id=p_organization_id and location_id=p_location_id and profile_id=v_actor for update;
  if not found then raise exception 'That personal view is not available.' using errcode='42501'; end if;
  if p_expected_version is null or p_expected_version<>v_old.version then raise exception 'This saved view changed. Reload and try again.' using errcode='PT409'; end if;
  delete from public.inventory_saved_views where id=p_id;
end $$;
revoke all on function public.inventory_saved_view_save(uuid,uuid,uuid,text,jsonb,boolean,integer) from public,anon,authenticated;
revoke all on function public.inventory_saved_view_delete(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.inventory_saved_view_save(uuid,uuid,uuid,text,jsonb,boolean,integer) to authenticated;
grant execute on function public.inventory_saved_view_delete(uuid,uuid,uuid,integer) to authenticated;
