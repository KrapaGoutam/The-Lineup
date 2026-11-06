# V2-004.004 — Backend Module Enforcement: Plan and Design

GitHub: Subfeature (see [STATUS.md](STATUS.md)) · Parent [#252](https://github.com/KrapaGoutam/The-Lineup/issues/252) · Program [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248) · Milestone [#8](https://github.com/KrapaGoutam/The-Lineup/milestone/8) · Predecessor PR [#303](https://github.com/KrapaGoutam/The-Lineup/pull/303) (merged, `53ad839`)

Branch `feature/v2.0-004.004-backend-module-enforcement` from `origin/development` `53ad8397dd8712b70846b13b067d9c3c1ef0c06a`. `main` `5e5b7747693b6e81014eafdf299b87e56c3f033d`, untouched. Production never contacted.

Companions: [ENTRY_POINT_MATRIX.md](ENTRY_POINT_MATRIX.md) · [TEST_MATRIX.md](TEST_MATRIX.md) · [ROLLOUT_READINESS.md](ROLLOUT_READINESS.md) · [EVIDENCE.md](EVIDENCE.md) · [STATUS.md](STATUS.md)

---

## 1. Outcome and non-goals

**Outcome.** Module availability is enforced by the **server and the database**, independently of the navigation V2-004.003 already filters. A client that bypasses the UI — calling a Server Action, an exposed RPC or PostgREST directly — is refused when a module is not explicitly Enabled at the location it operates on, and a denial changes nothing.

**Two states are reported separately, on purpose:**

| State           | Meaning                                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **IMPLEMENTED** | The guards, seams, policies and tests exist and pass. Shipping this code changes **no** behaviour.                                                                                                |
| **ACTIVATED**   | The per-environment switch is `active`. This needs every active location in that environment to have explicit, owner-approved rows. **Not the case in hosted DEV** (44 active locations, 0 rows). |

**Non-goals.** No backfill and no guessed values (V2-008.004 owns reconciliation; owner approval is a human act). No V2-005 location-scoping redesign. No Attendance V2 modes. No UI redesign. No `main`, no Production.

## 2. Decisions

| #   | Decision                                                                                                                                                                                                                                                                                            | Why                                                                                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **One switch, in the database** (`public.module_enforcement_settings`, one row, `staged` by default).                                                                                                                                                                                               | The Server Action layer and the database layer can never disagree about whether enforcement is on. It is per-environment automatically (each environment has its own database), cannot be set by a client, and needs no deploy to roll back. |
| D2  | **The database refuses activation until the estate is reconciled.** A `BEFORE UPDATE` trigger calls `private.module_enforcement_readiness()` and raises `55000` while any active location lacks any module key.                                                                                     | PLAN V2-004.001 §6.2 asked for "an explicit all-active-locations-reconciled check so this cannot be forgotten". Making the _database_ enforce it means a mistaken manual `UPDATE` fails loudly instead of locking real restaurants out.      |
| D3  | **Activation also requires an approval reference.** `activation_reference` (non-blank) and `activated_at` are recorded; returning to `staged` clears them.                                                                                                                                          | Owner approval cannot be verified by code, but it can be made impossible to omit and visible afterwards.                                                                                                                                     |
| D4  | **Only a platform operator can change the switch.** No `UPDATE`/`DELETE` grant for `authenticated`/`anon`; the trigger also rejects any statement carrying an end-user `auth.uid()`; deletion is always refused.                                                                                    | The switch must not be a bypass for untrusted users (spec §3.4).                                                                                                                                                                             |
| D5  | **Missing is never Enabled; every failure denies — once active.** Switch unreadable ⇒ deny. Switch _table_ absent (migration not applied) ⇒ staged.                                                                                                                                                 | Not knowing whether enforcement is on is not permission to proceed; but an environment without the table cannot be active, so refusing there would only break unmigrated environments.                                                       |
| D6  | **Reuse, don't re-interpret.** `resolveModuleState`, `isModuleUsable`, `readLocationModuleConfigs`, `getPrimaryLocation`, `assertWorkspaceExpectation` are the only sources of truth.                                                                                                               | Spec §5.2: no parallel interpretation that treats Missing as usable.                                                                                                                                                                         |
| D7  | **The location is never taken from the request.** It is the server-verified persisted context (or the one a caller already verified, e.g. Tasks). A location the browser _names_ must equal it or the request is **stale**.                                                                         | A stale tab must not select another location by changing a parameter; one location's Enabled row must never permit another (BE-10/15).                                                                                                       |
| D8  | **DB enforcement lives in the existing seams.** `private.tasks_begin`, `private.inventory_begin`, `private.begin_board_write` are the prologue every task/checklist/inventory/board RPC already calls (63 of 63, verified transitively); each gets one added line after its existing authorization. | One reviewable change per family instead of rewriting ~60 function bodies. Authorization order is preserved: an unauthorized caller never learns module state.                                                                               |
| D9  | **Restrictive RLS for direct table access.** One `AS RESTRICTIVE` policy per location-bound table (and per child table via a parent lookup). It can only _remove_ access the permissive policies grant.                                                                                             | Covers direct PostgREST, Realtime and `SECURITY INVOKER` functions. SELECT-only on tables clients cannot write, so existing "no client write policy" invariants stay true.                                                                   |
| D10 | **System operations are never gated**: Settings, context switching, sign-in/out, passcode change/reset, lockout, deactivate/reactivate, location & staff administration, module settings, account recovery.                                                                                         | The registry says Settings is system-required; V2-004.001 §5 makes account recovery a binding constraint. Recorded as an explicit exemption list **enforced by a test**, not a blanket bypass.                                               |
| D11 | **Completeness is a test, not a promise.** `enforcement-coverage.test.ts` fails if an exported Server Action is neither guarded nor on the reasoned exemption list.                                                                                                                                 | A future action cannot silently ship outside enforcement.                                                                                                                                                                                    |

## 3. Architecture

```text
Browser (never trusted for module state or location)
   │  Server Action / PostgREST / RPC
   ▼
Server Action ── existing auth (live session, role, workspace expectation)
   │            └─ guardModule({ module, organizationId, location? | claimedLocationId? })
   │                 1. read module_enforcement_settings (caller's own session)
   │                 2. staged  → allowed, return (no other work)
   │                 3. active  → verified location (getPrimaryLocation | caller-verified)
   │                              claimed location ≠ verified → stale_context
   │                              readLocationModuleConfigs(location) → resolveModuleState
   │                              Enabled → allow · everything else → deny
   ▼
PostgREST / RPC ── existing grants + RLS (permissive)
   │            ├─ RESTRICTIVE RLS: private.location_module_allows(location_id, module)
   │            └─ RPC prologue seams: assert_location_module_enabled(...)   ← after existing access check
   ▼
public.module_enforcement_settings (staged | active)  ←  private.module_enforcement_readiness()
```

Files

| File                                                                | Responsibility                                                                                                           |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `src/features/modules/domain/module-enforcement.ts`                 | Pure decision `decideModuleAccess`, verdict codes, safe messages. No I/O.                                                |
| `src/features/modules/domain/module-readiness.ts`                   | Pure `evaluateModuleReadiness` (mirror of the SQL gate).                                                                 |
| `src/features/modules/data/module-enforcement.ts`                   | Server-only `readModuleEnforcementMode`, `checkModuleAccess`, `guardModule`, `guardModuleForSlug`.                       |
| `supabase/migrations/20261106120000_module_backend_enforcement.sql` | Switch, readiness, activation trigger, decision helpers, assertion, three seam re-declarations, 36 restrictive policies. |
| `scripts/module-enforcement-readiness.mjs`                          | Read-only operator report; refuses Production.                                                                           |

Verdicts: `module_disabled`, `module_missing`, `location_unavailable`, `unauthorized` (`sessionInvalid` when unauthenticated), `stale_context`, `configuration_unavailable`, `invalid_configuration`, `invalid_module`. User-facing text is identical for disabled and never-configured, and names no tenant, table or database error. Server logs carry the code and module only.

## 4. What the database can and cannot do (honest scope)

Covered at the database: everything with a `location_id` (tasks, table allocation, schedule, tips pools, bar-inventory stock/orders) plus child tables reachable through one. **Not coverable until V2-005**: payroll, recipes, team (`memberships`/`profiles`), attendance links, availability/time-off — they have no `location_id`. Those are protected by the Server Action guard only; direct PostgREST by an authorized org member is the documented residual ([ENTRY_POINT_MATRIX.md](ENTRY_POINT_MATRIX.md) §4, §6). The Server Action layer is complete (98/98 classified).

## 5. Behaviour and compatibility

- **Staged (default, every environment today):** `guardModule` performs one small read of the switch and returns; page loaders run as before; every SQL guard returns _allowed_; all 61 pre-existing pgTAP files and the two concurrency files pass unchanged (2005 assertions) apart from one deliberately updated pin (below).
- **Updated pre-existing assertion:** pgTAP `0062` MC-014c pinned "no pre-existing function reads module configuration" (a phase-1 invariant). It now allow-lists exactly the two V2-004.004 readers (`location_module_allows`, `module_enforcement_readiness`); every other function must still be oblivious. `module-isolation.test.ts` likewise now permits exactly one new import (`module-enforcement`) from Server Action modules and the page loader.
- **Demo mode:** unchanged. Demo is decided from trusted server env before any guard (`statement-actions` returns demo data before reaching it; the guard has no `demoMode` parameter). Demo never calls hosted Supabase.
- **Existing authorization is not weakened:** every guard runs _after_ existing authentication/role checks; no policy is dropped; restrictive policies only subtract.
- **Settings stays reachable with all nine modules Disabled or Missing:** system-required modules are allowed in `decideModuleAccess` regardless of switch and read failures; the module-settings table is not covered by any module policy; owners keep `location_module_configs` write access (`BE-DB-50`, `L-BE28/40`).
- **Account recovery:** passcode reset/change, lockout, deactivate/reactivate and Settings → Account Recovery are exempt (route/action list in the matrix).
- **New locations after activation:** a freshly provisioned location has no rows, so every optional module is Missing ⇒ denied until configured (owner question Q1 from V2-004.001; also re-activation is refused while such a location is unconfigured — `BE-DB-54`).

## 6. Rollout, migration and rollback

1. Merge/deploy: switch is `staged` ⇒ no behaviour change in any environment. The migration is additive and forward-only; it inserts exactly one row (the switch, `staged`) and **no module configuration rows**.
2. Owner decides per-location module values (V2-004.002 Settings editor, or an owner-approved one-off DEV seed; Production via V2-008.004).
3. `node scripts/module-enforcement-readiness.mjs …` must say READY (the database re-checks).
4. Platform operator sets `mode = 'active'` with the approval reference. See [ROLLOUT_READINESS.md](ROLLOUT_READINESS.md).
5. Rollback is one statement (`mode = 'staged'`), instantaneous, no data change.

Migration safety: replays from scratch with all 73 prior migrations; no existing object is dropped; the three re-declared helpers are verbatim plus one `perform` line; privileges: helpers `revoke … from public, anon`, `execute` granted to `authenticated` only where RLS evaluates them as the caller; `SECURITY DEFINER` helpers pin `search_path = ''`, take no actor parameter and read no user-editable claims.

## 7. Open owner decisions (carried, not decided here)

- **Q1** Provisioning defaults for a new location (blocks smooth post-activation onboarding).
- **Q2** Unauthorized-vs-missing ambiguity (still fail-closed; unchanged).
- **Q3** Passcode reset outside Team — now **implemented** as an exemption; confirm acceptable.
- **Q4** Write authority for module settings (unchanged: org Owner/GM + Overall Owner/Manager).
- **R1 (new)** Approve the per-location module values for the 44 active DEV locations (or confirm which are throwaway test fixtures) so DEV can be activated.
- **R2 (new)** Confirm team-roster edits (rename / designation) belong to the Team module, while deactivate/reactivate stay exempt (this plan's choice).
