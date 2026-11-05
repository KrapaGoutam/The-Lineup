# V2-003.004 — Evidence and Claude Local Handoff

State: **`LOCALLY_VALIDATED`** (2026-11-04). The Cloud section below is Cloud-only evidence; the **Claude Local validation** section at the end holds the hosted-DEV, real-browser (Chromium + WebKit iPad), real-passcode and race evidence and supersedes the "NOT DONE" rows.

## Cloud evidence (this session)

| Gate                                                                                                                              | Result                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Git preflight                                                                                                                     | `origin/development` `398393bfa4f0a8edb5b99f33b78574960d74666a`, `origin/main` `5e5b7747693b6e81014eafdf299b87e56c3f033d`; PRs #287 and #289 verified merged                                                                                                                                                                                                                                       |
| `git diff --check`, `npm run format:check`, `npm run lint` (`--max-warnings=0`), `npm run typecheck`, `npm run check:local-paths` | pass                                                                                                                                                                                                                                                                                                                                                                                               |
| `npm test`                                                                                                                        | 209 files — 2,880 passed, 7 existing skips (≈ +76 tests over the 2,813 baseline of PR #289)                                                                                                                                                                                                                                                                                                        |
| `npx next build --webpack`                                                                                                        | pass in demo mode and in real mode (placeholder Supabase config)                                                                                                                                                                                                                                                                                                                                   |
| Playwright (demo) `context-switcher-demo`, `default-landing`, `single-context-entry-demo`                                         | 26/26 on `desktop` + `server-mobile`                                                                                                                                                                                                                                                                                                                                                               |
| Exact-head CI                                                                                                                     | see the PR checks (recorded on the PR, not duplicated here)                                                                                                                                                                                                                                                                                                                                        |
| Mutation checks                                                                                                                   | each of these deliberately broken versions fails the intended tests and was reverted: drop the cookie-organization conflict check (2 failures); ignore the Referer consistency hint (2); fall back to the first eligible location when the cookie is unverifiable (3); write the cookie before authorizing the selection (9); sign-out that does not clear the cookie (2); `Secure` forced off (1) |
| Hosted DEV real-JWT                                                                                                               | not run in Cloud — **done Local: 46/46** (see below)                                                                                                                                                                                                                                                                                                                                               |
| Real browser Chromium + WebKit iPad                                                                                               | not run in Cloud — **done Local: 25/25 each** (see below)                                                                                                                                                                                                                                                                                                                                          |

## Real-test files updated for the new contract (written in Cloud; executed in Claude Local)

The V2-003.002/.003 hosted tests encoded "the Referer selects the location". That behavior was removed by design, so they were rewritten to persisted-cookie semantics: `tests/real/org-location-switcher.db.real.test.ts` (SW-OPS-01…05), `tests/real/single-context-auto.db.real.test.ts` (block D). New: `tests/real/context-persistence.db.real.test.ts` (LIVE-PERSIST-A…G = checklist A–G) and one browser test appended to `tests/real/ui/org-location-switcher.real.spec.ts`. The first hosted run needed two small harness fixes (see Claude Local validation); the assertions are unchanged.

## Claude Local handoff

- **Fetch the existing Cloud branch** `feature/v2.0-003.004-secure-context-persistence` and the existing PR #291. Do not duplicate the PR or implementation. Final head SHA: the PR head at hand-off (re-read it; do not trust a stale value).
- Hosted DEV only (`opmujepkemwcdxxorhfd`); Production `ftadewtkjlaotfdvtjcv` and `main` are strictly out of bounds. Synthetic fixtures only; clean them all up.
- No migration, so no `db:types` / pgTAP change is expected.

### Contract to verify

Cookie `lineup_active_context` = `{"v":1,"o":…,"l":…}`; `HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`; `Secure` for production (loopback-http exempt); host-only. Written only by `setActiveContextAction` after `listCurrentEligibleContexts` (canonical resolver) authorizes the pair; cleared by `clearActiveContextAction`, `POST /api/auth/signout`, and successful passcode/register sign-in. `getPrimaryLocation` resolves from the cookie; the Referer can only reject.

### Hosted DEV (real JWT + RLS): `npm run test:real -- tests/real/context-persistence.db.real.test.ts tests/real/org-location-switcher.db.real.test.ts tests/real/single-context-auto.db.real.test.ts`

A persistence · B no-Referer write (DB confirms organization/location) · C invalid/stale · D cross-organization · E revocation (next request fails) · F sign-out / second employee · G deep-link mismatch.

### Browsers (Chromium + WebKit iPad `host-tablet`): `npm run test:real:ui -- tests/real/ui/org-location-switcher.real.spec.ts`

Check the cookie in the real browser (HttpOnly, not in `document.cookie`, Lax, `/`, 7 days; WebKit must store it over `http://localhost`), reload / new tab / **browser restart** (PERSIST-16, not covered in Cloud), authenticated session refresh, sign-out, cross-organization switching, missing Referer, deep-link/cookie mismatch (watch the brief "Confirming your location…" state), back/forward (a restored stale entry must not write to the other location).

### Specifically verify (not covered by Cloud)

1. A **real passcode sign-in** clears an existing context cookie (the behavioral test needs the real passcode route; Cloud only has a static guard) and `router.refresh()` then shows the picker for a multi-location user.
2. After the gate persists a deep-linked location, subsequent real Server Actions (Schedule next-week, a Task create) carry `?location=` in the Referer and succeed.
3. `history.replaceState` canonicalization does not disturb `?tab=` navigation or back/forward in the real browser.

### Remaining known risks

V2-003.005 (a second tab that switched workspace is refused on its next action but gets no dedicated message; stale router-cache back/forward entries likewise); V2-005 (direct-PostgREST cross-location RLS, action `locationId` binding, module scoping — Production blockers; **not fixed here**); V2-008 (assignment backfill); the cookie lifetime is fixed (not sliding) by design.

### Merge requirements

All Local checks above pass; exact-head CI green on the final head; blockers 1–10 in STATUS.md all false; regular merge commit into `development` (no squash/rebase); `main`/Production untouched; Program #248 and Parent #251 stay open; V2-003 is **not** complete until V2-003.005.

## Claude Local validation (2026-11-04)

Cloud head `ba0ea469…` (PR #291). Hosted DEV `opmujepkemwcdxxorhfd` only; Production `ftadewtkjlaotfdvtjcv` and `main` were never contacted. Browser tests ran against a **production build** (`next start`, `NODE_ENV=production`) pinned to DEV (build output scanned: 0 files reference the Production ref) on `http://localhost:3000`.

### Hosted DEV real-JWT (`npm run test:real -- <3 suites>`): 46/46

| Suite                                   | Result |
| --------------------------------------- | ------ |
| `context-persistence.db.real.test.ts`   | 7/7    |
| `org-location-switcher.db.real.test.ts` | 17/17  |
| `single-context-auto.db.real.test.ts`   | 22/22  |

The first run failed 2 tests, both **harness** defects (the application behaved correctly): LIVE-PERSIST-F ran after LIVE-PERSIST-E had deactivated the shared `coworker`'s second assignment (so one eligible location correctly auto-resolved), and F's real sign-out genuinely revoked `multi`'s Auth session for LIVE-PERSIST-G. Fixed by restoring the assignment at the end of E and signing `multi` in again after F; F additionally asserts the real session is gone (`auth.getUser()` is null). No security assertion was weakened.

### Real browsers

`tests/real/ui/context-persistence.real.spec.ts` (new, 19 tests) and `tests/real/ui/org-location-switcher.real.spec.ts` (6): Chromium (`desktop`) **25/25**, WebKit iPad (`host-tablet`, `iPad (gen 7) landscape`) **25/25**; the documented `npm run test:real:ui -- tests/real/ui/org-location-switcher.real.spec.ts` (Chromium, repo config) 6/6. Synthetic users sign in through the **real `/api/auth/passcode` route** (login-screen field). The repo's real config only defines Chromium, so the WebKit run used a throwaway config adding the `host-tablet` project (not committed). The existing spec's two `toHaveURL` assertions got a 30 s timeout (the switch is now a verified server round-trip plus a navigation; the 5 s default flaked against hosted DEV) and its cookie test skips the stored-`sameSite` check on WebKit (see below).

| Area                                 | Observed                                                                                                                                                                                                                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wire `Set-Cookie`                    | `lineup_active_context=<v>; Path=/; Expires=…; Max-Age=604800; HttpOnly; SameSite=lax` — no `Domain`, no `Secure` on loopback HTTP                                                                                                                                         |
| Stored by the browser                | Chromium and WebKit: HttpOnly, path `/`, expiry ≈ now + 7 d, value `{"v":1,"o":…,"l":…}`; absent from `document.cookie`                                                                                                                                                    |
| SameSite in the stored cookie        | Chromium reports `Lax`. Playwright's WebKit build reports `None` for **every** cookie (probe: even `SameSite=Strict`), so Lax is asserted from the wire header there                                                                                                       |
| Reload / new tab / `?tab=` / restart | preserved; "restart" = a new browser context carrying only persistent cookies (session cookies dropped)                                                                                                                                                                    |
| Real passcode sign-in                | clears a pre-existing saved workspace (`Max-Age=0`) → a multi-location user gets the picker; a wrong passcode (401) leaves the cookie untouched; a single-location user enters automatically                                                                               |
| Sign-out / shared device             | UI sign-out → `Max-Age=0`; the next employee on the same browser gets the picker, not the previous workspace                                                                                                                                                               |
| No-Referer Server Action             | a real task action replayed with the Referer removed wrote exactly 1 row at the persisted location (organization + location confirmed in the database); a Referer naming the other location wrote 0 rows; 0 rows at the other location                                     |
| Deep link `?location=B`, cookie `A`  | "Confirming your location…" keeps the workspace unmounted until the server confirms; the cookie flips to B only afterwards; an aborted confirmation shows the recovery screen with the cookie unchanged; Try again recovers; Choose a location clears and shows the picker |
| Unauthorized `?location=`            | refused, nothing persisted                                                                                                                                                                                                                                                 |
| Cross-organization switch            | cookie becomes `{o: Q, l: Q1}` only; the other organization's locations never appear                                                                                                                                                                                       |
| Immediate revocation                 | the next action (replayed after deactivating the assignment) wrote 0 rows; the next load shows "Location selection is no longer valid" with recovery; a denied Tasks read shows "Tasks could not be loaded" (an error, not an empty list)                                  |
| Failed switch                        | "We couldn't switch to that location…" alert, no navigation, no cookie, retry works                                                                                                                                                                                        |
| URL canonicalization                 | `?tab=tasks` kept, `location=` added by `history.replaceState`; `history.length` unchanged                                                                                                                                                                                 |
| Back / forward                       | back from B to A: URL, label and cookie all end at A (the gate re-persists the verified explicit selection); 3 navigations, no loop; a write from the restored entry landed at A (what was on screen)                                                                      |

### Races (real browsers, database-confirmed)

- **A** two quick selections: the second is ignored (buttons disabled, re-entrancy guard); URL, cookie and label agree.
- **B** delayed sign-out: the forced sign-out (revoked session) was held 10 s and the next employee's passcode was typed at once. The sign-in request left only when the sign-out finished (`signout response @10067 ms`, `passcode request @10067 ms`) and the new session survived a reload. The ordering is the client's `settleSignOut()`; server-side the two endpoints are independent (unchanged, pre-existing).
- **C** stale tab (Tab 1 on A, Tab 2 switched to B): Tab 1's task creation is refused (Referer A vs cookie B), 0 rows anywhere. **UX finding for V2-003.005:** the alert reads "No location is set up yet.", which misdescribes a stale workspace (it does not imply success).
- **D** action held in flight while another tab switched to B: refused, 0 rows.
- **E** one employee on two browsers: independent preferences; each task lands on its own location.
- **KNOWN-RESIDUAL** the same stale tab with its **Referer stripped** (privacy extension or a `Referrer-Policy`; the app sets none, so default browsers send it) writes to the **persisted** location (B) while the screen shows A. It never writes anywhere other than the persisted location and is safer than the pre-004 behaviour (oldest location). Not an ordinary workflow; owned by V2-003.005 (stale-tab UX) and V2-005 (server-authoritative `locationId` binding). Characterized by an explicit test so a future fix flips it deliberately.

### Source change found by the review (one, narrow)

`shouldUseSecureCookie` collapsed `X-Forwarded-Host ?? Host` into one value, so a client-supplied `X-Forwarded-Host: localhost` with a real `Host` and no `X-Forwarded-Proto` produced a non-`Secure` cookie (reproduced against the real server). On Vercel the platform always sets `X-Forwarded-Proto: https`, which already forces `Secure`, and the response only reaches the requester, so impact there was nil — but it contradicted the documented invariant. The exemption now requires the received `Host` **and** any forwarded host to be loopback (`context-cookie.ts`, `context-cookie-writer.ts`). Probed against the rebuilt server: loopback HTTP → not Secure; real Host, `x-forwarded-proto: http`, spoofed `x-forwarded-host: localhost` (also as a list with `evil.com`) and look-alike hosts (`localhost.evil.com`, `localhost@evil.com`) → all `Secure`. Regression tests in `context-cookie.test.ts` and `context-persistence.test.ts` (mutation check: the old header logic fails PERSIST-12).

### Other local gates

`npm run format:check`, `lint` (`--max-warnings=0`), `typecheck`, `check:local-paths` pass; `npm test` 2,880 passed | 7 skipped; real-mode `next build --webpack` (DEV-pinned) passes.

### Cleanup

DEV before and after (counts): 53 Auth users (45 pre-existing `@harness.invalid`, 8 other), 30 organizations, 44 locations, 53 profiles, 38 tasks — **identical**. One interrupted run (a stopped Playwright process skipped its teardown) left 5 `v2cp-*` users and 2 organizations; they were identified by the `v2cp-<runId>` prefix and removed. The 45 older `v2h-*@harness.invalid` users were not touched.

### Not covered / out of scope

A database or Auth-service outage was exercised at the unit/double level (CP / NOTICE) and by aborting the Server Action call in the browser (SWITCHFAIL, DEEPLINK), not by taking hosted DEV down. Direct-PostgREST cross-location access and the client-supplied `locationId` on Schedule / Tips / Allocation actions are unchanged V2-005 work and remain a Production release blocker. Not tested over real HTTPS (no TLS terminator): `Secure` is covered by unit tests plus header probes against the real server.
