# V2-005 Closeout — Owner Approval Request

Status: **NO APPROVAL RECORDED.** This handoff supplied none, and no agent may create one. Nothing below has been executed.

Three permissions are requested separately. A yes to one is never a yes to another.

| #   | Permission                         | Scope when granted                                                                                                                                                                                                       | Approved? | Approver / reference / date |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | --------------------------- |
| P-1 | Limited DEV pilot configuration    | Only the exact (location, module, value) triples written below, through the authenticated Module Settings workflow (audit and concurrency rules intact). No other location. `module_enforcement_settings` stays `staged` | NOT GIVEN | —                           |
| P-2 | Reconcile all active DEV locations | An explicit Enabled/Disabled value for every module at every active location, or archiving of confirmed throwaway fixtures first (D2), by approved list                                                                  | NOT GIVEN | —                           |
| P-3 | Activate backend enforcement       | Separate, later, with a named activation reference, a platform operator, a rollback plan and a verification window. Cannot be requested until P-2 is complete and the readiness check prints `READY`                     | NOT GIVEN | —                           |

## P-1 pilot triples (owner fills in)

| Location (id from the private matrix) | Module | Value (Enabled / Disabled) |
| ------------------------------------- | ------ | -------------------------- |
| _empty_                               |        |                            |

## What the agent will do on P-1, and only then

1. Confirm DEV ref `opmujepkemwcdxxorhfd`; confirm each approved id exists, is active and unarchived.
2. Capture current rows and versions (expected: none) and the audit metadata the editor requires; confirm the operator holds location-administration authority.
3. Apply each triple once through the module-settings Server Action; never overwrite a row whose version changed; read each back.
4. Restoration: the editor writes explicit values, so restoration is setting the prior explicit value; a row cannot be returned to "missing" by the client (no delete). The owner should know that before approving: **a pilot row is permanent in practice** (it can be toggled, not removed).
5. Run the hosted smoke in [HOSTED_OWNER_SMOKE.md](HOSTED_OWNER_SMOKE.md). Leave enforcement `staged`.

## What the agent will not do under P-1

Seed other locations, copy values between branches, archive or delete a location, touch `module_enforcement_settings`, modify stock outside an approved dataset, or contact Production.
