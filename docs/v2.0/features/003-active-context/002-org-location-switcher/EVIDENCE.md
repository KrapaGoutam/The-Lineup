# V2-003.002 — Evidence

> Cloud evidence uses an in-memory Supabase double that emulates the real RLS
> read rules. It is **not** hosted DEV verification.

## Cloud (2026-11-04)

See the PR for exact-head CI. Local gates run before push:
`vitest` (context + components), Playwright `desktop` + `server-mobile`
(`context-switcher-demo`, `default-landing`: 24/24), `npm run lint`,
`npm run typecheck`. Final full-gate results are recorded in the PR.

## Local verification (2026-11-04, Claude Code Local)

### Defect found and fixed on this PR

The Cloud implementation hydrated Schedule / Tips / Allocation from the
selected location but every follow-up read and Server Action (week navigation,
tips roster, allocation actions, Tasks, Bar Inventory — 16 call sites) still
resolved its location through the legacy `getPrimaryLocation()` (oldest
assigned location). A user assigned to Webster and NASA who selected NASA saw
the NASA header but follow-ups ran against Webster (wrong time zone / wrong
branch) — a wrong-location read/write path reachable only through the switcher.

Fix (single choke point, no per-action rewrite): `getPrimaryLocation()` now
reads the same-origin `Referer` (Server Actions POST from the page URL, so it
carries the temporary `?location=`), treats it as an untrusted PREFERENCE and
verifies it with the canonical `resolveCurrentActiveContext` (RLS-bound
assignment / lifecycle / organization checks). Result is the verified location,
or `null` (safe denial — never a substitute location) when the selection
cannot be verified for the organization being operated on. Requests with no
selection keep the legacy behavior.

### Hosted DEV (`opmujepkemwcdxxorhfd`) — real JWT + RLS

`tests/real/org-location-switcher.db.real.test.ts` — **16/16 passed**
(SW-LIVE-01…12, SW-ROLE-01 Manager@A / Staff@B, SW-OPS-01…04). Synthetic
org/users only; cleanup verified (0 orgs / profiles / auth users left).

### Real-browser (hosted DEV session cookies, Next dev server pinned to DEV)

`tests/real/ui/org-location-switcher.real.spec.ts` at 390 / 768 / 1366 on
Chromium (desktop) and WebKit (iPad landscape, host-tablet): **10/10**.
Header fits (no horizontal overflow), trigger ≥ 44px, menu not clipped, items
≥ 44px, Escape closes + returns focus, ArrowDown/Up + Enter switches, reload
keeps the temporary selection, back/forward restore it, single-location user
sees a plain indicator, a foreign `?location=` shows the recovery screen.
Server Action POSTs were observed carrying `Referer: …?location=<selected>`.

### Operational matrix after the fix

| Area                                           | Before                                         | After                    |
| ---------------------------------------------- | ---------------------------------------------- | ------------------------ |
| Schedule initial / week navigation             | initial PASS / week nav FAIL (oldest assigned) | PASS (verified selected) |
| Tips initial / clocked-in roster               | initial PASS / roster tz FAIL                  | PASS                     |
| Allocation initial / day nav                   | initial PASS / action FAIL                     | PASS                     |
| Tasks, opening reminders, history              | FAIL (oldest assigned)                         | PASS                     |
| Bar Inventory catalog, history, import, orders | FAIL (oldest assigned)                         | PASS                     |
| Unverifiable / other-org / malformed selection | n/a                                            | SAFE DENIAL (null)       |

### Residual risks (recorded, not fixed here)

- **V2-005 release dependency:** several operational tables use
  organization-based RLS; direct PostgREST can still cross locations. Schedule /
  Tips / Allocation writes also accept a client-supplied `locationId` (the
  selected one in normal use). Location-scoped RLS and server-side location
  binding belong to V2-005.
- A request with **no `Referer`** (stripped by a privacy extension or
  `Referrer-Policy: no-referrer`) falls back to the legacy primary location.
  V2-003.004 (persistent context cookie) removes the dependency.
- **V2-008:** location-assignment backfill for legacy staff.
