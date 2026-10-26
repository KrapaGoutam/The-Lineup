-- Tasks V1 / T7 -- in-app notifications: due-soon / overdue sweep and read state.
--
-- Event-driven notifications (assigned, reassigned, completed,
-- checklist_available) are written by the lifecycle RPCs in the same
-- transaction as the change. The time-driven ones (due soon, overdue) are
-- produced by this idempotent sweep, which any active member's Tasks screen
-- triggers when it loads -- no cron dependency, and the database stays
-- authoritative even if a sweep is delayed. One notification per
-- (recipient, task, kind) via task_notifications.dedupe_key, so reloading
-- never spams. Only named assignees of normal tasks are notified: team-wide
-- work and checklist items have no single owner to nag.

create or replace function public.task_notifications_sweep(
  p_organization_id uuid,
  p_location_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_row record;
  v_key text;
  v_before integer;
begin
  perform private.tasks_begin(p_organization_id, p_location_id);

  for v_row in
    select t.id, t.title, a.profile_id,
           case when t.due_at < now() then 'overdue' else 'due_soon' end as kind
    from public.tasks t
    join public.task_assignments a on a.task_id = t.id
    where t.organization_id = p_organization_id
      and t.location_id = p_location_id
      and t.kind = 'task'
      and t.status in ('open', 'in_progress', 'blocked')
      and t.assignment_mode in ('individual', 'multiple')
      and t.due_at is not null
      -- due within the next hour, or overdue by less than three days
      and t.due_at between now() - interval '3 days' and now() + interval '60 minutes'
  loop
    v_key := v_row.kind || ':' || v_row.id::text || ':' || v_row.profile_id::text;
    select count(*) into v_before from public.task_notifications n
    where n.recipient_profile_id = v_row.profile_id and n.dedupe_key = v_key;

    perform private.tasks_notify(
      p_organization_id, v_row.profile_id,
      v_row.kind::public.task_notification_type, v_row.id, null,
      case v_row.kind when 'overdue' then 'Task overdue' else 'Task due soon' end,
      v_row.title, v_key
    );

    if v_before = 0 then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- p_ids null marks every unread notification of the caller as read.
create or replace function public.task_notifications_mark_read(p_ids bigint[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'You need to sign in to do that.' using errcode = '42501';
  end if;
  update public.task_notifications n
  set read_at = now()
  where n.recipient_profile_id = (select auth.uid())
    and n.read_at is null
    and (p_ids is null or n.id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.task_notifications_sweep(uuid, uuid) from public, anon;
revoke all on function public.task_notifications_mark_read(bigint[]) from public, anon;
grant execute on function public.task_notifications_sweep(uuid, uuid) to authenticated;
grant execute on function public.task_notifications_mark_read(bigint[]) to authenticated;
