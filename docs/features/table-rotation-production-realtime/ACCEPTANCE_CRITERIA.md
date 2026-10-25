# #134 — Acceptance criteria

- [x] Bug reproduced before the fix (first production run: S07, manager never shows `Table T1, assigned to TestServer1`).
- [x] Root cause proven (unstable `createClient` dependency → per-render resubscribe loop + same-topic channel reuse) — see `PLAN.md`.
- [x] Minimal client-only fix; no migration, no `NODE_ENV` branch, no timing change.
- [x] Unit regression fails before / passes after the fix.
- [x] Manager page opened before the owner action receives the change with no manual interaction (S07, S11, A/B/C) on a production build.
- [x] `next build` passes with DEV env; DEV ref present, PROD ref `ftadewtkjlaotfdvtjcv` absent from the bundle.
- [x] `next start`: full real-mode UI suite 18/18 (cross-view 14, A/B/C 1, Tasks 3).
- [x] `next dev` still 18/18.
- [x] Reconnect/rejoin convergence preserved (refetch on every `SUBSCRIBED`; S28 offline→online; unit test).
- [x] No token/PIN logging; temporary instrumentation removed before commit.
- [x] CI green on the exact PR head `bba051c` (application, browser-smoke, Vercel; the Database workflow was not triggered — no database paths changed).
- [x] Merged by merge commit `50fbd02` (PR #147) into `development`; `main` untouched; #134 closed with evidence.
