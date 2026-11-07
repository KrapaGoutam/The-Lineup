# V2-004.004 — Rollout Readiness

Companion to [PLAN.md](PLAN.md). **Implemented ≠ activated.** This file records, per environment, whether backend module enforcement is actually on, and what is still needed to turn it on. No value below is invented or defaulted.

## 1. Environment status

| Environment                       | Enforcement switch                                                                                                                                           |  Active locations | Locations with all 9 module rows | Missing | Activation permitted?        | Actual enforcement                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------: | -------------------------------: | ------: | ---------------------------- | --------------------------------------------- |
| Local disposable stack            | `staged` by default; `active` during tests only                                                                                                              | 0 (fixtures only) |                fixtures complete |       0 | n/a (test fixtures)          | exercised in tests, then returned to `staged` |
| **Hosted DEV** (`the-lineup-dev`) | **not deployed** — this PR applies nothing to DEV; migration `20261106120000` is not applied (DEV last recorded at 73 migrations at the V2-004.001 closeout) |            **44** |                            **0** |  **44** | **NO**                       | **none — staged / not deployed**              |
| Production                        | not touched — no read, no write, no link                                                                                                                     |                 — |                                — |       — | **NO** (V2-008.004 + V2-009) | none                                          |

Hosted DEV figures come from a **fresh read-only run** of `scripts/module-enforcement-readiness.mjs --summary` on 2026-11-06 (HTTP GET only; 0 configuration rows read; the DEV `location_module_configs` table is empty exactly as at V2-004.001/.002/.003). They replace the historical "30 organizations / 44 locations / 0 configs" figure, which is now confirmed rather than assumed.

### Reported state

```text
Active locations:                    44   (hosted DEV, fresh read)
Locations with complete configuration: 0
Locations missing configuration:      44
Owner-approved backfill:              NONE RECORDED
Activation permitted:                 NO
Actual active enforcement:            NONE in any hosted environment
Remaining blockers:                   R1 owner-approved values for the 44 DEV locations (or confirmation which are throwaway fixtures)
```

## 2. Why the gate cannot be bypassed by accident

- **The database enforces it.** `UPDATE public.module_enforcement_settings SET mode='active' …` fires a `BEFORE UPDATE` trigger that raises `55000` (_"Module enforcement cannot be activated: N active location(s) lack explicit configuration for every module."_) while any active location lacks any module key. Verified by pgTAP `BE-DB-12`/`54` and by the real-JWT suite `L-BE43`. A refused attempt leaves the switch `staged` and writes nothing (`BE-DB-13/14`).
- **It cannot invent the answer.** The readiness function and script are pure reads; they never insert, default or repair a row (`BE-45`).
- **It needs a record of approval.** `activation_reference` must be non-blank (`BE-DB-11`); `activated_at` and the reference are stored, and cleared when returning to `staged`.
- **An end user cannot flip it.** No `UPDATE`/`DELETE` grant for `authenticated`/`anon`; the trigger also rejects any statement carrying a user `auth.uid()`; delete is refused for everyone (`BE-DB-15/16/18`, `L-BE46`).
- **The migration cannot activate it.** It inserts the single switch row as `staged` and no module configuration rows (pgTAP 0062 MC-013a still passes).
- **Production**: the gate protects it too. Production has 0 rows (V2-008.004 not done); activation would be refused there for the same reason.

## 3. Activation runbook (operator; not performed)

Preconditions: the migration is deployed; owner has approved the per-location values (R1).

1. **Reconcile.** Owner-approved rows exist for every active location × every module (Enabled _or_ explicitly Disabled). Use the V2-004.002 Settings editor, or an owner-approved one-off seed for DEV. Production uses V2-008.004. The agent does not choose these values.
2. **Preview.** `node scripts/module-enforcement-readiness.mjs --env-file .env.development.local` → must print `RESULT: READY` (exit 0). Use `--summary` for any shared log; the detailed output lists organization and location names and must not be attached to public CI artifacts or issues.
3. **Activate** (platform operator, privileged connection — never a user session):

   ```sql
   update public.module_enforcement_settings
   set mode = 'active', activation_reference = '<link to the owner approval record>';
   ```

   The database re-runs the readiness check and refuses if anything changed since step 2.

4. **Verify.** Sign in as a synthetic user; a Disabled module's action returns "This feature is turned off for this location."; an Enabled one works; Settings and account recovery work with every module off.
5. **Rollback** (no deploy, no data change, instant): `update public.module_enforcement_settings set mode = 'staged';`

## 4. After activation: new and re-activated locations

A location provisioned after activation has **no rows**, so every optional module is Missing and denied (only Settings works) until an authorized administrator configures it. This is intentional (V2-004.001 D5/D11) and is owner question **Q1** (provisioning defaults). Re-activation after a rollback is refused while such a location is unconfigured (`BE-DB-54`).

## 5. Outstanding decisions

| #   | Decision                                                                                                   | Owner |
| --- | ---------------------------------------------------------------------------------------------------------- | ----- |
| R1  | Per-location module values for the 44 active DEV locations (and which of them are throwaway test fixtures) | Owner |
| Q1  | What a brand-new location starts with                                                                      | Owner |
| R2  | Team-roster edits (rename / designation) gated by Team; deactivate / reactivate / passcode reset exempt    | Owner |
| —   | Production: V2-008.004 (reconciliation) → V2-009 release gate                                              | Owner |

## 6. Why no HTTPS Preview / browser validation of _active_ enforcement was run

The spec allows active validation only where readiness passes. DEV does not, so an active-mode browser test against DEV would either be refused by the gate (correct) or require activating enforcement over 44 unreconciled real locations (forbidden). The browser-visible behaviour of a Disabled module (tab hidden, deep-link fallback, Settings-only operation, Team-disabled Account Recovery) was accepted in V2-004.003 and is unchanged. Staged enforcement is invisible in the UI by design; the UI makes no claim that backend enforcement is active.
