# Feature V2-003: Active Organization / Location Context — Status

```text
Status: SUBFEATURES COMPLETE (.001–.005); V2-003 awaiting owner review; V2-005 dependencies open (Production blockers)
GitHub Issue: #251
Target Branch: development
```

| Subfeature | Name                             | Status                                                                                                                                                                                                    |
| ---------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2-003.001 | Context Resolution               | COMPLETE — PR #284 merged (`5333a526`) — [001-context-resolution/STATUS.md](001-context-resolution/STATUS.md) (Issue #283)                                                                                |
| V2-003.002 | Organization / Location Switcher | COMPLETE — PR #286 (merge 3c83535); hosted DEV 16/16, browser 10/10                                                                                                                                       |
| V2-003.003 | Single-Context Auto Resolution   | COMPLETE — PR #289; hosted DEV 22/22, browser 8/8                                                                                                                                                         |
| V2-003.004 | Context Persistence              | COMPLETE — PR #291 merged (`a649e82c`); hosted DEV 46/46, Chromium 25/25, WebKit iPad 25/25 — [004-secure-context-persistence/STATUS.md](004-secure-context-persistence/STATUS.md) (Issue #290)           |
| V2-003.005 | Multi-Tab / Stale Context Safety | COMPLETE — PR #296 (merge de8c6732); hosted DEV 17/17, Chromium 20/20, WebKit iPad 20/20, HTTPS Preview 7/7 — [005-multi-tab-stale-context/STATUS.md](005-multi-tab-stale-context/STATUS.md) (Issue #295) |

## What V2-003.001 delivers (and what it defers)

Implemented: server-authoritative `ResolvedActiveContext`; route/cookie precedence; read-only cookie contract; stale/malformed/mismatch rejection; schedule/tips/allocation initial loaders share one verified location + time zone; `getPrimaryLocation` removed from the entry path; Overall users with no membership can enter; non-interactive context-unavailable state.

Deferred: switcher UI, auto-selection workflow, cookie writes/clear, cross-tab sync, module flags, module action/follow-up-read location scoping (V2-005).

## What V2-003 guarantees, and what it does not

**Guarantees (as implemented and verified on hosted DEV and real browsers):** the active organization / location is resolved server-side from the verified session and canonical resolver; the user can switch it explicitly; single-context users enter automatically; the choice is persisted in an HttpOnly cookie that only a verified Server Action writes and sign-in / sign-out clear; a Tasks write or read from a tab whose shown workspace (profile, organization, location) differs from what the server verifies is refused before the database, with or without a `Referer`; other tabs are notified and block themselves with verified recovery; reload / back-forward never silently re-persist an old context.

**Does not guarantee:** every non-Tasks module action still resolves from the session and the persisted cookie, so a stale tab with a stripped `Referer` can still write at the **persisted** location there, and a different employee signed in on the same browser acts as themself through a stale tab for those modules; location-scoped RLS (direct PostgREST) is unchanged; legacy assignment backfill is not done.

**V2-005 dependencies:** apply the reusable server consistency check (`assertWorkspaceExpectation`) and server-authoritative location binding to schedule, tips, allocation, bar inventory and the reminder prompt; add location-scoped RLS. **Production must not be released** until V2-005 (and V2-008) land: V2-003 alone leaves reproducible wrong-location writes on those paths. #251 stays open for owner review.
