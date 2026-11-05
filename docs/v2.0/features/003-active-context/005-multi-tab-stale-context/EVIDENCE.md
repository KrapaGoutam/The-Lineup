# V2-003.005 — Evidence

Issue #295 · PR #296 · Parent #251 · Program #248 · Milestone #8. Start: `development` `fc9c6680c34a68cf627939dce9fb8ad1b991295e`. No migration. `main` (`5e5b7747693b6e81014eafdf299b87e56c3f033d`) and Production untouched. All hosted/browser runs used **only** `opmujepkemwcdxxorhfd` (the-lineup-dev) through a production build whose `.next` was scanned: no `ftadewtkjlaotfdvtjcv` reference.

## 1. The original defect, reproduced and closed

Reproduced on untouched `development` (`fc9c668`) with real JWTs: one employee assigned to P1 and P2, persisted at P1 then moved to P2 by "another tab"; the first tab (still showing P1) submits `task_create` **with no `Referer`**.

| Code                                                                                                                  | Result                   | Rows at P1 | Rows at P2 |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------ | ---------- | ---------- |
| `development` (before)                                                                                                | `ok: true`               | **0**      | **1**      |
| this branch (after), LIVE-MT-A                                                                                        | refused (`contextStale`) | **0**      | **0**      |
| this branch, real browser MT-11 / MT-12 (normal and stripped `Referer`, real UI submit, real request headers checked) | refused; stale panel     | **0**      | **0**      |

The `Referer` header was verified absent from the stripped request in the browser (`<meta name="referrer" content="no-referrer">`, header read from the captured request).

## 2. Unit (Vitest + jsdom)

`npm test`: **219 files, 3020 passed, 7 skipped** (the skips pre-date this work). New/extended: expectation contract (strict schema, drift classification), server helper with resolver seams, message contract, channel wrapper (unsupported / throwing constructor / post failure / echo / malformed / unsubscribe), history-origin detection, guard (triggers, throttle, coalescing, hidden tab, bfcache, cleanup, panel, recovery, choose-location incl. same-location, picker withheld), reconcile gate (confirm-on-history, publish only after confirmation), switch hook (failed switch publishes nothing, in-flight guard), prior-session, Tasks actions (every command gated; zero RPCs on refusal), sign-out ordering, and static boundary guards. A mutation check (disabling the id comparison in `assertWorkspaceExpectation`) turned 7 tests red and was reverted.

## 3. Hosted DEV, real Supabase Auth JWTs + RLS

`tests/real/multi-tab-context.db.real.test.ts`: **17/17** (`LIVE-MT-A…H`). Every mutation test asserts the exact rows at **both** candidate locations.

| ID  | Result                                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | stale write refused with and without `Referer`, 0/0 rows; tab B's write lands only at its own location; Tasks reads refuse                                                                                            |
| B   | request _sent before_ a switch → 1 row at the shown location; _sent after_ → refused 0/0 (MT-16)                                                                                                                      |
| C   | forged expectation (and forged cookie) grants nothing; missing / malformed / extra-field expectations fail safely, 0 rows                                                                                             |
| D   | revoked assignment refused on the next request (`access_changed`), still-assigned location usable only after a deliberate selection; inactive location denies                                                         |
| E   | persisted org Q vs tab built for org P refused; slug/assertion org mismatch refused; deliberate org Q works at Q only                                                                                                 |
| F   | another employee's session on the same cookie jar refused (`different_user`); no session → `signed_out`, write refused                                                                                                |
| G   | verification is read-only (never sets a cookie), reports the verified organization slug; single-location staff with no cookie keeps working; deliberate B writes only at B; two browsers keep independent preferences |
| H   | teardown, then exact table-count comparison                                                                                                                                                                           |

Related hosted suites re-run after the Tasks contract change (callers updated to send the shown workspace): `context-persistence` 7/7, `single-context-auto`, `org-location-switcher` all green. `active-context.db.real.test.ts` has **2 pre-existing failures** ("legacy getPrimaryLocation" assertions that V2-003.004 superseded); reproduced identically on untouched `development`, not touched here (follow-up).

### Fixture cleanup (the V2 login hotfix lesson)

`task_notifications` rows the app writes for a synthetic user block deleting its membership. `tests/real/support/dev-counts.ts` removes the task family first (`task_notifications` → `tasks` → recurrence/checklist → passcode tables → assignments → memberships → locations → organizations → profiles → auth users), is idempotent, and every hosted/browser run compares exact counts to a snapshot taken **before** any fixture existed:

```text
baseline        {"organizations":30,"locations":44,"memberships":52,"location_memberships":5,"overall_roles":0,"profiles":53,"tasks":42,"task_events":44,"task_assignments":13,"task_notifications":170,"task_recurrence_rules":1,"checklist_templates":2,"checklist_instances":19,"passcode_credentials":7,"passcode_login_attempts":534,"audit_events":1,"auth_users":53}
post-teardown   identical (asserted; drift object must be {})  — hosted suite and each browser run
```

The five persistent DEV accounts, their assignments and every historical `v2h-*` fixture were never touched.

## 4. Real browser (production build pinned to DEV, real passcode sign-in, real HttpOnly cookie)

`tests/real/ui/multi-tab-context.real.spec.ts` — two tabs = two pages of one context; two devices = two contexts.

| Project                        | Result    |
| ------------------------------ | --------- |
| Chromium desktop               | **20/20** |
| WebKit iPad (gen 7, landscape) | **20/20** |

