# Test matrix — Same-server repeat table (#166)

Layers: **P** pgTAP (`supabase/tests/database/0032_table_allocation_same_server_repeat.test.sql`) · **U** unit/component (Vitest) · **D** domain scenario matrix (Vitest) · **E** demo Playwright matrix (desktop + host-tablet + server-mobile) · **R** hosted DEV DB through PostgREST with real JWTs (`tests/real/same-server-repeat.db.real.test.ts`) · **H** hosted DEV UI on a production build (`tests/real/ui/cross-view-integrity.real.spec.ts`).

The shared cross-view scenario list was **extended, not rebuilt**: `Step` gained one action, `repeat` (`choose: "end-previous" | "cancel"`). The old `same-server` step now means _blocked, not a later turn_. The same scenarios run in D (pure reducer + shared classifier + read model, five-view check) and E (the real UI of each origin).

## Requested minimum matrix

| ID     | Case                                         | Layers      | Where                                                                                                    |
| ------ | -------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------- |
| SS-001 | same server, same turn → no mutation         | P U D E R   | P §2 (retry exact/numeric/confirmed, no event), P §4 (held later), XM-020 ×4, XM-016, R, `classify` unit |
| SS-002 | same server, later turn, exact T2            | P U D E R H | P §3, XM-071 ×4, component "End Previous + Assign / Cancel", R, H `SS-002`                               |
| SS-003 | same server, later turn, numeric `2`         | P U D E R   | P §3 (`2`), XM-073, R (`31` → T31)                                                                       |
| SS-004 | End Previous + Assign → old ended/new active | P D E R H   | P §5, XM-070 ×4, R, H                                                                                    |
| SS-005 | Cancel → no mutation                         | P U D E H   | P §3 (refused calls write nothing), XM-071 ×4, component Cancel, H `SS-002`                              |
| SS-006 | cross-server conflict unchanged              | P U D E R   | P §8, XM-021…023, existing 0030/0031, R                                                                  |
| SS-007 | combined assignment, same-server repeat      | P U D E R   | P §7, XM-072 ×4, component copy, R                                                                       |
| SS-008 | stale client                                 | P U R H     | P §10, component `stale`, R "stale" ×3, H `SS-008` (Realtime socket blocked)                             |
| SS-009 | Undo                                         | P D E R     | P §6, XM-074, R                                                                                          |
| SS-010 | Redo                                         | P D E R     | P §6, XM-074, R                                                                                          |
| SS-011 | reload persistence                           | R H         | R "durable", H `SS-002` (owner reload)                                                                   |
| SS-012 | five-view convergence                        | D E H       | every `XM-07x` (`checkViews` / `assertBoardAcrossViews`), H `SS-002`/`SS-008`                            |

## Extra coverage

| Case                                                                                                                           | Layers  |
| ------------------------------------------------------------------------------------------------------------------------------ | ------- |
| Repeat that also needs another server's table: refused atomically, then confirmed in one call                                  | P R U   |
| Confirm / transfer flags never bypass the rule                                                                                 | P R     |
| Earlier-turn hole (`same_server`) blocked even when confirmed                                                                  | P R D E |
| Concurrent confirmed repeats serialize; exactly one claim; loser is `PT409 same_server`                                        | R       |
| Contract surface: grants, SECURITY DEFINER, fixed `search_path`, single 8-arg `board_assign`, private impl not executable      | P       |
| Authorization: outsider → `42501`, no JWT → `42501`; every operating role gets the same decision                               | P R     |
| Recent Activity copy for `repeat: true`                                                                                        | U       |
| Demo reducer mirror (`endPrevious`): later turn ends previous whole, earlier/same turn refused, never displaces another server | U       |

## Deliberately changed existing tests

| Test                                                                                | Change                                                                                   |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `table-conflict.test.ts` "same server asking again is a same-server duplicate"      | now a **later turn → repeat**; blocked case moved to a hole-before-held-turn             |
| `cross-view-matrix` XM-020 / XM-016                                                 | blocked scenarios now set up an earlier empty turn (unassign the first table first)      |
| `cross-view-matrix.test.ts` ended-then-re-held invariant                            | dropped the "an ended table is never re-held by the same server" clause (now allowed)    |
| `cross-view-integrity.test.tsx` "same server asking again gets a message"           | later-turn → dialog; later-held → message; End + Assign call carries `endPrevious:false` |
| `tests/real/table-allocation-conflicts` / `table-input-canonical` same-server cases | `kind` is now `same_server_repeat` for a later turn                                      |
| `cross-view-integrity.real.spec.ts` "same-server duplicate: a message"              | replaced by `SS-002` (dialog → Cancel → End Previous + Assign → reload)                  |
