# V2-005 Closeout — Hosted Authenticated Owner Smoke (checklist, NOT EXECUTED)

Status: **NOT EXECUTED.** Precondition P-1 ([CONFIGURATION_APPROVAL.md](CONFIGURATION_APPROVAL.md)) is not granted, and on hosted DEV every optional module is hidden for every account because 0 configuration rows exist. A navigation test here would test nothing.

Target: the `development` Preview (or DEV-bound local build) against DEV `opmujepkemwcdxxorhfd`. Production is never used. Legitimate sessions only; no credential is printed or recorded.

Honest scope note: enforcement stays STAGED. Passing this smoke proves location scoping, UI gating and server-side guards. It does **not** prove ACTIVE-mode database rejection; that evidence is the local ACTIVE-mode suite and is re-proved only under the separate activation gate (P-3).

Record for every step: actor role, device/viewport, pre-state, post-state, pass/fail. Stock-changing steps run only on the dataset approved in D4, with exact before/after counts and a cleanup.

## Preconditions

- [ ] P-1 approved with exact triples; `bar_inventory` Enabled at each tested location.
- [ ] D3: an actor with genuine access to two or more branches (All authorized branches), and a single-branch manager.
- [ ] D4: approved dataset and cleanup owner; baseline counts captured (products 148 / stock 236 / adjustments 123 / date lots 47 / recipes 32 as of 2026-11-09, plus new storage tables at 0).

## Cooler Layout

- [ ] Inventory Table still works and is unchanged.
- [ ] Cooler Layout opens; shows the real branch name (never "All Locations").
- [ ] All Storage Areas; one specific cooler; one specific shelf; Unassigned; archived-area handling (listed as "In archived storage" with Restore).
- [ ] Search; product placement visible; the same product on several shelves.
- [ ] Item editor opens from a placed product; branch-wide stock label is not read as a per-cooler quantity.
- [ ] No cross-location stock mixing; placement edits leave stock quantity and version unchanged.

## All authorized branches

- [ ] Branches grouped separately with a clear branch identity; per-branch stock matches the single-branch view.
- [ ] Read-only: no write control is usable in this mode.
- [ ] A branch the actor is not authorized for never appears; a single-branch manager sees only their branch.
- [ ] A stale tab cannot mutate a different branch.

## Quantity, selection, dates

- [ ] Decimal and fraction input (0.5, 1/2, 1 1/2); unsupported fractions rejected with a clear message.
- [ ] Individual Select, Select all shown, Select all eligible, Clear; blank vs zero.
- [ ] Date Group preview; export → import round trip; one atomic commit; historical date precision.

## Negative security

- [ ] Staff cannot perform manager edits. Wrong-branch access denied. Revoked access fails. Foreign-organization access fails.
- [ ] Module visibility follows the configuration, including a deliberately Disabled module.

## Exit

- [ ] Post-state equals approved pre-state plus only the listed intentional changes; cleanup complete; evidence appended to this file; owner signs off or lists defects.
