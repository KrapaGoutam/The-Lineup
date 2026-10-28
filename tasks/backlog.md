# Feature & Engineering Backlog

This backlog holds upcoming feature specifications and technical debt items queued for implementation.

---

## 🚀 Upcoming Features (Queued)

| Item | Area | Priority | Spec Link | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Bar Inventory V1** | Bar Inventory | High | #168 | Dashboard / Inventory / Manage, structured vendors, immutable adjustment history, CSV/XLSX import with preview, per-column filters, vendor-grouped Order Soon, analytics. IN BUILD (BI-0 → BI-10 merged; BI-11 final gate GO in PR; follow-ups below) (`docs/features/bar-inventory-v1/`). Roadmap #2. |
| **Bar Inventory — Vendor Order Drafts V1** | Bar Inventory | Medium | #190 | VOD-1 database/domain foundation merged via PR #193 at `876be20`: one active DRAFT per vendor + location, Suggested snapshot separate from Order Qty, notes/Included, Fill/Clear, DRAFT/SENT, RLS, concurrency, immutable Sent history, and inventory isolation. VOD-1.1 (#195) fixed the Order Qty save. VOD-2 UI + editing implemented (Order Drafts tab, editor, Dashboard Create/Open CTA, PT409 UI). VOD-3 COMPLETE, merged via PR #198 at `64e3007` (Drafts \| Sent switch, Copy Order, CSV/XLSX, Mark Sent, paged Sent history; no migration); VOD-4 hosted DEV final gate COMPLETE — GO (2026-10-27, one low-severity defect fixed via PR #200 at `f3b0e0d`): Vendor Order Drafts V1 is complete. Deferred from VOD-2 (not scheduled): "Add item" UI for a vendor item that is not low (the RPC already supports it); an in-app guard for leaving Bar Inventory entirely with unsaved draft edits (only `beforeunload` covers it today); Realtime/invalidation for drafts (focus and tab-open re-reads are used). VOD-4 ran the Order Drafts specs on `desktop`, `host-tablet` (WebKit) and `server-mobile` (20/20 each). Still not covered: the hosted browser spec on tablet/phone, an Assistant Manager browser session, a hosted-browser Staff server-action call. Tasks V1.1: T-1 (default landing + `?tab=`) COMPLETE; T-2 Management Today COMPLETE (PR #205, merge `46ea022`); T-3 next, not started. |
| **Tasks Today — management staff visibility** | Tasks | Medium | #169 | Owner / Manager / Assistant Manager: All Staff / My Tasks / per person in Today, staff name on each task. Planned in `docs/features/tasks-v1-1/`; **T-2 COMPLETE** (PR #205, merge `46ea022`; see `IMPLEMENTATION_REPORT.md`). Roadmap #3. |
| **Tasks notification scope** | Tasks | Medium | #154 | Limit the notification inbox to Opening and Closing operational work; semantics settled in `docs/features/tasks-v1-1/PLAN.md` D-3. **T-3 COMPLETE** (PR #207, merge `3a442a6`; gate in `private.tasks_notify`, migration `20261028090000`; ordinary `kind = 'task'` notifications suppressed, audit untouched; see `IMPLEMENTATION_REPORT.md`). **T-4 built and validated, PR open** (Opening reminder engine: `task_opening_reminders_sweep`, stages open / +15 / +30, migrations `20261028100000` + `20261028100100`, DEV only). The popup / catch-up UX is T-5. |
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
- [ ] Required / optional checklist items (a `required` flag). Tasks V1.1 treats every non-cancelled Opening item as required (owner Decision 4, `docs/features/tasks-v1-1/PLAN.md` D-6).
- [ ] Realtime as an invalidation-only signal (re-evaluate; #134 is fixed and merged to `development`).
- [ ] Hosted real-mode Tasks suites (`tests/real/tasks-v1.db.real.test.ts`, `tests/real/ui/tasks.real.spec.ts`) in a protected CI job with DEV secrets.

## Carried over (unchanged by Tasks V1)

- #106 `private.has_org_role` creator bypass · #109 Table Allocation UX consistency · #134 production-build Realtime (**release blocker for `development → main`**) · PR #135 protected-Preview manual smoke · Neon credential rotation · production stale duplicate active-entry review.

## Bar Inventory follow-ups (from the BI-11 gate; none blocks the module)

- [ ] **Owner decision:** export audit log (AC-EXP-4) — build `inventory_log_export` + migration, or record a waiver.
- [ ] **Owner / design decision:** light-theme contrast tokens (`--warn`, `--ok`, `--destructive`, `--muted-foreground`, `--primary`) are 2.7–4.3:1 against 4.5:1; app-wide.
- [ ] Import-commit hardening (migration): treat a missing expected version on an update row as an error; compare reason / location / plan on stage replay; require the staging actor and a maximum age on commit; take a per-location advisory lock (or order rows) to avoid deadlocks between concurrent imports; a pgTAP case for a forged plan carrying another tenant's ids.
- [ ] Full ARIA tabs (arrow keys, `tabpanel`) on the view switcher, and its specs.
- [ ] Out-of-order import previews (request sequence guard); analytics custom ranges older than the 365-day lookback; render cost of a 5,000-product table every second (memoise / paginate); table date presets keep a frozen "now".
- [ ] Low accessibility polish: column chooser focus on Escape, Enter in "New vendor name", polite confirmation for ± buttons, export panel width at 360 px, backdrop-click discarding typed data, `dvh` for dialog height, analytics card heading levels, 44 px primary row actions on touch.
- [ ] Realtime for catalog edits (rename / archive) if wanted; today they arrive on the next focus re-read or write.
