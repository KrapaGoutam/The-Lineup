# V2-003.005 — Status

Status: **`LOCALLY_VALIDATED`** — unit 3020, hosted DEV real-JWT 17/17, real Chromium 20/20 and WebKit iPad 20/20, narrow/dark/keyboard checks, demo-mode subset. Merge into `development` follows exact-head CI and the HTTPS Preview check on the PR head (see the PR). **V2-003 is not complete and Production must not be released.**

- Issue #295 · PR #296 · Parent #251 · Program #248 · Milestone #8
- Branch `feature/v2.0-003.005-multi-tab-context-safety` from `development` `fc9c6680c34a68cf627939dce9fb8ad1b991295e`; PR targets `development` only. No migration. `main` (`5e5b7747…`) and Production untouched.
- Plan: [PLAN.md](PLAN.md) · Tests: [TEST_MATRIX.md](TEST_MATRIX.md) · Evidence: [EVIDENCE.md](EVIDENCE.md)

## What V2-003.005 guarantees

- A Tasks write or read whose on-screen workspace (profile, organization, location) differs from what the server independently verifies is refused **before** the database, with or without a `Referer`. The asserted workspace is never an authority.
- Other tabs of the same browser learn quickly (BroadcastChannel notification, focus / visibility / bfcache / history reconciliation), block their workspace, explain why and offer verified recovery; a received event never writes the cookie.
- Back / reload to an old `?location=` never silently re-persists a previous context.
- A sign-in never inherits the previous employee's location from the address bar.

## What it does NOT guarantee (V2-005)

Every non-Tasks module action still resolves from the session and the persisted cookie; a stale tab with a stripped `Referer` can still write at the **persisted** location there, and a different employee signed in on the same browser acts as themself through a stale tab. Location-scoped RLS (direct PostgREST) is unchanged. See [EVIDENCE.md §7](EVIDENCE.md).

## Open dependencies

V2-005 (module location binding + RLS — Production blockers), V2-008 (backfill). Follow-ups: shell forced sign-out cross-tab hazard, `active-context.db.real` legacy assertions, Tasks controller refresh churn.
