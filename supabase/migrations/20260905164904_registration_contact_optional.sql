-- Feature 005 follow-up: only the display name and chosen passcode are
-- mandatory at registration. Contact (phone/email) becomes optional.
--
-- `contact`'s original inline check was declared unnamed on the table's
-- original name (access_requests) at creation; ALTER TABLE RENAME does not
-- rename constraints, so it is still `access_requests_contact_check`.
alter table public.registrations
  alter column contact drop not null;

alter table public.registrations
  drop constraint access_requests_contact_check;

alter table public.registrations
  add constraint registrations_contact_length_check
  check (contact is null or length(trim(contact)) between 3 and 200);
