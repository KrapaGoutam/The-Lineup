# Implementation report — Cross-View Integrity

Updated at every phase boundary. See PLAN.md for contracts.

| Phase | State | Notes                                                                 |
| ----- | ----- | --------------------------------------------------------------------- |
| X0    | done  | Audit complete; identity proven (`1` has no `dining_tables` row; `T1` is id 19) |
| X1    | open  |                                                                       |
| X2    | open  |                                                                       |
| X3    | open  |                                                                       |
| X4    | open  |                                                                       |
| X5    | open  |                                                                       |
| X6    | open  |                                                                       |

## X0 checkpoint

- Table `1` canonical id: **none** — free-text, unregistered label on the board.
- `T1` canonical id: `dining_tables.id = 19` (DEV), mapped at (8, 72).
- Distinct: **yes**. Not aliases. Off-map = unregistered label OR registered-unpositioned row.
- Mutation paths, history collections, current occupied-table behaviour and proposed contracts: PLAN.md.
