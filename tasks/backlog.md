# Feature & Engineering Backlog

This backlog holds upcoming feature specifications and technical debt items queued for implementation.

---

## 🚀 Upcoming Features (Queued)

| Item | Area | Priority | Spec Link | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Realtime Floor Sync** | Floor / Realtime | High | TBD | Add Supabase Realtime broadcast for multi-tablet table allocation updates. |
| **Shift Notes & Logbook** | Management | Medium | TBD | Manager-to-manager digital shift notes and shift-change handover. |
| **Section Layout Editor** | Settings | Medium | TBD | Drag-and-drop table and section customizer for floor plans. |
| **SMS Server Paging** | Notifications | Low | TBD | Twilio or web push notifications when servers are assigned next rotation table. |

---

## 🧹 Maintenance & Technical Debt

- [ ] Audit bundle size and dynamic import splitting for heavier settings dialogs.
- [ ] Add Playwright E2E test covering the newly implemented Feature 021 mobile dock navigation.
- [ ] Review Supabase RLS index usage with EXPLAIN ANALYZE on high-frequency tables.
