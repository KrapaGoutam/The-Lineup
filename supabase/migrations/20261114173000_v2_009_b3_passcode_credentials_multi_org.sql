-- Migration: 20261114173000_v2_009_b3_passcode_credentials_multi_org.sql
-- V2-009 B3: Enable multi-organization passcode credentials for canonical Auth identity.
-- Drops table-wide synthetic_email uniqueness so a single person (profile_id / synthetic_email)
-- can hold credentials across multiple organizations, while preserving per-organization
-- uniqueness on (organization_id, profile_id) and (organization_id, locator).

alter table public.passcode_credentials
  drop constraint if exists passcode_credentials_synthetic_email_key;

create index if not exists passcode_credentials_synthetic_email_idx
  on public.passcode_credentials (synthetic_email);

create index if not exists passcode_credentials_profile_id_idx
  on public.passcode_credentials (profile_id);
