# Feature V2-003: Active Organization / Location Context — Status

```text
Status: IN PROGRESS (.001–.003 complete; .004 ready for Local validation; V2-003 is NOT complete)
GitHub Issue: #251
Target Branch: development
```

| Subfeature | Name                             | Status                                                                                                                                                                                          |
| ---------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2-003.001 | Context Resolution               | Implemented; in review — [001-context-resolution/STATUS.md](001-context-resolution/STATUS.md) (Issue #283)                                                                                      |
| V2-003.002 | Organization / Location Switcher | NOT STARTED                                                                                                                                                                                     |
| V2-003.003 | Single-Context Auto Resolution   | NOT STARTED (only a bounded "unique eligible location" rule exists inside .001)                                                                                                                 |
| V2-003.004 | Context Persistence              | COMPLETE — PR #291 merged (`a649e82c`); hosted DEV 46/46, Chromium 25/25, WebKit iPad 25/25 — [004-secure-context-persistence/STATUS.md](004-secure-context-persistence/STATUS.md) (Issue #290) |
| V2-003.005 | Multi-Tab / Stale Context Safety | NOT STARTED                                                                                                                                                                                     |

## What V2-003.001 delivers (and what it defers)

Implemented: server-authoritative `ResolvedActiveContext`; route/cookie precedence; read-only cookie contract; stale/malformed/mismatch rejection; schedule/tips/allocation initial loaders share one verified location + time zone; `getPrimaryLocation` removed from the entry path; Overall users with no membership can enter; non-interactive context-unavailable state.

Deferred: switcher UI, auto-selection workflow, cookie writes/clear, cross-tab sync, module flags, module action/follow-up-read location scoping (V2-005).
