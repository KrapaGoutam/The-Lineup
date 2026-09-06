-- Real bug found live-testing Phase C, not assumed: the previous migration
-- revoked execute on the three private.* helpers from `authenticated` too,
-- reasoning that only the public board_* RPCs should be able to reach
-- them. That's wrong for SECURITY INVOKER functions -- the calling role
-- throughout an invoker chain stays whoever the original caller was (here,
-- `authenticated`), so Postgres checks EXECUTE against that role for every
-- function in the chain, not just the one the client calls directly.
-- `private.has_org_role` already gets this right (granted to
-- `authenticated`, revoked from public/anon); the three helpers below
-- should have followed that exact precedent instead of assuming an
-- invoker-called-by-an-invoker chain inherits anything.
--
-- These functions are still not reachable from the browser: PostgREST
-- only exposes the `public` schema as RPC endpoints, so `private.*`
-- functions have no HTTP surface regardless of this grant -- it only
-- makes the internal call from board_add_column/board_assign/etc. work.
grant execute on function private.get_or_create_active_session(uuid, uuid, date) to authenticated;
grant execute on function private.ensure_trailing_round(uuid, bigint) to authenticated;
grant execute on function private.assert_board_not_locked(uuid, bigint) to authenticated;
