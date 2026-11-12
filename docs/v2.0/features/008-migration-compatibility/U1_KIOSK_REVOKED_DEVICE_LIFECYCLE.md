# U-1 — A revoked kiosk device must stay revoked

Written for: the owner and the next implementer. **Status: FIXED AND VERIFIED LOCALLY (ledger 90). Not on Hosted DEV (88), not pushed.** The fix is a forward-only migration plus a small application change; Hosted application is gated by D-7.

## 1. Defect

`public.kiosk_reassign_device` (created in `20261111120000_kiosk_device_registration.sql`) never read the device status and wrote `status = 'active'` unconditionally. Revoking a tablet and then reassigning it flipped the row **`revoked → active`**, left `revoked_at` / `revoked_by` / `revocation_reason` populated on an "active" row, bumped `credential_version` a second time, and the audit trail showed only `kiosk_device_reassigned` — no status transition. It was first recorded as **L1** in the V2-007 independent review (documented, left open) and reproduced again in B1 as U-1.

Practical reach: the UI hides Reassign on revoked rows, so it was reachable by a **direct RPC call** or a **stale tab** (tab A shows the device active; tab B revokes it; tab A clicks Reassign). The row could not authenticate (the token hash is nulled in the same statement and device lookup requires hash **and** `status = 'active'`), so this was a lifecycle/audit-integrity defect and a latent trap — any future code that attached a token to an "active" row would have silently resurrected a revoked device — not an authentication bypass.

## 2. Was reactivation ever intended? — No

- The V2-007 README defines `kiosk_revoke_device` as "Revokes an active device" and `kiosk_reassign_device` as "Relocates device within the same organization". Neither describes reviving a revoked device.
- No code path ever re-issues a token to an existing device row: the only writer of `device_token_hash` is `kiosk_consume_pairing_code`, and it **inserts a new row**. A reassigned device therefore must be re-paired, which produces a new row (V2-007 hosted acceptance D5: "reassignment and re-pairing create new records").
- The owner's S1 policy (below) matches the existing design. There is **no product-contract conflict**; nothing was stopped or deferred.

## 3. Policy implemented (owner-approved for S1)

1. Revocation invalidates existing device credentials and sessions (unchanged).
2. Ordinary reassignment must not reverse a revocation.
3. A revoked device cannot become active because a manager picked another location.
4. Restoring a revoked physical tablet requires a **new** authorized pairing (new code → new device row).
5. A new activation never restores old credential validity.
6. Ownership stays tied to the correct organization and location (same-organization destination, destination authority — unchanged).
7. Every transition is audited with the authoritative actor.

## 4. The fix

`supabase/migrations/20261112220000_kiosk_reassign_revoked_device_guard.sql` (sha256 `48036911dd416d4d09bc18baf4eb5a7afd6c47690f8959471bd256227f6ac488`) — `CREATE OR REPLACE` of `public.kiosk_reassign_device(uuid, uuid)`, same signature, `SECURITY DEFINER`, `search_path = ''`, grants re-stated (`authenticated` only).

| Change                                                                                                                                                                                                      | Why                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| After the row lock and the **authority check**, `if status is distinct from 'active' then raise … errcode '55000'` ("Revoked devices cannot be reassigned. Pair the tablet again with a new pairing code.") | Refuses revoked devices; checked _after_ authority so an unauthorized caller still gets plain `Unauthorized` (no status oracle) |
| The `UPDATE` no longer assigns `status`                                                                                                                                                                     | Reassignment can only be reached for an active row and can never change lifecycle state                                         |
| Audit `before_state`/`after_state` now include `status` and `credential_version`                                                                                                                            | A reassignment is distinguishable in the trail; the version rotation is recorded                                                |
| `FOR UPDATE` lock unchanged                                                                                                                                                                                 | Serialises against a concurrent revoke: whichever commits second sees the other's state                                         |

Not changed: pairing (`kiosk_consume_pairing_code`), revoke, rename, the authority predicate, grants, RLS, tables, triggers. No second activation path was added; client-supplied status cannot influence state (verified over PostgREST).

Application: `reassignKioskDevice` maps `55000` to a fixed message with code `DEVICE_REVOKED` (never the raw database text); the Kiosks list closes the dialog, **reloads the real state**, and then shows the message (`fetchDevices` clears errors, so the order matters).

## 5. Evidence

