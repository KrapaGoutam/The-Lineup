-- V2-009 B2 / F-1: remove verified unnecessary anonymous grants.
-- Preserve authenticated workflows, schema USAGE, GraphQL, and Storage.

revoke all on table public.location_memberships from anon;

revoke all on sequence
  public.inventory_adjustments_id_seq,
  public.inventory_change_log_id_seq,
  public.kiosk_pairing_attempts_id_seq,
  public.location_lifecycle_events_id_seq,
  public.location_memberships_id_seq,
  public.task_events_id_seq,
  public.task_notifications_id_seq
from anon;

-- These are trigger-only functions. Their explicit PUBLIC grant would still
-- make anon's EXECUTE effective if only the direct anon grant were removed.
revoke execute on function public.locations_guard_payload() from public, anon;
revoke execute on function public.organizations_guard_immutability() from public, anon;

-- postgres owns the application objects and is the migration executor.
-- supabase_admin's explicit public defaults also grant anon access, but this
-- migration role cannot change that platform-owned ACL. A separate authorized
-- Supabase-admin operation is required before Production release.
-- Global PUBLIC function defaults are deliberately outside this migration.
alter default privileges for role postgres in schema public
  revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon;
