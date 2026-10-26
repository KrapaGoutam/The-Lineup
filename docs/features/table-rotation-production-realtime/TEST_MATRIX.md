# #134 — Test matrix

All hosted runs: DEV Supabase `opmujepkemwcdxxorhfd` (pinned in the process env; `NEON_DATABASE_URL` blank); PROD ref `ftadewtkjlaotfdvtjcv` absent from `.next`.

| Run                                 | Code                      | Result                                                            |
| ----------------------------------- | ------------------------- | ----------------------------------------------------------------- |
| `next dev`, cross-view              | unfixed                   | 14/14 pass                                                        |
| `next build` + `start`, cross-view  | unfixed                   | **FAIL** at S07 (manager misses owner's T1); 2 pass, 11 not run   |
| prod, 3-context debug spec ×4       | unfixed + instrumented    | pass (timing-dependent); manager 15 / owner 22 `phx_join` frames  |
| prod, cross-view ×4 (2 fresh-start) | unfixed ± instrumentation | 14/14 each                                                        |
| prod, same debug spec               | fixed                     | pass; manager 2 / owner 3 `phx_join` frames                       |
| prod, `test:real:ui` (all)          | fixed                     | **18/18** (cross-view 14, A/B/C 1, Tasks 3)                       |
| `next dev`, `test:real:ui` (all)    | fixed                     | **18/18**                                                         |
| Vitest hook tests                   | unfixed → fixed           | new hook test fails → passes; 13/13                               |
| `npm test`                          | fixed                     | 491/491                                                           |
| lint / typecheck / format:check     | fixed                     | pass (format warns only on untracked `The Lineup.code-workspace`) |

Scenarios covering the contract: S07/S11 (manager open before the owner's action), S11-reload (D-03), S28 offline→online, A/B/C extended (five views agree), S13 user switch. Multi-view propagation: one canonical `router.refresh()` feeds Grid/Floor/Picker/Servers/Dashboard (A/B/C and S01). Event-loss convergence: unit test (`CHANNEL_ERROR` then `SUBSCRIBED` refetches) and S28.
