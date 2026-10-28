-- Tasks V1.1 / T-3 -- notification narrowing (#154, PLAN D-3).
--
-- The notification inbox carries Opening and Closing operational work only.
-- Ordinary `kind = 'task'` work no longer stores inbox notifications.
--
-- One gate inside private.tasks_notify, the single writer of
-- task_notifications. A notification is stored only when its source is
-- operational:
--   * the checklist_available type (an Opening / Closing checklist was
--     generated; it carries a checklist instance, never a normal task), or
--   * a task whose kind is 'opening' or 'closing' (looked up server-side from
--     the task id, in the same organization).
-- Everything else -- assigned / reassigned / completed / due_soon / overdue for
-- a normal task, or a call that names no task -- is dropped. The gate fails
-- closed: a call the function cannot prove operational stores nothing.
--
-- Audit history is untouched. task_events and private.tasks_emit are not
-- changed, so created / updated / reassigned / completed / reopened /
-- cancelled / carried-forward / recurrence events are still written exactly as
-- before. Only the inbox is narrowed. Existing stored notifications are not
-- deleted: this is prospective policy. Recipients, the active-member check and
-- the (recipient, dedupe_key) idempotency are unchanged; tasks_notify keeps its
-- signature, so every call site and the existing privileges stay as they were.
--
-- Rollback: re-create private.tasks_notify without the operational gate (the
-- body in 20261025090000_tasks_v1_foundation.sql).

create or replace function private.tasks_notify(
  p_organization_id uuid,
  p_recipient uuid,
  p_type public.task_notification_type,
  p_task_id uuid,
  p_instance_id uuid,
  p_title text,
  p_body text,
  p_dedupe_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Operational gate (PLAN D-3): Opening / Closing only.
  if not (
    p_type = 'checklist_available'
    or exists (
      select 1 from public.tasks t
      where t.id = p_task_id
        and t.organization_id = p_organization_id
        and t.kind in ('opening', 'closing')
    )
  ) then
    return;
  end if;

  insert into public.task_notifications (
    organization_id, recipient_profile_id, type, task_id, checklist_instance_id, title, body, dedupe_key
  )
  select p_organization_id, p_recipient, p_type, p_task_id, p_instance_id, p_title, left(p_body, 300), p_dedupe_key
  where exists (
    select 1 from public.memberships m
    where m.organization_id = p_organization_id and m.profile_id = p_recipient and m.active
  )
  on conflict (recipient_profile_id, dedupe_key) do nothing;
end;
$$;

-- The due-soon / overdue sweep only ever targets kind = 'task', which the gate
-- now drops. Keep the RPC (the snapshot calls it on every load) and its
-- membership check, but report only notifications that were really stored, so
-- the return value is not inflated by suppressed ones.
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
  v_after integer;
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

    select count(*) into v_after from public.task_notifications n
    where n.recipient_profile_id = v_row.profile_id and n.dedupe_key = v_key;

    if v_after > v_before then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;
