# Feature & Engineering Backlog

This backlog holds upcoming feature specifications and technical debt items queued for implementation.

---

## 🚀 Upcoming Features (Queued)

| Item | Area | Priority | Spec Link | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Bar Inventory V1** | Bar Inventory | High | #168 | Dashboard / Inventory / Manage, structured vendors, immutable adjustment history, CSV/XLSX import with preview, per-column filters, vendor-grouped Order Soon, analytics. IN BUILD (BI-0 → BI-8d merged; BI-9 Realtime + responsive in PR; BI-10 next) (`docs/features/bar-inventory-v1/`). Roadmap #2. |
| **Tasks Today — management staff visibility** | Tasks | Medium | #169 | Owner / Manager / Assistant Manager: All Staff / My Tasks / per person in Today, staff name on each task. Tracked only. Roadmap #3. |
| **Tasks notification scope** | Tasks | Medium | #154 | Limit the notification inbox to Opening and Closing operational work; settle ready/assigned/due/overdue semantics first. |
| **Release conditions C1–C8** | Platform | High | #160, #161 | Release-readiness audit (2026-10-26) returned NO-GO: repair/replace the PROD migration route (#111), reconcile PROD missing `20260911130000` (#161), migrations-first procedure (#113), backup check, same-day numeric-label re-run. See `docs/releases/release-readiness-2026-10/GO_NO_GO.md`. |
| **Tips V2 — Corrections, History & Analytics** | Tips | Medium | #155 | Edit/void saved tips with audit, history and day/week/month/custom analytics. No Finalize Day. |
| **Realtime Floor Sync** | Floor / Realtime | High | TBD | Add Supabase Realtime broadcast for multi-tablet table allocation updates. |
| **Shift Notes & Logbook** | Management | Medium | TBD | Manager-to-manager digital shift notes and shift-change handover. |
| **Section Layout Editor** | Settings | Medium | TBD | Drag-and-drop table and section customizer for floor plans. |
| **SMS Server Paging** | Notifications | Low | TBD | Twilio or web push notifications when servers are assigned next rotation table. |

---

## 🧹 Maintenance & Technical Debt

- [ ] Audit bundle size and dynamic import splitting for heavier settings dialogs.
- [ ] Add Playwright E2E test covering the newly implemented Feature 021 mobile dock navigation.
- [ ] Review Supabase RLS index usage with EXPLAIN ANALYZE on high-frequency tables.

---

## Tasks V1 deferrals (open — see docs/features/tasks-v1/IMPLEMENTATION_REPORT.md §6)

- [ ] Custom recurrence intervals (every N days/weeks).
- [ ] Per-organization custom task categories.
- [ ] "Everyone on shift" assignment (couples to Schedule).
- [ ] Automatic shift handoff (V1 is manual carry-forward / reassign / cancel).
- [ ] Optional manager verification (`pending_verification`) for cash count / temperature log / security closing.
- [ ] Per-assignee completion for shared tasks.
- [ ] Push / email / SMS notification channels.
- [ ] Realtime as an invalidation-only signal (re-evaluate; #134 is fixed and merged to `development`).
- [ ] Hosted real-mode Tasks suites (`tests/real/tasks-v1.db.real.test.ts`, `tests/real/ui/tasks.real.spec.ts`) in a protected CI job with DEV secrets.

## Carried over (unchanged by Tasks V1)

- #106 `private.has_org_role` creator bypass · #109 Table Allocation UX consistency · #134 production-build Realtime (**release blocker for `development → main`**) · PR #135 protected-Preview manual smoke · Neon credential rotation · production stale duplicate active-entry review.
