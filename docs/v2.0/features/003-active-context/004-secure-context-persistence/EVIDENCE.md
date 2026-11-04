# V2-003.004 — Evidence and Claude Local Handoff

State: **`READY_FOR_CLAUDE_LOCAL_VALIDATION`**. Cloud has no Supabase credentials and no WebKit, so nothing below is hosted-DEV or WebKit evidence. Do not merge before the Local checklist passes.

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
| Hosted DEV real-JWT                                                                                                               | **NOT DONE** (Cloud)                                                                                                                                                                                                                                                                                                                                                                               |
| Real browser Chromium + WebKit iPad                                                                                               | **NOT DONE** (Cloud)                                                                                                                                                                                                                                                                                                                                                                               |

## Real-test files updated for the new contract (written, NOT executed here)

The V2-003.002/.003 hosted tests encoded "the Referer selects the location". That behavior was removed by design, so they were rewritten to persisted-cookie semantics: `tests/real/org-location-switcher.db.real.test.ts` (SW-OPS-01…05), `tests/real/single-context-auto.db.real.test.ts` (block D). New: `tests/real/context-persistence.db.real.test.ts` (LIVE-PERSIST-A…G = checklist A–G) and one browser test appended to `tests/real/ui/org-location-switcher.real.spec.ts`. Expect to fix small harness details on first hosted run; the assertions are the contract.

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
