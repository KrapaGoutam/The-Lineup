-- Tasks V1.1 / T-4 (1 of 2) -- the `opening_reminder` notification type.
--
-- Its own migration: PostgreSQL cannot use a newly added enum value in the
-- transaction that adds it, and the next migration (the sweep + the extended
-- notification gate) names the value. Additive and harmless on its own: no
-- caller emits the type until the next migration lands.
--
-- Rollback: nothing to undo. An unused enum value is inert, and removing one is
-- not supported by PostgreSQL.

alter type public.task_notification_type add value if not exists 'opening_reminder';
