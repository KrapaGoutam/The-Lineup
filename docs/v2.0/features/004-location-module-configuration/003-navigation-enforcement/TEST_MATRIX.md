# V2-004.003 — Test matrix

Statuses below distinguish executed unit/JWT evidence from pending browser acceptance.

| Cases            | Evidence                                                                                                                                                  | Status                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| NAV-01–10        | Pure policy: explicit enabled/disabled/missing/failure, Settings, Team/Inventory role intersection, canonical key/tab mapping; reader/registry regression | PASS                                                         |
| NAV-11–19        | Shell component primary combinations/dock counts, secondary filtering, Settings-only, no disabled Tasks badge/reminder; responsive browser matrix         | Unit PASS; browser pending                                   |
| NAV-20           | Native Dialog focus/Escape/restoration; responsive keyboard/touch acceptance                                                                              | Browser pending                                              |
| NAV-21–25, 29–30 | Policy/URL/shell tests: direct denied Recipes never mounts, cleans recipe/mode, deterministic fallback, stable replacement, context retained              | PASS unit; browser pending                                   |
| NAV-26–28        | Native browser history/reload; context-aware URL normalization regression                                                                                 | Browser in progress                                          |
| NAV-31–32        | Real DEV JWT A/B/C persisted rows and foreign-org denial                                                                                                  | PASS 9/9 suite                                               |
| NAV-33–35        | Scope identity checks, mismatch loading/normalization guard and server-refresh unmount test                                                               | PASS unit; browser pending                                   |
| NAV-36–38        | Existing context resolver tests; real DEV inactive/archive refusal; system-only Settings recovery                                                         | Resolver/JWT PASS; browser pending                           |
| NAV-39           | Distinct unavailable snapshot and Settings refresh UI                                                                                                     | PASS unit                                                    |
| NAV-40           | Existing keyed profile/org/location/epoch boundary retained; account/context regression                                                                   | Unit PASS; browser pending                                   |
| NAV-41–43        | Recovery component/action tests preserve active allowed targets and reason/refusal; actual synthetic reset plus unauthorized endpoint test                | Unit PASS; browser pending                                   |
| NAV-44–46        | Settings/More retain self-change/sign-out, all-disabled/missing explanation and authorized admin path                                                     | Unit PASS; browser pending                                   |
| NAV-47–49        | Demo config bypass and role restrictions, existing editor tests; complete demo regression                                                                 | Unit PASS; desktop 335/337 plus 4/4 artifact-only retry PASS |
| NAV-50           | Context component regression 46/46, broader focused 83/83; authenticated native history gate                                                              | Unit PASS; browser in progress                               |
| NAV-51           | Desktop demo allocation/Tasks regression; two trace artifact collisions rerun without source change                                                       | PASS tested cases; final CI pending                          |
| NAV-52           | Save action refreshes only on success; actual navigation updates after editor save                                                                        | Unit PASS; browser pending                                   |

No schema/RLS changed; accepted V2-004.001 pgTAP 62 files / 2,012 assertions reused. Full database reset not needed or run. No skipped gate is marked passed. Final gate counts live in EVIDENCE and PR.
