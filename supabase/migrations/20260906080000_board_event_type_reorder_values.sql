-- Feature 015 (schema gap found while planning Phase C, applied ahead of it
-- since it's purely additive): board_event_type is missing the two event
-- kinds Feature 010's column reorder and the manual "Add row" control need
-- once they're wired to real persistence. Adding an enum value only adds a
-- new label -- it never touches existing rows or any other value, and no
-- code path references either of these two yet, so this is safe to apply
-- now, independently of the Phase C work that will actually use them.

alter type public.board_event_type add value if not exists 'move_column';
alter type public.board_event_type add value if not exists 'add_row';
