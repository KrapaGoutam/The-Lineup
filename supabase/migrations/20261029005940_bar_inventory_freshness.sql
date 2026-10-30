-- Bar Inventory V1.1 / BI-E1. Additive date groups and configurable rules.
-- Stock remains authoritative; these quantities never deplete automatically.
alter table public.inventory_change_log drop constraint inventory_change_log_entity_type_check;
alter table public.inventory_change_log add constraint inventory_change_log_entity_type_check
  check (entity_type in ('vendor','category','subcategory','product','stock_levels','export','import','date_lot','freshness_rule'));

create table public.inventory_date_lots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null,
  product_id uuid not null,
  quantity numeric(12,2) check (quantity >= 0 and quantity <> 'NaN'::numeric),
  manufacture_date date,
  manufacture_precision text,
  expiration_date date,
  expiration_precision text,
  notes text check (length(notes) <= 500),
  active boolean not null default true,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1),
  foreign key (location_id, organization_id) references public.locations(id, organization_id) on delete cascade,
  foreign key (product_id, organization_id) references public.inventory_products(id, organization_id) on delete cascade,
  foreign key (organization_id, created_by) references public.memberships(organization_id, profile_id) deferrable initially deferred,
  foreign key (organization_id, updated_by) references public.memberships(organization_id, profile_id) deferrable initially deferred,
  check (manufacture_date is not null or expiration_date is not null),
  check ((manufacture_date is null and manufacture_precision is null) or
    (manufacture_date is not null and manufacture_precision is not null and manufacture_precision in ('day','month')
     and manufacture_date between date '2000-01-01' and date '2099-12-31'
     and (manufacture_precision = 'day' or extract(day from manufacture_date) = 1))),
  check ((expiration_date is null and expiration_precision is null) or
    (expiration_date is not null and expiration_precision is not null and expiration_precision in ('day','month')
     and expiration_date between date '2000-01-01' and date '2099-12-31'
     and (expiration_precision = 'day' or expiration_date = (date_trunc('month', expiration_date) + interval '1 month - 1 day')::date))),
  check (manufacture_date is null or expiration_date is null or manufacture_date <= expiration_date)
);
create index inventory_date_lots_scope_idx on public.inventory_date_lots(organization_id, location_id, product_id);
create index inventory_date_lots_product_idx on public.inventory_date_lots(product_id, organization_id);
create index inventory_date_lots_location_idx on public.inventory_date_lots(location_id, organization_id);
create index inventory_date_lots_creator_idx on public.inventory_date_lots(organization_id, created_by);
create index inventory_date_lots_updater_idx on public.inventory_date_lots(organization_id, updated_by);
create index inventory_date_lots_expiration_idx on public.inventory_date_lots(organization_id, location_id, expiration_date) where active;

create table public.inventory_freshness_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null,
  subcategory_id uuid not null,
  tracking_enabled boolean not null default true,
  maximum_months integer not null check (maximum_months between 1 and 120),
  warning_months integer not null check (warning_months >= 0 and warning_months < maximum_months),
  active boolean not null default true,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1),
  unique (organization_id, location_id, subcategory_id),
  foreign key (location_id, organization_id) references public.locations(id, organization_id) on delete cascade,
  foreign key (subcategory_id, organization_id) references public.inventory_subcategories(id, organization_id) on delete cascade,
  foreign key (organization_id, created_by) references public.memberships(organization_id, profile_id) deferrable initially deferred,
  foreign key (organization_id, updated_by) references public.memberships(organization_id, profile_id) deferrable initially deferred
);
create index inventory_freshness_rules_subcategory_idx on public.inventory_freshness_rules(subcategory_id, organization_id);
create index inventory_freshness_rules_location_idx on public.inventory_freshness_rules(location_id, organization_id);
create index inventory_freshness_rules_creator_idx on public.inventory_freshness_rules(organization_id, created_by);
create index inventory_freshness_rules_updater_idx on public.inventory_freshness_rules(organization_id, updated_by);

alter table public.inventory_date_lots enable row level security;
alter table public.inventory_freshness_rules enable row level security;
revoke all on public.inventory_date_lots, public.inventory_freshness_rules from public, anon, authenticated;
grant select on public.inventory_date_lots, public.inventory_freshness_rules to authenticated;
create policy inventory_date_lots_select on public.inventory_date_lots for select to authenticated
  using (private.inventory_can_access_location(organization_id, location_id));
create policy inventory_freshness_rules_select on public.inventory_freshness_rules for select to authenticated
  using (private.inventory_can_access_location(organization_id, location_id));

create function public.inventory_date_lot_save(
  p_organization_id uuid, p_location_id uuid, p_id uuid, p_product_id uuid,
  p_quantity numeric, p_manufacture_date date, p_manufacture_precision text,
  p_expiration_date date, p_expiration_precision text, p_notes text,
  p_active boolean, p_expected_version integer
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id, p_location_id);
  v_old public.inventory_date_lots;
  v_new public.inventory_date_lots;
  v_notes text := private.inventory_optional_text('notes', p_notes, 500);
  v_name text;
