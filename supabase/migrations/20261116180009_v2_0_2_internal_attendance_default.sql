-- V2.0.2: provisioning omits attendance_mode, so the database supplies the
-- persisted default for newly created locations. Existing NULL and explicit
-- external/disabled values are untouched; no attendance or module rows change.
alter table public.locations
  alter column attendance_mode set default 'internal_the_lineup'::public.attendance_mode;
