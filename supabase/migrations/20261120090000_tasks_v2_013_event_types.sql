-- V2.0.13 Batch A (1/2): audit vocabulary for task checklists, explicit status
-- changes and archiving. Separate file because an enum value added in a
-- transaction cannot be used by that same transaction. Forward-only, additive.
alter type public.task_event_type add value if not exists 'status_changed';
alter type public.task_event_type add value if not exists 'checklist_edited';
alter type public.task_event_type add value if not exists 'checklist_step_checked';
alter type public.task_event_type add value if not exists 'checklist_step_unchecked';
alter type public.task_event_type add value if not exists 'archived';
