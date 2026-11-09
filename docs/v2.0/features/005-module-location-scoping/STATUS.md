# Feature V2-005: Existing Module Location Scoping — Status

```text
Status: IMPLEMENTED (all eight subfeatures merged; formal closeout pending)
GitHub Issue: #253
Target Branch: development
```

- V2-005.001: MERGED / IMPLEMENTED; PR #306 merged into development `3fa0bf72`.
- V2-005.002: MERGED / IMPLEMENTED; PR #311 merged into development `d7268978`.
- V2-005.003: MERGED / IMPLEMENTED; PR #312 merged into development; hosted DEV migrated 77 -> 78 (`20261107194700`); [Tips status](003-tips/STATUS.md).
- V2-005.004: MERGED / IMPLEMENTED (Batch A, PR #313); hosted DEV migrated 78 -> 79 (`20261107224300`); [Schedule status](004-schedule-roster/STATUS.md).
- V2-005.008: MERGED / IMPLEMENTED (Batch A, PR #313); [Team/Settings status](008-team-settings/STATUS.md).
- V2-005.005: MERGED / IMPLEMENTED (PR #314); hosted DEV migrated 79 -> 80 (`20261108021714`); [Payroll status](005-payroll/STATUS.md).
- V2-005.006: MERGED / IMPLEMENTED (Batch B, PR #315); hosted DEV migrated 80 -> 81 (`20261108160000`); [Bar Inventory status](006-bar-inventory/STATUS.md).
- V2-005.007: MERGED / IMPLEMENTED (Batch B, PR #315); same migration; [Recipes status](007-recipes/STATUS.md).

The V2-005 program implementation is complete across all eight subfeatures. Batch B received an independent review that closed a P0 (the app's actor helpers called the authorization RPCs with the wrong argument names, denying every user) and two CI-blocking defects, then was rehearsed on real restored DEV data and applied to hosted DEV. Backend enforcement stays STAGED and no module configuration has been written to hosted DEV; neither is authorized by this program step. Remaining before #253 can close: the formal closeout decision and the deferred hosted authenticated UI acceptance, both of which depend on owner-approved module configuration.
