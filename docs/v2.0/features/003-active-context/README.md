# Feature V2-003: Active Organization / Location Context

GitHub Issue: [#251](https://github.com/KrapaGoutam/The-Lineup/issues/251)  
Parent Issue: [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8)  
Status: `SUBFEATURES COMPLETE` (V2-003.001–.005); awaiting owner review — V2-005 module binding + RLS remain Production blockers

---

## 1. Overview and Mission

Feature V2-003 implements active context resolution across the application shell, layouts, and Server Component data loaders. It provides an intuitive organization/location switcher, auto-resolves single-context users, and guards against stale or multi-tab cross-talk.

---

## 2. Planned Subfeatures

- **V2-003.001**: Context Resolution (Server-side hydration of active organization and location from cookies/session). Issue #283 — see [001-context-resolution/](001-context-resolution/PLAN.md).
- **V2-003.002**: Organization / Location Switcher (App shell interactive dropdown with active context pill). Explicit URL selection, no cookie writes — see [002-org-location-switcher/](002-org-location-switcher/PLAN.md).
- **V2-003.003**: Single-Context Auto Resolution (Zero-friction auto-select for single-org / single-location staff).
- **V2-003.004**: Context Persistence (Secure server cookie persistence honoring security boundaries). Issue #290 — HttpOnly cookie written only by a verified Server Action; `Referer` no longer the operational context source — see [004-secure-context-persistence/](004-secure-context-persistence/PLAN.md).
- **V2-003.005**: Multi-Tab / Stale Context Safety (Cross-tab broadcast channel sync and invalidation guards). Issue #295 — server-verified workspace assertion on the Tasks path (the primary defense), id-free BroadcastChannel notification, stale-workspace guard with verified recovery, history-safe reconciliation — see [005-multi-tab-stale-context/](005-multi-tab-stale-context/PLAN.md).
