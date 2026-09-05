begin;

create extension if not exists pgtap with schema extensions;

select plan(2);

select ok(
  not (
    select attnotnull from pg_attribute
    where attrelid = 'public.registrations'::regclass and attname = 'contact'
  ),
  'contact is nullable (optional)'
);
select col_not_null('public', 'registrations', 'display_name', 'display_name stays mandatory');

select * from finish();
rollback;
