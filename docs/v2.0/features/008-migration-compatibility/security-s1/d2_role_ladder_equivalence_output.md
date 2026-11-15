# D-2 role-ladder equivalence probe — recorded output (2026-11-12)

Produced by [d2_role_ladder_equivalence_probe.sql](d2_role_ladder_equivalence_probe.sql) on the **disposable local stack** (ledger 90); one transaction, rolled back. One organization with one active location `L1`; one member per legacy org role. Sixteen authorization functions were evaluated per role in four states: (1) legacy fallback, no location row; (2) the proposed D-2 row added; (3) the organization later grows to two locations (`L2` unassigned) with the D-2 rows kept; (4) two locations and no rows (comparison).

Proposed ladder: `owner→manager`, `general_manager→manager`, `shift_manager→assistant_manager`, `host→staff`, `server→staff`. Org roles are never changed.

**Result A — capability changes caused by the D-2 rows at N=1: none** (0 rows; level functions bucketed 0 / 1 / 2+).

**Result B — raw level changes at N=1 (informational):** `owner` 4→3 in `tasks`, `tips`, `schedule` only (the `coalesce` modules, where a location row overrides the org role). A scan of every deployed function that consumes a `*_profile_level` found comparisons only against `> 0`, `= 0`, `= 1` and `>= 2`; **no consumer reads level 3 or 4**, so the drop changes nothing operationally in the database. (TypeScript-side equivalence is not covered by this probe; see the D-2 packet.)

**Result C/D — the E-1 timing hazard.** At N=2 the same D-2 rows behave as follows (assigned at `L1`, nothing at `L2`):

| Role              | with D-2 row: `inventory_is_manager(org)` | with D-2 row: inventory level at L1 / L2 | without any row (N=2): `inventory_is_manager(org)` / inventory level | `recipes_is_manager(org)` (both) |
| ----------------- | :---------------------------------------: | :--------------------------------------: | :------------------------------------------------------------------: | :------------------------------: |
| owner             |                   true                    |                  4 / 4                   |                               true / 4                               |               true               |
| general_manager   |                   true                    |                  3 / 3                   |                               true / 3                               |               true               |
| **shift_manager** |                 **true**                  |                **2 / 1**                 |                            **false / 1**                             |               true               |
| host              |                   false                   |                  1 / 1                   |                              false / 1                               |              false               |
| server            |                   false                   |                  1 / 1                   |                              false / 1                               |              false               |

The **only** capability a D-2 row adds once an organization has two or more locations is for `shift_manager → assistant_manager`: organization-wide Inventory catalog **read** and, through E-1, shared-catalog **write** via `L1`. Nothing else differs. (Schedule: host/server/shift_manager fall to level 0 at the unassigned `L2` — the intended "belonging to an organization does not grant other locations" rule.)

## Raw output

```text
== A. Capability changes caused by the D-2 rows at N=1 (state 1 -> 2). Level functions are bucketed: 0 none / 1 staff / 2+ manager.
 kind | role | fn | before | after
------+------+----+--------+-------
(0 rows)

   (zero rows above = no capability gained or lost by any role in any function)
== B. Raw level changes at N=1 (state 1 -> 2) - informational (owner 4 -> 3 under coalesce modules).
 ?column?  | role  |       fn       | before | after
-----------+-------+----------------+--------+-------
 RAW LEVEL | owner | level:schedule | 4      | 3
 RAW LEVEL | owner | level:tasks    | 4      | 3
 RAW LEVEL | owner | level:tips     | 4      | 3
(3 rows)

== C. After the org grows to N=2: what each mapped role holds at L1 (assigned) vs L2 (unassigned).
      role       |            fn             | at_l1 | at_l2
-----------------+---------------------------+-------+-------
 general_manager | inventory_can_access      | true  | true
 general_manager | inventory_is_manager(org) | true  | true
 general_manager | kiosk_can_manage          | true  | true
 general_manager | level:inventory           | 3     | 3
 general_manager | level:schedule            | 3     | 3
 general_manager | recipes_is_manager(org)   | true  | true
 host            | inventory_can_access      | false | false
 host            | inventory_is_manager(org) | false | false
 host            | kiosk_can_manage          | false | false
 host            | level:inventory           | 1     | 1
 host            | level:schedule            | 1     | 0
 host            | recipes_is_manager(org)   | false | false
 owner           | inventory_can_access      | true  | true
 owner           | inventory_is_manager(org) | true  | true
 owner           | kiosk_can_manage          | true  | true
 owner           | level:inventory           | 4     | 4
 owner           | level:schedule            | 3     | 4
 owner           | recipes_is_manager(org)   | true  | true
 server          | inventory_can_access      | false | false
 server          | inventory_is_manager(org) | false | false
 server          | kiosk_can_manage          | false | false
 server          | level:inventory           | 1     | 1
 server          | level:schedule            | 1     | 0
 server          | recipes_is_manager(org)   | false | false
 shift_manager   | inventory_can_access      | true  | false
 shift_manager   | inventory_is_manager(org) | true  | true
 shift_manager   | kiosk_can_manage          | false | false
 shift_manager   | level:inventory           | 2     | 1
 shift_manager   | level:schedule            | 2     | 0
 shift_manager   | recipes_is_manager(org)   | true  | true
(30 rows)

== D. Same org at N=2 WITHOUT any mapping row would give (state 1 shape, for comparison, recomputed):
 take
------

(1 row)

      role       |            fn             | no_row_at_l1
-----------------+---------------------------+--------------
 general_manager | inventory_is_manager(org) | true
 general_manager | level:inventory           | 3
 general_manager | level:schedule            | 3
 general_manager | recipes_is_manager(org)   | true
 host            | inventory_is_manager(org) | false
 host            | level:inventory           | 1
 host            | level:schedule            | 0
 host            | recipes_is_manager(org)   | false
 owner           | inventory_is_manager(org) | true
 owner           | level:inventory           | 4
 owner           | level:schedule            | 4
 owner           | recipes_is_manager(org)   | true
 server          | inventory_is_manager(org) | false
 server          | level:inventory           | 1
 server          | level:schedule            | 0
 server          | recipes_is_manager(org)   | false
 shift_manager   | inventory_is_manager(org) | false
 shift_manager   | level:inventory           | 1
 shift_manager   | level:schedule            | 0
 shift_manager   | recipes_is_manager(org)   | true
(20 rows)

```
