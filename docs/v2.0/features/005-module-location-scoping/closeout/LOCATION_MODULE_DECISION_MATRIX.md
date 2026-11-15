# V2-005 Closeout — Location × Module Decision Matrix (public-safe)

Status: **PROPOSED — NO VALUE APPROVED.** Every cell below is `Needs owner decision`.

Rules that govern this matrix:

- Allowed approved values: `Enabled`, `Disabled`, `Not yet approved`.
- `Not yet approved` means **no row is written**. It is a legitimate pilot value but it keeps that location NOT READY for enforcement.
- A missing row is **not** Enabled. Nothing is copied from another branch, inferred from a branch name, stock level, attendance history or staff role, and nothing is auto-enabled or auto-disabled to make a count pass.
- Settings is system-required and has no row.
- Exact organization and location identities live in the private, git-ignored file `docs/testing/v2-005-closeout/LOCATION_MODULE_DECISION_MATRIX_PRIVATE.md` (generated 2026-11-09). This public repository carries counts and groups only.

Columns: Allocation · Tasks · Schedule · Tips · Team · Attendance · Payroll · Bar Inventory · Recipes.

| Group                                         | Active locations | Allocation           | Tasks                | Schedule             | Tips                 | Team                 | Attendance           | Payroll              | Bar Inventory        | Recipes              |
| --------------------------------------------- | ---------------: | -------------------- | -------------------- | -------------------- | -------------------- | -------------------- | -------------------- | -------------------- | -------------------- | -------------------- |
| A1 "Manual Preview" › DEV Bar & Lounge        |                1 | Needs owner decision | Needs owner decision | Needs owner decision | Needs owner decision | Needs owner decision | Needs owner decision | Needs owner decision | Needs owner decision | Needs owner decision |
| A2 "The Monk's DEV" › DEV Location            |                1 | Needs owner decision | Needs owner decision | Needs owner decision | Needs owner decision | Needs owner decision | Needs owner decision | Needs owner decision | Needs owner decision | Needs owner decision |
| B `V2 Harness <hash>` › Harness A / Harness B |               28 | Needs owner decision | Needs owner decision | Needs owner decision | Needs owner decision | Needs owner decision | Needs owner decision | Needs owner decision | Needs owner decision | Needs owner decision |
| C `V2 Harness Other <hash>` › Harness Other   |               14 | Needs owner decision | Needs owner decision | Needs owner decision | Needs owner decision | Needs owner decision | Needs owner decision | Needs owner decision | Needs owner decision | Needs owner decision |

Groups B and C are 42 rows in the private matrix (one per location). They may be answered by one group decision **only if the owner states so explicitly**.

## Decisions the owner must make

| #   | Decision                                                                                                                                                                   | Why it matters                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| D1  | Pilot location(s) and exact module values                                                                                                                                  | Without an Enabled `bar_inventory` row the Cooler Layout cannot be reached on DEV                   |
| D2  | Are the 42 `V2 Harness` locations throwaway fixtures? If yes: archive them through the audited lifecycle path (then only 2 locations need reconciling) or configure all 42 | Activation readiness counts every active unarchived location                                        |
| D3  | Which actor and which organization will test **All authorized branches**                                                                                                   | The two non-harness organizations have one location each, so no multi-branch actor exists there     |
| D4  | May smoke tests write to existing DEV stock? If not: which dedicated test dataset, and who cleans it up                                                                    | Hosted smoke writes (quantity, date groups, import) must not alter real stock without authorization |
| D5  | Q1 (what a brand-new location starts with) and R2 (Team-gated roster edits)                                                                                                | Still open from V2-004; they shape activation behaviour, not the pilot                              |

## Agent proposal (a suggestion only, not a decision, not authorized)

If the owner wants the smallest useful pilot: write exactly one row, `bar_inventory = Enabled`, at one non-harness location chosen in D1; leave every other module and location untouched. Enforcement is STAGED, so a partial pilot is allowed and changes no backend behaviour. This proposal is deliberately kept out of the matrix cells above.
