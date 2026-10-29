-- Four-digit manager input must not silently acquire a different century.
-- YY remains 2000–2099; YYYY supports the four-digit calendar range.
alter table public.inventory_date_lots drop constraint inventory_date_lots_check1;
alter table public.inventory_date_lots drop constraint inventory_date_lots_check2;
alter table public.inventory_date_lots add constraint inventory_date_lots_check1 check (
  (manufacture_date is null and manufacture_precision is null) or
  (manufacture_date is not null and manufacture_precision is not null and manufacture_precision in ('day','month')
   and manufacture_date between date '1000-01-01' and date '9999-12-31'
   and (manufacture_precision='day' or extract(day from manufacture_date)=1))
);
alter table public.inventory_date_lots add constraint inventory_date_lots_check2 check (
  (expiration_date is null and expiration_precision is null) or
  (expiration_date is not null and expiration_precision is not null and expiration_precision in ('day','month')
   and expiration_date between date '1000-01-01' and date '9999-12-31'
   and (expiration_precision='day' or expiration_date=(date_trunc('month',expiration_date)+interval '1 month - 1 day')::date))
);
