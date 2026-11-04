# Subfeature V2-003.001: Active Organization / Location Context Resolution — Status

Parent Feature: [V2-003](../README.md) · Program #248 · Feature #251 · Issue #283 · Milestone #8
Status: **VERIFIED — hosted DEV 15/15, merged via PR #284** (see EVIDENCE.md)
Branch: feature/v2.0-003.001-context-resolution · target: development
Base: `development` cacdd7c9dc5bebdd4434c779f7d146ca4ab4230e · `main` 5e5b7747693b6e81014eafdf299b87e56c3f033d (untouched) · Production not contacted.

## Implemented

- Canonical `ResolvedActiveContext` / `ContextResolutionResult` and pure resolver over the canonical authorization resolver.
- Server loader (RLS client, `auth.getUser()`, error-discriminating queries).
- Read-only cookie contract; route/cookie precedence; stale/malformed/mismatch rejection.
- `loadPageData` integration; schedule/tips/allocation share one verified `(org, location, time zone)`; legacy `getPrimaryLocation` removed from the entry path.
- Entry-user hydration for Overall users without membership; minimal context-unavailable state.
- No migration. No dependency added.

## Deferred (NOT in this subfeature)

V2-003.002 switcher UI · .003 auto-selection workflow (only the bounded "unique eligible location" rule exists) · .004 cookie persistence/write/clear · .005 cross-tab sync · V2-004 module flags · V2-005 module location scoping (actions, follow-up reads, roster) · attendance/kiosk · role management.

## Known limitations

See PLAN.md §10. Highlights: legacy follow-up reads/actions still use the primary-location helper until V2-005; Org Owner/GM without a location assignment cannot operate a location (canonical resolver) — V2-008 backfill must precede promotion; no cookie writer yet.

V2-003 is **not** complete: only .001 is implemented.