begin
  perform private.inventory_check_quantity('dated quantity', p_quantity, false);
  -- Product locking serializes date edits with archival, without changing stock.
  perform 1 from public.inventory_products where id = p_product_id
    and organization_id = p_organization_id and active for share;
  if not found then raise exception 'Choose an active product in this restaurant.' using errcode = '22023'; end if;
  if p_active is null then raise exception 'Choose an active state.' using errcode = '22023'; end if;
  if p_id is not null then
    select * into v_old from public.inventory_date_lots where id = p_id
      and organization_id = p_organization_id and location_id = p_location_id and product_id = p_product_id for update;
    if not found then raise exception 'That date entry is not available here.' using errcode = '22023'; end if;
    if p_expected_version is null or p_expected_version <> v_old.version then
      select display_name into v_name from public.profiles where id = v_old.updated_by;
      raise exception 'This date entry changed. Reload and review it.' using errcode = 'PT409',
        detail = jsonb_build_object('kind','stale','entity','date_lot','id',p_id,'current_version',v_old.version,'updated_by',v_name,'updated_at',v_old.updated_at)::text;
    end if;
  elsif p_expected_version is not null then
    raise exception 'A new entry cannot have an expected version.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.inventory_date_lots(organization_id,location_id,product_id,quantity,manufacture_date,manufacture_precision,expiration_date,expiration_precision,notes,active,created_by,updated_by)
      values(p_organization_id,p_location_id,p_product_id,p_quantity,p_manufacture_date,p_manufacture_precision,p_expiration_date,p_expiration_precision,v_notes,p_active,v_actor,v_actor) returning * into v_new;
  else
    update public.inventory_date_lots set quantity=p_quantity, manufacture_date=p_manufacture_date, manufacture_precision=p_manufacture_precision,
      expiration_date=p_expiration_date, expiration_precision=p_expiration_precision, notes=v_notes, active=p_active,
      updated_by=v_actor,updated_at=now(),version=version+1 where id=p_id returning * into v_new;
  end if;
  perform private.inventory_log(p_organization_id,p_location_id,'date_lot',v_new.id,
    case when p_id is null then 'create' when not p_active and v_old.active then 'archive' when p_active and not v_old.active then 'reactivate' else 'update' end,
    jsonb_build_object('product_id',p_product_id,'previous',case when p_id is null then null else to_jsonb(v_old) end,'new',to_jsonb(v_new)));
  return v_new.id;
end $$;

create function public.inventory_freshness_rule_save(
  p_organization_id uuid,p_location_id uuid,p_id uuid,p_subcategory_id uuid,
  p_tracking_enabled boolean,p_maximum_months integer,p_warning_months integer,p_active boolean,p_expected_version integer
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := private.inventory_begin(p_organization_id,p_location_id);
  v_old public.inventory_freshness_rules;
  v_new public.inventory_freshness_rules;
begin
  perform 1 from public.inventory_subcategories where id=p_subcategory_id and organization_id=p_organization_id;
  if not found then raise exception 'Choose a subcategory in this restaurant.' using errcode='22023'; end if;
  if p_id is not null then
    select * into v_old from public.inventory_freshness_rules where id=p_id and organization_id=p_organization_id and location_id=p_location_id for update;
    if not found then raise exception 'That freshness rule is not available here.' using errcode='22023'; end if;
    if p_expected_version is null or p_expected_version <> v_old.version then
      raise exception 'This freshness rule changed. Reload and review it.' using errcode='PT409',
        detail=jsonb_build_object('kind','stale','entity','freshness_rule','id',p_id,'current_version',v_old.version,'updated_at',v_old.updated_at)::text;
    end if;
  elsif p_expected_version is not null then
    raise exception 'A new rule cannot have an expected version.' using errcode='22023';
  end if;
  if p_id is null then
    insert into public.inventory_freshness_rules(organization_id,location_id,subcategory_id,tracking_enabled,maximum_months,warning_months,active,created_by,updated_by)
      values(p_organization_id,p_location_id,p_subcategory_id,p_tracking_enabled,p_maximum_months,p_warning_months,p_active,v_actor,v_actor) returning * into v_new;
  else
    update public.inventory_freshness_rules set subcategory_id=p_subcategory_id,tracking_enabled=p_tracking_enabled,maximum_months=p_maximum_months,
      warning_months=p_warning_months,active=p_active,updated_by=v_actor,updated_at=now(),version=version+1 where id=p_id returning * into v_new;
  end if;
  perform private.inventory_log(p_organization_id,p_location_id,'freshness_rule',v_new.id,
    case when p_id is null then 'create' when not p_active and v_old.active then 'archive' when p_active and not v_old.active then 'reactivate' else 'update' end,
    jsonb_build_object('previous',case when p_id is null then null else to_jsonb(v_old) end,'new',to_jsonb(v_new)));
  return v_new.id;
end $$;
revoke all on function public.inventory_date_lot_save(uuid,uuid,uuid,uuid,numeric,date,text,date,text,text,boolean,integer) from public,anon,authenticated;
revoke all on function public.inventory_freshness_rule_save(uuid,uuid,uuid,uuid,boolean,integer,integer,boolean,integer) from public,anon,authenticated;
grant execute on function public.inventory_date_lot_save(uuid,uuid,uuid,uuid,numeric,date,text,date,text,text,boolean,integer) to authenticated;
grant execute on function public.inventory_freshness_rule_save(uuid,uuid,uuid,uuid,boolean,integer,integer,boolean,integer) to authenticated;
alter publication supabase_realtime add table public.inventory_date_lots, public.inventory_freshness_rules;
