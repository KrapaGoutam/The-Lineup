# Feature V2-003: Active Organization / Location Context

GitHub Issue: [#251](https://github.com/KrapaGoutam/The-Lineup/issues/251)  
Parent Issue: [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8)  
Status: `NOT STARTED`

---

## 1. Overview and Mission

Feature V2-003 implements active context resolution across the application shell, layouts, and Server Component data loaders. It provides an intuitive organization/location switcher, auto-resolves single-context users, and guards against stale or multi-tab cross-talk.

---

## 2. Planned Subfeatures

- **V2-003.001**: Context Resolution (Server-side hydration of active organization and location from cookies/session).
- **V2-003.002**: Organization / Location Switcher (App shell interactive dropdown with active context pill).
- **V2-003.003**: Single-Context Auto Resolution (Zero-friction auto-select for single-org / single-location staff).
- **V2-003.004**: Context Persistence (Secure server cookie persistence honoring security boundaries).
- **V2-003.005**: Multi-Tab / Stale Context Safety (Cross-tab broadcast channel sync and invalidation guards).