Covered: MT-01/02/03/21 (blocked at once, refresh onto the verified location, `?tab=` kept, cookie never rewritten, no oscillation), MT-04, MT-05 (failed switch: no `context_changed` reached the other tab), MT-06 (one selection request), MT-07/08 (BroadcastChannel absent; visibility and bfcache reconcile; no polling), MT-09 (back **and** reload never re-persist; _Switch_ / _Stay_), MT-10, MT-11/12, MT-13 (genuine replay accepted; forged replays asserting another / a foreign location refused), MT-14 (revocation; the stale picker cannot reopen the revoked location), MT-15 (refresh goes to the verified organization), MT-17, MT-18, MT-19/20, MT-22 (PR #294 no-access screen), MT-23, and the stale panel at 375×667 in light and dark (keyboard focus lands on the primary action, ≥44 px targets, no horizontal overflow, text/card contrast ≥ 4.5, Enter recovers).

Prior browser specs re-run on the final build: `org-location-switcher` 6/6 (incl. 390/768/1366 px), `context-persistence` 19/19 with RACE-B 15/15 after the corrections in §6, `single-context-auto` 4/4 (build with the synthetic default tenant, as that spec requires), and the demo-mode (no Supabase) subset `context-switcher-demo`, `default-landing`, `tasks`, `tasks-history` 27/27 (MT-24). CI `browser-smoke` runs the full demo suite on the PR head.

**Limitation:** Playwright WebKit is a proxy, not a physical iPad. Not verified on hardware.

## 5. Intended behaviour changes to older specs

- `org-location-switcher` "Back returns to NASA": now asserts the confirmation (_This page is for NASA_), no silent re-persist, then _Switch_.
- `context-persistence` RACE-C (stale tab "still shows A") now asserts the tab is blocked; `KNOWN-RESIDUAL` (stripped-Referer replay "lands at B") is now `RESIDUAL-CLOSED` and asserts **0 rows**; HISTORY's probe no longer waits on a trigger that is correctly absent.

## 6. Defects found by validation (all fixed in this PR unless stated)

1. Stale panel stuck after re-choosing the location the tab already shows (browser MT-04).
2. Switcher bottom sheet covered by the fixed mobile nav below `lg` (pre-existing; browser narrow-viewport test).
3. Refresh from the old organization route landed on an invalid-context screen after a cross-org move (verdict now carries the verified slug).
4. A sign-in could inherit the previous employee's `?location=` when a session ended underneath the tab (hosted-browser RACE-B flaked ≈1/3 here, 0/8 on `development`) — see `prior-session.ts`.
5. RACE-B's ordering assertion presumed a forced sign-out request; with the guard the server may tear the tab down first, so the assertion applies only when a sign-out was issued (ordering itself is pinned deterministically in `client-sign-out.test.ts`).
6. Test premises: Playwright raises focus/visibility events itself, a backgrounded tab is `hidden`, Next.js runs Server Actions in a serial queue, WebKit reports cancelled setup requests as `Load failed`. Tests were corrected for these; no product assertion was loosened.

## 7. Security classification

| Finding                                                                                                                                                             | Class                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Tasks mutation by a stale tab (normal or stripped `Referer`) writes at another location                                                                             | **Fixed** (server comparison before the RPC; DB rows proven 0/0)                                                             |
| Tasks reads (snapshot, history) render another location under a stale tab's label                                                                                   | **Fixed**                                                                                                                    |
| Different employee signed in on the same browser — Tasks write/read                                                                                                 | **Fixed** (`profileId` in the assertion)                                                                                     |
| Forged / missing / malformed expectation                                                                                                                            | **Verified not exploitable** (never an authority; fails closed)                                                              |
| Revoked / inactive / cross-organization — Tasks                                                                                                                     | **Verified not affected** (canonical resolver on every request)                                                              |
| Cookie written by a received broadcast, by Refresh, or by verification                                                                                              | **Verified not affected** (read-only verification; static + hosted assertion)                                                |
| Stale tab + stripped `Referer` writing at the **persisted** location for Schedule, Tips, Table Allocation, Bar Inventory (inventory / import / order-draft) actions | **Deferred to V2-005** — **Production release blocker**                                                                      |
| Different employee acting through a tab that still shows the previous workspace, for the modules above                                                              | **Deferred to V2-005** (the guard blocks the UI quickly, the server does not refuse)                                         |
| Opening-reminder prompt read                                                                                                                                        | **Deferred to V2-005** (uses `getPrimaryLocation`); reminder acknowledge / unread count are user-scoped (not location-bound) |
| Payroll, attendance, recipes, team, location administration / lifecycle / staff-assignment actions                                                                  | Do not resolve "the active location" (org-level or explicit ids); **not assessed here** beyond that — V2-005                 |
| Direct-PostgREST cross-location RLS gap                                                                                                                             | **Deferred to V2-005** — **Production release blocker** (pre-existing, unchanged)                                            |
| Shell forced sign-out (`sessionInvalid`) issues a sign-out POST that could end ANOTHER employee's fresh session in a different tab                                  | **Deferred / follow-up issue** (pre-existing; the new guard deliberately issues no sign-out request)                         |
| Tasks controller re-reads whenever the shell re-renders (`onSessionInvalid` is an inline function)                                                                  | **Verified pre-existing; left** (efficiency follow-up)                                                                       |
| `active-context.db.real` legacy assertions failing on `development`                                                                                                 | **Pre-existing; follow-up**                                                                                                  |
| Physical iPad                                                                                                                                                       | **Unable to verify**                                                                                                         |

## 8. Not claimed

No global guarantee. The server consistency check protects the Tasks mutation/read path and ships a reusable helper; V2-005 must apply it (and location RLS) to every module before Production. Heuristics worth knowing: history origin detection uses a 5 s popstate window and the document-load navigation type within 15 s of load; passive reconciliation is throttled to one check per 5 s.
