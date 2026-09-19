-- Table Rotation Multi-View, retention v1 (IMPLEMENTATION_CONTRACT.md
-- section 21). Scope is deliberately narrow: board_events only, rows
-- older than 7 days. board_events has no incoming FKs (nothing references
-- board_events.id), so a plain delete needs no cascade cleanup, and undo/
-- redo only ever target the single most recent non-undone event, so
-- purging old rows never breaks current undo/redo.
--
-- Explicitly NOT scoped here: table_rotation_entries / rotation_rounds.
-- Feature 028's historical date navigation reads that data for past
-- dates -- deleting it on the same 7-day schedule would silently break an
-- already-shipped, tested capability. Left for a future decision with
-- explicit product sign-off on how far back date navigation must work.
-- Also never touched: attendance (separate Neon database), payroll,
-- tips/ledger, employee accounts, service_sessions.
--
-- Scheduling: pg_cron, confirmed available in this project's Postgres
-- (no existing scheduled-job convention was found in this repo to follow
-- -- .github/workflows only runs on push/PR, there is no Vercel cron
-- config). private.cleanup_stale_board_events is SECURITY DEFINER and has
-- no grant to any client role -- it is only ever invoked by the cron job
-- itself (which runs as the role that scheduled it, i.e. whichever role
-- applies migrations), never callable from the browser/PostgREST.
create extension if not exists pg_cron with schema extensions;

create function private.cleanup_stale_board_events() returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.board_events where created_at < now() - interval '7 days';
$$;

revoke all on function private.cleanup_stale_board_events() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'table_rotation_board_events_retention') then
    perform cron.schedule(
      'table_rotation_board_events_retention',
      '0 3 * * *',
      $cron$select private.cleanup_stale_board_events();$cron$
    );
  end if;
end;
$$;
