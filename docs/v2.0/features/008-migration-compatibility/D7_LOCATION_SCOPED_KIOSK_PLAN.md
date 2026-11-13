# D7 — Location-Scoped Kiosks Access: Implementation Plan (Batch B)

Status: **DESIGN ONLY. Not implemented. Required before Production.** Tracked on issue [#256](https://github.com/KrapaGoutam/The-Lineup/issues/256) (carried from #255).

**Approved policy (owner):** a location-only manager may manage kiosk devices for locations where they hold an **active `manager` location assignment**, but must **not** gain general Location Administration (which also creates/archives locations, edits hours and manages staff).

## 1. Verified current state (source at `790fd2db`, DEV functions)

| Layer                     | Fact                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DB authority              | `private.kiosk_can_manage_location(location)` — location must be active and not archived; allows (1) Overall `owner`/`manager`, (2) org `owner`/`general_manager`, (3) active `location_memberships.role = 'manager'` **at that location**. `assistant_manager` and `staff` are denied.                                                                                                                                                                     |
| DB enforcement points     | RLS `kiosk_devices_select_manager`, `kiosk_pairing_codes_select_manager` use it; every mutation is an audited `SECURITY DEFINER` RPC that calls it: generate pairing code, rename, revoke, reassign (**also checks the destination location**). Direct client DML is not granted.                                                                                                                                                                           |
| Server Actions            | `src/features/kiosk/actions/kiosk-admin-actions.ts` (`listKioskDevicesAction`, `generateKioskPairingCodeAction`, `renameKioskDeviceAction`, `revokeKioskDeviceAction`, `reassignKioskDeviceAction`) each do `requireLiveSession`, validate ids, and delegate to the RPC/RLS. They carry **no** UI-capability check — the DB is the boundary. Listed in `enforcement-coverage.test.ts` as system-required (exempt from module enforcement).                  |
| UI gate (the blocker)     | `getLocationAdminContextAction` (`location-admin-actions.ts:84`) grants `canAdministerLocations` only for Overall owner/manager or org `owner`/`general_manager`. `LocationKioskManagement` is only reachable as the "Kiosks" tab inside `LocationAdministration` (`location-administration.tsx:787`). A pinning test documents this (`location-admin-actions.test.ts:412`).                                                                                |
| Settings shell            | Settings is a tab (`tab === "settings"`), not a URL route; it is reachable by every role. `SettingsPage` shows the Locations card only when `isManager` (`user.role !== "server"`, `restaurant-operations-app.tsx:1108`) and `context-settings.tsx` calls `getLocationAdminContextAction` client-side. `isManager` is **derived from the legacy org role**, so it is wrong for D7 (a location `manager` whose org role is `server`/`host` would be hidden). |
| Re-verified live behavior | V2-007 Gate 7: a pure location manager cannot reach the Kiosks UI while the RPC would allow them (finding D7).                                                                                                                                                                                                                                                                                                                                              |

## 2. Recommended design

**One new capability, DB-derived, with no new authority.** Add a read-only listing of the locations the caller may manage kiosks for, computed by the **same** predicate the RPCs use, and surface a dedicated Kiosks entry that renders the **existing** `LocationKioskManagement` for one of those locations.

### 2.1 Entry point (no new URL route)

- **Settings → "Kiosks" quick-link card** (new), beside the existing Locations/Team/Schedule cards, using the existing `subview` pattern in `SettingsPage` (`subview === "kiosks"`). Settings is system-required, so the entry survives any module configuration (consistent with V2-D022).
- Visible **only when** the new listing returns ≥1 location. It is independent of `isManager` and of `canAdministerLocations`. Org owners/GMs and Overall owners/managers will also see it (they have kiosk rights by policy); that is intentional, additive and discoverable. The existing Location Administration → Kiosks tab stays unchanged.
- Direct navigation: there is no kiosk URL to deep-link. Direct invocation of the Server Actions with any location id remains denied by the DB (§3). If the page mounts with an empty listing (e.g. role removed in another tab), it shows an access-denied state and renders no device data.

### 2.2 Reusable components

- `src/features/kiosk/components/location-kiosk-management.tsx` — reuse **as-is** (props `locationId`, `locationName`, `availableLocations`, `demoMode`). For `availableLocations` pass **only the caller's manageable locations of the same organization** (the reassign RPC already re-checks the destination; the UI list must not offer locations the caller cannot target).
- All pairing/revocation behavior (31-character alphabet, required revoke reason ≥3 chars, audit) is unchanged because the component and RPCs are unchanged.
- **Not reused:** `LocationAdministration`, `LocationForm`, `LocationStaffManagement`, lifecycle dialogs, operating-hours editor, module settings. None of them is imported by the new page, so no unrelated capability can leak through UI composition.

### 2.3 Authorization contract

1. **Source of truth:** `private.kiosk_can_manage_location`. No TypeScript re-implementation of the rule.
2. **New RPC** `public.kiosk_list_manageable_locations()` — `SECURITY DEFINER`, `set search_path = ''`, `revoke all … from public, anon; grant execute … to authenticated`, returns only `(location_id, location_name, organization_id, organization_name)` for locations that are active, not archived and for which `private.kiosk_can_manage_location(l.id)` is true; empty set for `auth.uid()` null; no other columns (no address, hours, staff, module data). Ordered deterministically (org name, location name), capped (e.g. 200).
3. **New data function** `listManageableKioskLocations(supabase)` in `kiosk-device-data.ts` and **new action** `listManageableKioskLocationsAction()` in `kiosk-admin-actions.ts`: `requireLiveSession`, call the RPC, return `ActionResult<readonly ManageableKioskLocation[]>`. Fail closed (empty list + no entry) on any error.
4. Existing five actions stay the enforcement boundary; they are **not** loosened. A location id not in the listing is denied by the RPC/RLS (not by the UI).
5. `getLocationAdminContextAction` and its pinning test are **unchanged** (they continue to prove a location-only manager does not get Location Administration).
6. Assistant managers: not granted (policy says `manager`). If the owner ever wants assistants, that is a new decision, not part of D7.

### 2.4 UX

- Card text names the capability ("Kiosks — pair, rename, revoke and reassign tablets at your locations"); no other settings are mentioned.
- One manageable location → open it directly; several → a plain location picker (names only) then the existing management panel; Back returns to Settings.
- Loading, empty (denied), error (retry) and success states; keyboard operable; labelled landmarks; reuses existing tablet/touch targets (≥44 px) and dark-mode tokens; focus returns to the card on Back.
- Demo mode: no change (demo keeps using the Location Administration path).

### 2.5 Exact files expected to change (Batch B)

| File                                                                               | Change                                                                                                                                                                   |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `supabase/migrations/<ts>_kiosk_manageable_locations.sql`                          | **New**, forward-only: the listing RPC + (per §6.1, if approved) `create or replace` of `private.kiosk_can_manage_location`. No table/policy/RLS change. Ledger 88 → 89. |
| `supabase/tests/database/0078_kiosk_manageable_locations.test.sql`                 | **New** pgTAP (§4).                                                                                                                                                      |
| `src/features/kiosk/domain/kiosk-device.ts`                                        | Add `ManageableKioskLocation` type + zod schema.                                                                                                                         |
| `src/features/kiosk/data/kiosk-device-data.ts`                                     | Add `listManageableKioskLocations`.                                                                                                                                      |
| `src/features/kiosk/actions/kiosk-admin-actions.ts` (+ `.test.ts`)                 | Add `listManageableKioskLocationsAction`.                                                                                                                                |
| `src/features/kiosk/components/kiosk-management-page.tsx` (+ `.test.tsx`)          | **New**: picker + reuse of `LocationKioskManagement`; empty/denied state.                                                                                                |
| `src/features/settings/components/settings-page.tsx` (+ `settings-page.test.tsx`)  | Kiosks quick-link card + `subview === "kiosks"`; visibility from the action.                                                                                             |
| `src/types/database.generated.ts`                                                  | Regenerated for the new RPC.                                                                                                                                             |
| `src/features/modules/enforcement-coverage.test.ts`                                | Only if the coverage test requires the new action name; file-level exemption already exists.                                                                             |
| `tests/e2e/kiosk.spec.ts`                                                          | Add the location-manager path (desktop + host-tablet).                                                                                                                   |
| `docs/v2.0/features/007-clock-kiosk/…`, `008-…/STATUS.md`, `tasks/current-task.md` | Records only.                                                                                                                                                            |

Explicitly **not** changed: `getLocationAdminContextAction`, `location-administration.tsx`, any existing kiosk RPC (the predicate is touched only by the §6.1 hardening, if approved), RLS policies, `restaurant-operations-app.tsx` `isManager`.

## 3. Security risks and mitigations

| Risk                                                        | Mitigation                                                                                                                                                  |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI listing treated as authorization                         | Listing is only for visibility; every action re-checks via RPC/RLS; tests call actions directly with foreign ids.                                           |
| Information leak through the listing (other orgs/locations) | RPC returns only locations passing the predicate; minimal columns; pgTAP proves a manager of A sees nothing of B.                                           |
| Logic drift between listing and RPCs                        | Same private function; a pgTAP property test compares listing membership with direct calls for every seeded location.                                       |
| Stale tab after demotion/deactivation                       | Actions are per-call authorized; page re-fetches the listing on mount/refresh; empty listing → denied state. Multi-tab guard (V2-003.005) unaffected.       |
| Reassign to an unmanaged location                           | Destination re-checked in `kiosk_reassign_device`; UI offers only manageable same-org locations; test attempts a forged destination.                        |
| Privilege confusion with Location Administration            | New page imports none of its components; pinning test unchanged; Playwright asserts the location manager sees no Locations card/create/archive/staff/hours. |
| Archived/inactive location access                           | Predicate already requires active and non-archived; listing excludes them; test with archived location.                                                     |
| Overall-role scope broadens the list                        | Intentional per V2-D003; capped and ordered; tested.                                                                                                        |
| Session validity                                            | `requireLiveSession` on the new action like the others.                                                                                                     |
| Credential exposure                                         | No device token/hash/pairing code in the listing; pairing codes still shown once by the existing flow.                                                      |

## 4. Test matrix (required for Batch B)

pgTAP `0078_kiosk_manageable_locations`:

| #   | Caller                                                                  | Expectation                                                                                |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | Org owner / general manager of org A                                    | lists every active A location; none of B                                                   |
| 2   | Active `manager` row at L1 only                                         | lists exactly L1                                                                           |
| 3   | `manager` at L1, none at L2 (same org)                                  | L2 absent; direct `kiosk_generate_pairing_code(L2)` raises 42501                           |
| 4   | `assistant_manager` / `staff` row                                       | empty                                                                                      |
| 5   | Inactive `manager` row                                                  | empty                                                                                      |
| 6   | Active manager row but **inactive org membership** (deactivated member) | **Expected DENY after the §6.1 hardening**; today the function **allows** it (finding F-1) |
| 7   | Manager of org A                                                        | cannot see/act on org B locations                                                          |
| 8   | Archived or inactive location                                           | excluded                                                                                   |
| 9   | Anonymous / null uid                                                    | empty / execute denied                                                                     |
| 10  | Overall owner/manager                                                   | lists all active locations (cap respected)                                                 |
| 11  | Property: listing ⇔ `private.kiosk_can_manage_location`                 | identical set over all seeded locations                                                    |

Vitest: action returns empty/`ok:false` on RPC error; page hidden when empty; page renders only returned locations; picker; reassign options restricted; existing `getLocationAdminContextAction` pinning test still passes; settings-page shows Kiosks card for a `server`-org-role user with a manageable location and **no** Locations card; Location Administration components not rendered; stale-demotion → denied state.

Playwright (desktop + host-tablet, real mode with synthetic fixtures at Batch C only): location manager sees Kiosks card only; opens, pairs (31-char alphabet), renames, revokes (reason required); cannot see Locations/staff/hours/archive; staff user sees no card; foreign-location Server Action replay is denied; existing org-owner Location Administration → Kiosks flow unchanged.

Real-JWT hosted check (Batch C, synthetic, owner-approved): the same matrix against the deployed DEV RPC.

## 5. Minimal implementation sequence

1. RPC migration + pgTAP matrix (local stack only) → green.
2. Data function + action + domain type + unit tests.
3. `KioskManagementPage` + `SettingsPage` card/subview + component tests.
4. Playwright spec update (demo-mode where possible; real-mode deferred to Batch C).
5. Regenerate types; focused checks (`npm run check`, focused Vitest, pgTAP 0077+0078); no full suites.
6. Hosted DEV push of the RPC and real-JWT matrix only with D-7 approval.

## 6. Dependencies and ordering

- Independent of the data backfill (can start as B1). Needs owner approval of Batch B scope and of the new RPC migration (D-9: ledger 88 → 89, additive, DEV push in Batch C).
- Must be complete (and PHYSICAL-device acceptance in V2-009 unaffected) **before Production release**.

### 6.1 Finding F-1 (P2, evidence-backed, found in Batch A) — kiosk predicate ignores org membership and live session

- Evidence: `private.kiosk_can_manage_location` (DEV, read verbatim) branch 3 checks only `location_memberships` (`active`, `role = 'manager'`); it does not require an **active org membership**, and — unlike the Tasks/Tips/Schedule/Payroll/Inventory predicates — does not call a `*_live_session()` check (banned user / revoked session). `deactivateMember` (`member-deactivation.ts`) sets `memberships.active = false`, `passcode_credentials.active = false` and a permanent Auth ban, but **does not deactivate `location_memberships`**.
- Impact: a deactivated former location manager who still holds an unexpired access token could call the kiosk RPCs / read `kiosk_devices` directly through PostgREST until the token expires (window = JWT lifetime). The Server Actions' `requireLiveSession` does not cover direct PostgREST calls. Not exploitable after token expiry (credentials inactive, user banned). Pre-existing since V2-007; unchanged by D7, but D7 makes the location-manager path a first-class feature, so it should be closed with it.
- Proposed correction (include in the same additive D7 migration, owner informed via D-9): replace `kiosk_can_manage_location` (forward-only `create or replace`) so branch 3 additionally requires an active `memberships` row for the location's organization, and add the same live-session guard the other modules use at the top. Keep branches 1–2 semantics. Re-run the existing pgTAP `0077` matrix to prove no regression for owners/GMs/Overall. **Not changed in Batch A.**
- If the owner prefers not to touch the predicate, the minimum is to document the residual window and have `deactivateMember` also deactivate that member's location rows (separate, riskier change).

## 7. Gate A5

The plan preserves authorization boundaries: no new authority, same predicate, no reuse of Location Administration, DB-enforced, fully tested. **A5: PASS.**

## 8. Implementation record — Batch B1 (local only; Hosted DEV unchanged)

**Status:** implemented and validated on the disposable local stack (ledger 88 → 89). Not pushed, no PR, not applied to Hosted DEV (gated by D-7). Sections 1–7 above are the original Batch A plan and are kept as written.

### 8.1 What was built

- **Migration** `supabase/migrations/20261112200000_kiosk_manager_authority_hardening.sql` (forward-only, additive; applied only to the local stack):
  - `private.kiosk_live_session()` — the repo's shared live-session contract (`auth.users.banned_until`, JWT `session_id` ↔ `auth.sessions` with `not_after`); same body as `private.{payroll,schedule,attendance,…}_live_session`; no client EXECUTE.
  - `private.kiosk_can_manage_location` replaced (same signature, so RLS policies and the five RPCs are untouched): requires a **live session for every branch**; the location-manager branch additionally requires an **active `memberships` row in the location's own organization**. Overall owner/manager remain membership-free; `assistant_manager`/`staff`/Overall assistant stay denied; location must be active and not archived.
  - `public.kiosk_list_manageable_locations()` — read-only `SECURITY DEFINER`, `search_path = ''`, EXECUTE only to `authenticated`, returns `(location_id, location_name, organization_id, organization_name)` for locations passing the same predicate, ordered, capped at 200.
- **TypeScript:** `ManageableKioskLocation` (domain), `listManageableKioskLocations` (data), `listManageableKioskLocationsAction` (zero client arguments, `requireLiveSession`, fail-closed generic error), `useManageableKioskLocations` hook, `KioskManagementPage` (re-fetches on open; picker only when >1 location; reassign targets restricted to the caller's manageable same-org locations; denied/error/loading states; imports nothing from Location Administration), Settings **Kiosks** quick-link card + `subview === "kiosks"` in `SettingsPage` (visible only when the database lists ≥1 location; independent of `isManager`; focus returns to the card on Back; real mode only).
- **Types:** the new RPC added to `database.generated.ts` (hand-spliced; the CLI also emits two unrelated pre-existing local/hosted drifts that were deliberately not committed).

### 8.2 Deviations from the plan (and why)

| Plan                                                      | Done                                             | Reason                                                                                                |
| --------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| pgTAP file `0078_kiosk_manageable_locations`              | `0078_kiosk_manager_authority`                   | Covers F-1 and the listing together.                                                                  |
| zod schema for `ManageableKioskLocation`                  | plain typed mapping                              | The RPC return type is generated; a second schema added no safety.                                    |
| `enforcement-coverage.test.ts` edit if required           | no change                                        | File-level exemption already covers `kiosk-admin-actions.ts`.                                         |
| Playwright in demo mode, real mode deferred to Batch C    | real-mode local-stack spec added; demo unchanged | Real Auth cookies work against the local stack; demo hides the card by design.                        |
| Location-manager Kiosks inside the closed-workspace shell | **not done**                                     | `ContextSettings` (lifecycle/`no_access` shell) is out of the §2.5 file list; recorded as a residual. |

### 8.3 Evidence

- pgTAP: `0078` 105/105; `0077` 57/57 unchanged; whole suite 81 files / 3294 assertions PASS on an 89-migration replay.
- Proof of defect: the predicate section of `0078` run against the **unfixed** 88-migration database failed exactly the 11 F-1 assertions (inactive/absent/cross-org membership, banned user, revoked/expired/foreign session) while all 29 preserved-authority assertions passed.
- Real GoTrue (local stack, `tests/local/kiosk-authority.local.test.ts`, 7/7): a real global sign-out, a real ban and a real membership deactivation each remove authority on the **old, still-valid access token** replayed straight at PostgREST. Negative control: with the original predicate restored, 4 of 7 fail (sign-out, ban, deactivation, membership-less stale row); restored hardened, 7/7.
- Browser (real cookies, local stack, `tests/local/ui/kiosk-location-manager.local.spec.ts`): 6/6 on desktop, WebKit tablet and mobile — pair (31-character alphabet), rename, revoke (reason required) verified in the database; picker limited to own locations; assistant/staff see no card; org owner keeps Location Administration → Kiosks; deactivation on an open page yields `Unauthorized`. Existing demo specs (`kiosk`, `location-administration`) 18/18.
- Vitest (focused): kiosk + settings + locations + enforcement-coverage 430/430. `npm run check` (Prettier, ESLint 0 warnings, `tsc`) clean.

### 8.4 Residual limitations (honest)

1. **Revocation is verified at the DB only through the repo-standard mechanism** (`auth.sessions` row + ban). A JWT **without** a `session_id` claim is checked for the ban only — identical to the other six modules' contract. GoTrue-issued user tokens always carry `session_id`; PostgREST accepts only signed tokens. If a custom minted token without `session_id` ever reaches these RPCs the gate degrades to ban-only.
2. The live-session gate now also applies to the **Overall** owner/manager branch (previously ungated) — intentional and consistent with the other modules.
3. Listing is capped at 200 rows; far above the current 49 locations but truncating silently beyond it.
4. **E-1 privilege spill is unchanged and unfixed.** The independent review confirmed B1 neither widens nor depends on it: the kiosk predicate reads `location_memberships` scoped to the one location and the new card exposes only the five kiosk actions.
5. `ContextSettings` (closed-workspace Settings) does not offer Kiosks.
6. The Kiosks UI does not route a `sessionInvalid` result to sign-out (it fails closed with a retryable error), and an already-open device list is not re-authorized until the next action (which the database denies).
7. **Pre-existing, outside B1 (U-1):** `kiosk_reassign_device` returns a revoked device to `status = 'active'` (null token hash) and audits it only as a reassignment. Needs its own correction decision; B1 deliberately did not change lifecycle semantics.
8. The `session_id`-less-JWT behaviour (ban-only check) is the shared contract of all `*_live_session` helpers; changing it is a cross-module decision (HANDOFF §3, P2-1).
9. **S1 update (2026-11-12):** item 7 (U-1) is **fixed locally** ([U-1 document](U1_KIOSK_REVOKED_DEVICE_LIFECYCLE.md)); item 4 (E-1) is reproduced and planned ([E-1 plan](E1_RECIPES_INVENTORY_SECURITY_PLAN.md)); items 1/8 were re-reviewed — the helpers are **not** uniform (Tasks/Tips require a live session row; five helpers keep the ban-only fallback) and no bypass exists ([S1 record](SECURITY_GATE_S1.md) §2); items 3, 5, 6 were assessed and deferred (S1 record §3).
