# V2-005 Closeout — Owner Approval Request & Record

Status: **P-1 APPROVED & EXECUTED.** P-2 and P-3 remain NOT GIVEN.

Three permissions are requested separately. A yes to one is never a yes to another.

| #   | Permission                         | Scope when granted                                                                                                                                                                                                       | Approved?    | Approver / reference / date                                    |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | -------------------------------------------------------------- |
| P-1 | Limited DEV pilot configuration    | Only the exact (location, module, value) triples written below, through the authenticated Module Settings workflow (audit and concurrency rules intact). No other location. `module_enforcement_settings` stays `staged` | **APPROVED** | Owner / prompt 2026-11-09T16:47:47-06:00 (Executed 2026-11-09) |
| P-2 | Reconcile all active DEV locations | An explicit Enabled/Disabled value for every module at every active location, or archiving of confirmed throwaway fixtures first (D2), by approved list                                                                  | NOT GIVEN    | —                                                              |
| P-3 | Activate backend enforcement       | Separate, later, with a named activation reference, a platform operator, a rollback plan and a verification window. Cannot be requested until P-2 is complete and the readiness check prints `READY`                     | NOT GIVEN    | —                                                              |

## P-1 pilot triples (approved and applied)

| Location ID                            | Location Name | Organization Name | Module          | Value   | Timestamp                     | Written by                             |
| -------------------------------------- | ------------- | ----------------- | --------------- | ------- | ----------------------------- | -------------------------------------- |
| `a5d46f61-cf64-4b96-8d9f-41d6812d561c` | DEV Location  | The Monk's DEV    | `bar_inventory` | Enabled | 2026-11-09T22:54:44.077448+00 | `b3add6a2-fd5f-45ac-93bc-0fbbd55b9e2f` |

## Execution details

1. Confirmed DEV ref `opmujepkemwcdxxorhfd`; confirmed approved location is active and unarchived.
2. Verified operator `TestOwner` holds authenticated location administration authority.
3. Applied triple atomically through authenticated Supabase client with version-aware concurrency guard.
4. Readback confirmed: exactly 1 row in `location_module_configs`; 0 rows for other 8 modules; 0 rows for other 43 locations.
5. Restoration rule: **a pilot row is permanent in practice** (it can be toggled via `is_enabled = false`, not hard deleted by client roles).
6. Hosted smoke executed in [HOSTED_OWNER_SMOKE.md](HOSTED_OWNER_SMOKE.md). Enforcement remains `staged`.

## What was not done under P-1

No other locations seeded, no values copied, no location archived or deleted, `module_enforcement_settings` untouched, stock untouched, Production never contacted.
