# V2-005.006-E: Stage E6 Independent Review. Findings and Fixes

Reviewer: Claude Code (Sonnet 5.5, new session independent of the Antigravity implementation).
Reviewed head: `1fd1b48a4c57a402213e74e31d5ab744bbbd01ed` (PR #316). All fixes are on the same feature branch.
Method: the implementation report was NOT treated as proof. Every claim below was reproduced
or disproved by running code (pgTAP, real GoTrue tokens through PostgREST, Vitest, Playwright).

## Severity summary

| Severity | Found | Fixed | Open                |
| -------- | ----- | ----- | ------------------- |
| P0       | 1     | 1     | 0                   |
| P1       | 8     | 8     | 0                   |
| P2       | 6     | 3     | 3 (accepted, below) |

## P0

**P0-1. Date Group import was NOT atomic.** `commitDateGroupImportAction` looped `inventory_date_lot_save`
per row; each RPC committed independently, so a stale/failed row 7 left rows 1-6 saved while the
UI reported failure (and the docs claimed an `inventory_date_group_import_commit` RPC that did not exist).
Reproduced in real-JWT: a batch with a later invalid row left earlier rows saved.
Fix: migration adds `public.inventory_date_group_import_commit` (ONE transaction, advisory-lock + durable
receipt table `inventory_date_group_imports`). The server action now makes exactly one RPC call.
Proof: pgTAP `0072` (45), real-JWT (8 import tests incl. two identical concurrent requests commit once),
action unit tests assert a single RPC and zero `inventory_date_lot_save` calls.

## P1

| #    | Finding                                                                                                                                                                                                         | Fix                                                                                                                                                                                                                                                        | Proof                                                             |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| P1-1 | **CI red: 0033 test 7** counted public inventory RPCs (19 -> 26). All 26 were correctly authenticated-only/not anon, so only the brittle count was wrong.                                                       | Legacy count scoped; added an exact allow-list assertion of the whole public Inventory RPC surface plus "no anon execute, all SECURITY DEFINER".                                                                                                           | pgTAP 0033 (110)                                                  |
| P1-2 | **CI red: 0035 test 65** `inventory_storage_areas` location FK was not DEFERRABLE (every other inventory table's is).                                                                                           | Named `inventory_storage_areas_location_fk ... deferrable initially deferred`; same for the receipt table. Test kept, not weakened.                                                                                                                        | pgTAP 0035, 0071                                                  |
| P1-3 | **"All Locations" label was fake.** The Cooler Layout loaded a single-branch snapshot and printed "All Locations" when no id was passed.                                                                        | Removed. Real branch name shown. New read-only **All authorized branches** view: server action proves each branch with the DB authority RPC + module gate, reads only those, returns per-branch stock (never blended). No branch id comes from the client. | `storage-overview-data` tests (6), cooler tests, Playwright       |
| P1-4 | **Stale placement/area/shelf overwrite.** The RPCs updated whatever id was passed, ignoring versions, so a stale editor silently overwrote a newer change.                                                      | Versions on areas, shelves, placements; every write takes `p_expected_version` and raises PT409; dialogs capture the version at open.                                                                                                                      | pgTAP stale tests; real-JWT race: exactly one of two writers wins |
| P1-5 | **Shelf delete silently destroyed placements** while the UI promised "returned to Unassigned"; no audit.                                                                                                        | RPC refuses unless `p_remove_placements = true`; each removed placement and the shelf are written to `inventory_change_log` (new entity types + `delete` action); accurate confirm text. Stock untouched.                                                  | pgTAP, real-JWT, cooler tests                                     |
| P1-6 | **Archived-area products became undiscoverable.** Unassigned = "no placement anywhere", so an item placed only in an archived area vanished from every view and could not be recovered.                         | Three states: placed (active rack), "In archived storage" (listed with the area name and a Restore action), unassigned. New Archived areas view + Restore.                                                                                                 | cooler tests, Playwright                                          |
| P1-7 | **Date Group import silently reactivated archived groups** (`p_active: true` forced) and the stale guard was vacuous (expected version re-read at commit, fingerprint ignored versions and used a 32-bit hash). | Archived group = row error. Plan carries the previewed version; fingerprint (53-bit) covers versions and precision; DB re-checks the version and refuses archived groups.                                                                                  | domain tests, pgTAP, real-JWT                                     |
| P1-8 | **Place Product could only place the first unassigned product** (no picker), and a product already on another shelf could not be placed.                                                                        | Placement dialog has a product picker; same product on several shelves is allowed (Option A).                                                                                                                                                              | cooler + Playwright                                               |

## P2

Fixed: Duplicate area/shelf/slot races closed by unique indexes behind friendly errors (P2-1); icon-only
buttons had 24 px targets and no accessible names (P2-2, now 36 px + labels); editing an archived area through
the dialog forced it active (P2-3).

Accepted (nonblocking, documented):

- **P2-4** Storage tables are not in the Supabase Realtime publication. Another manager's placement change
  appears on the next action/focus refresh, not instantly. Versioned writes prevent any overwrite.
- **P2-5** `parseImportNumber` now also accepts fractions in stock-import CSV cells ("1/2"). Spreadsheet
  apps turn "1/2" into a date before export, so this is harmless; unsupported fractions fail with a clear error.
- **P2-6** The item sheet does not state that Counts/Levels/Dates are for the active branch; product metadata
  is edited only under Manage, which is organization-wide by design.

## Verified as correct (no change needed)

- Fractions: exhaustive proof that `n/d` is accepted exactly when it is a whole number of cents; unsupported
  fractions, `1/0`, negatives, NaN, Infinity, exponents, unicode digits and 20-digit overflow all fail cleanly.
- Individual select, Select All, Select filtered, Select all eligible, Clear, indeterminate header, archived
  exclusion, branch-switch reset, no selection-driven writes (6 tests + Playwright).
- Option A: no quantity column on placements; every storage RPC leaves each stock row (quantity + version)
  and the ledger byte-identical (pgTAP + real-JWT).
- All 7 storage RPCs: SECURITY DEFINER, empty search_path, derive the caller from the session, check live
  session + manager level + location + module, validate every referenced id.
