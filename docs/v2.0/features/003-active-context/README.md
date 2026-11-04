# Feature V2-003: Active Organization / Location Context

GitHub Issue: [#251](https://github.com/KrapaGoutam/The-Lineup/issues/251)  
Parent Issue: [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8)  
Status: `IN PROGRESS` (V2-003.001–.003 complete; V2-003.004 implemented, `READY_FOR_CLAUDE_LOCAL_VALIDATION`; .005 not started)

---

## 1. Overview and Mission

Feature V2-003 implements active context resolution across the application shell, layouts, and Server Component data loaders. It provides an intuitive organization/location switcher, auto-resolves single-context users, and guards against stale or multi-tab cross-talk.

---

## 2. Planned Subfeatures

- **V2-003.001**: Context Resolution (Server-side hydration of active organization and location from cookies/session). Issue #283 — see [001-context-resolution/](001-context-resolution/PLAN.md).
- **V2-003.002**: Organization / Location Switcher (App shell interactive dropdown with active context pill). Explicit URL selection, no cookie writes — see [002-org-location-switcher/](002-org-location-switcher/PLAN.md).
- **V2-003.003**: Single-Context Auto Resolution (Zero-friction auto-select for single-org / single-location staff).
- **V2-003.004**: Context Persistence (Secure server cookie persistence honoring security boundaries). Issue #290 — HttpOnly cookie written only by a verified Server Action; `Referer` no longer the operational context source — see [004-secure-context-persistence/](004-secure-context-persistence/PLAN.md).
- **V2-003.005**: Multi-Tab / Stale Context Safety (Cross-tab broadcast channel sync and invalidation guards).
