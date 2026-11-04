# Subfeature V2-001.007: RLS / Server Security Hardening — Plan

Parent Feature: [V2-001: Access & Role Foundation](../README.md)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8) (Milestone #8)  
Tracking Issue: [#271](https://github.com/KrapaGoutam/The-Lineup/issues/271)  
Linked Debt Issue: [#106](https://github.com/KrapaGoutam/The-Lineup/issues/106)  
Parent Issues: [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248), [#249](https://github.com/KrapaGoutam/The-Lineup/issues/249)  
Branch: `feature/v2.0-001.007-rls-security-hardening`  
Worktree: `.tmp/v2-rls-hardening`  
Target: `development`

---

## 1. Problem Statement & Mission

The Lineup V2.0 Access Foundation (V2-001) established Overall Roles (001), Organization Membership (002), Location Access (003), Per-Location Roles (004), Multi-Location Assignment (005), and the Canonical Authorization Resolver (006).

Subfeature **V2-001.007** is the final security and hardening gate of the V2-001 foundation. It addresses:

1. **Elimination of Issue #106 creator bypass debt**:
   In `20260905065702_initial_schema.sql`, `private.has_org_role` allowed access if:
   `or exists (select 1 from public.organizations where organizations.id = target_organization_id and organizations.created_by = (select auth.uid()))`
   This historical gap allowed a deactivated creator (`memberships.active = false`) or a creator with deleted membership to retain privileged authorization platform-wide.
2. **Audit and hardening of SECURITY DEFINER functions**:
   Specifically `public.apply_location_assignment_changes`, ensuring:
   - Server-authenticated caller identity (`auth.uid()`, strictly un-spoofable).
   - Strict manager boundary enforcement: Overall Owner and Overall Manager hold global assignment authority; Overall Assistant Manager is denied manager authority across branches; ordinary staff are denied self-promotion and cross-user promotion.
   - Cross-organization mutation isolation: a manager in Org A cannot alter location memberships in Org B.
   - Atomic transactions: zero partial writes if any item in a batch fails.
3. **Table RLS Policy Hardening**:
   Ensure `public.location_memberships`, `public.organizations`, `public.locations`, and `public.memberships` policies correctly honor Overall Role tiers while strictly failing closed for deactivated members, revoked creators, and unauthorized actors.
4. **Legitimate Owner Preservation**:
   Verify that bootstrap owners and active administrators retain full, legitimate access through active `memberships` rows, without ever relying on the creator bypass.

---

## 2. Technical Scope & Architecture

### 2.1. `private.has_org_role` Hardening

Update `private.has_org_role` to derive authority strictly from `public.memberships`:

```sql
create or replace function private.has_org_role(
  target_organization_id uuid,
  allowed_roles public.app_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships
    where memberships.organization_id = target_organization_id
      and memberships.profile_id = (select auth.uid())
      and memberships.active
      and memberships.roles && allowed_roles
  );
$$;
```

### 2.2. `public.apply_location_assignment_changes` Audit & Hardening

- Caller authority check requires:
  - Caller holds Overall Role in `('owner', 'manager')`, OR
  - Caller holds active Org Role in `('owner', 'general_manager')` via `private.has_org_role(v_org_id, array['owner', 'general_manager']::public.app_role[])`.
- Overall Assistant Manager (`'assistant_manager'`) is denied elevated assignment privileges across organizations.
- Target profile must hold active parent organization membership (`memberships.active = true` for `v_org_id`).
- Location must be active and exist within `v_org_id`.
- Rejects unauthenticated callers, invalid UUIDs, invalid role enums, and duplicate location batch items.
- Atomicity: an unhandled exception in any batch element aborts the entire transaction (zero partial writes).

### 2.3. RLS Policy Hardening on `public.location_memberships`

Update policies:

- `location_memberships_select`: Allows own profile, or any overall role (`public.overall_roles`), or active member of location's owning org.
- `location_memberships_insert_manager`, `update_manager`, `delete_manager`:
  Allows Overall Owner/Manager (`role in ('owner', 'manager')`), or active org owner/GM (`private.has_org_role(..., array['owner', 'general_manager'])`).

---

## 3. Migration Plan

- Forward-only migration file: `supabase/migrations/20261103030000_rls_security_hardening.sql`.
- No modification of prior migrations.
- Tested locally via `supabase db reset` and `supabase test db`.
- Applied to hosted DEV (`opmujepkemwcdxxorhfd`) with dry run and post-migration validation.

---

## 4. Quality Gates & Stop Conditions

1. Full Vitest suite passes without regression (`npm test`).
2. Updated `0008_member_deactivation.test.sql` passes (reflecting #106 resolution).
3. Dedicated pgTAP test suite `0055_rls_security_hardening.test.sql` passes all 12+ security assertions.
4. Full pgTAP regression passes (all 55 test files).
5. ESLint, Prettier, TypeScript typecheck, Next.js production build pass.
6. Local path and secret leak checks pass.
7. Hosted DEV live schema and authorization verified.
8. PR opened, all CI checks green on exact latest head, merged via merge commit into `development`.