| Check                                                                                                                                                          | Result                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Defect reproduced on the **unfixed** schema (ledger 89) — pgTAP `0079`                                                                                         | **21 of 69 assertions failed**: `caught: no exception, wanted 55000`; revoked D2 became `active`; `credential_version` 2→4; reassign audit rows for a revoked device; the cross-location probes cascaded because the device had moved |
| Same file on the fixed schema                                                                                                                                  | **69 / 69**                                                                                                                                                                                                                           |
| Whole pgTAP suite after a **clean replay of all 90 migrations**                                                                                                | **82 files, 3363 assertions, PASS** (3294 before + 69)                                                                                                                                                                                |
| Real GoTrue (local, `tests/local/kiosk-revoked-device-lifecycle.local.test.ts`, real sessions incl. a real global sign-out, the app's own pairing/lookup code) | **8 / 8**; B1 suite 7 / 7 unchanged                                                                                                                                                                                                   |
| Negative control: old function body loaded, same suite                                                                                                         | **3 of 8 fail** (no `55000`; audit lacks status/version; recovery case) → fix restored → 8 / 8                                                                                                                                        |
| Browser, real cookies (`kiosk-location-manager.local.spec.ts`, new stale-tab scenario)                                                                         | **7 / 7 on desktop, WebKit tablet and mobile** (21 / 21)                                                                                                                                                                              |
| Vitest (new data-layer mapping + component stale-list test; kiosk feature)                                                                                     | 136 / 136; the component test fails without the UI change (negative control)                                                                                                                                                          |

Acceptance cases covered by `0079` and the real-auth suite: positive — owner and a two-location manager reassign an **active** device (location and organization binding, credential rotation, session purge, authoritative actor and before/after audit), a new pairing yields a **new** active row while the old revoked row and its credential stay dead; negative — revoked device refused for owner, location manager, Overall owner, Overall manager (including foreign-org and same-location targets), a moved-then-revoked device refused, staff / assistant / inactive-org manager / A2-only manager / cross-organization / signed-out session / anonymous all denied (`42501`, no status leak), direct RPC and direct PostgREST `UPDATE` of status/credentials denied, refused attempts leave device row, sessions and audit unchanged, `credential_version` never decreases on any device.

## 6. Residual (not changed — needs a decision only if the owner wants it)

**R-1 (D5, pre-existing, by design):** reassigning an **active** device nulls its token and bumps its version but leaves the row `active`. It cannot authenticate, and the tablet must re-pair (which creates a new row), so the original row lingers as an "active" device with no credential and the device list shows it as Active. Options: (a) document (current); (b) a future lifecycle status such as `pending_repair` — a schema change, **not** part of S1. The owner's instruction was to preserve legitimate active-device reassignment, so this was left exactly as it behaved.

**R-3 (independent review, P3, pre-existing):** `kiosk_revoke_device`, `kiosk_rename_device` and `kiosk_reassign_device` take `FOR UPDATE` **before** the authority check, so an unauthorized caller who already knows a device UUID can briefly block a legitimate revoke. Low impact (UUIDs are unguessable and the lock is released with the failing transaction). Fix if wanted: an authority-only read before locking.

**R-4 (independent review, P3):** no test drives **two committed sessions** (revoke racing reassign); the claim rests on the shared row lock and read-committed re-read (code reading plus the lock). Add a two-connection probe on committed fixtures if a stronger proof is wanted.

**R-2:** a defence-in-depth `BEFORE UPDATE` trigger making `revoked` terminal for _every_ writer (including service-role code) would close the class permanently; not added to keep the correction minimal. The independent review reached the same conclusion: `kiosk_devices` has only `status in ('active','revoked')`, no trigger, and service-role holds `UPDATE`; a `CHECK (status <> 'revoked' or device_token_hash is null)` plus a `BEFORE UPDATE` trigger rejecting `revoked → active` would make a service-role slip impossible. Optional, needs approval.

## 7. Independent review

One fresh-context, read-only reviewer (disposable-DB probes only, all rolled back). **No P0/P1; no other path from `revoked` to `active` exists** — exactly four functions write `kiosk_devices` (pairing inserts a new row, revoke, rename, fixed reassign), there are no triggers/rules/writable policies, and the only `src/` writer updates `last_seen_at`. Sound: lock/race reasoning, grants and ownership (postgres, `SECURITY DEFINER`, `search_path=""`, one overload, no PUBLIC/anon), no status oracle (identical `Unauthorized` before the status check), audit values, test meaningfulness. Findings were P3 only and are recorded above as R-2, R-3, R-4.
