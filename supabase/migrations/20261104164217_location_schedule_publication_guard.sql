-- Publishing existing work is an operational activation, including restoration
-- of an archived period. Reuse the authoritative location lookup and FOR SHARE
-- lock that serializes operational writes with lifecycle transitions.
-- RLS and existing grants still authorize the enclosing UPDATE. Historical
-- corrections and transitions away from published remain permitted.
create trigger schedule_periods_location_lifecycle_publish_guard
  before update on public.schedule_periods
  for each row
  when (new.status = 'published' and old.status is distinct from 'published')
  execute function private.guard_location_operational_write();
