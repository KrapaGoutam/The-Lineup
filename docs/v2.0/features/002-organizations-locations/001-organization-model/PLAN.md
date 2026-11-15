# Subfeature V2-002.001: Organization Model — Plan

Parent Feature: [V2-002: Organizations & Locations](../README.md)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8) (Milestone #8)  
Tracking Issue: [#273](https://github.com/KrapaGoutam/The-Lineup/issues/273)  
Parent Issues: [#250](https://github.com/KrapaGoutam/The-Lineup/issues/250) (Feature V2-002), [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248) (Program V2.0)  
Prerequisite: V2-001 Access & Role Foundation ([#249](https://github.com/KrapaGoutam/The-Lineup/issues/249), PR #272 Merged at `c152d9d6b48ab8cec5fee6d999b99705748c2a4d`)  
Branch: `feature/v2.0-002.001-organization-model`  
Worktree: `.tmp/v2-organization-model`  
Target: `development`

---

## 1. Problem Statement & Mission

In The Lineup V2.0, multi-tenant scheduling and operational management require a stable, secure, and well-defined organization model.

Subfeature **V2-002.001** establishes the canonical organization layer:

1. **Tenant Identity & Table Reuse**: Canonical technical entity is `public.organizations`. No duplicate or parallel organization tables (`organizations_v2`, etc.). UUID primary key is authoritative and permanent.
2. **Name & Slug Policy**: Names are 1–120 trimmed characters. Slugs are canonical, lowercase, regex-constrained (`^[a-z0-9]+(?:-[a-z0-9]+)*$`), and globally unique. Duplicate slugs are strictly rejected. Slugs are immutable after creation to protect URL routing, external integrations, and tenant reference stability.
3. **Settings & Branding Contract**: Typed `OrganizationSettings` and `OrganizationBranding` contracts (`displayName`, `logoPath`, `primaryColor`). Arbitrary CSS, executable scripts, and security credentials (tokens, secrets) are strictly rejected. Settings modifications follow safe JSON merge semantics.
4. **Tenant Lifecycle & Deletion Policy**: Hard-deletes are strictly prohibited to prevent cascading destruction of operational records. Tenant deactivation and archival states are documented and safely deferred to V2-002.005 / V2-008 when cascade guards and operational dependencies are implemented.
5. **Creation & Owner Bootstrap Security**:
   - Following V2-001.007's permanent elimination of the Issue #106 creator bypass from `private.has_org_role`, `organizations.created_by` no longer confers authorization.
   - Direct tenant insertion is restricted strictly to Overall Owner capability.
   - An atomic PostgreSQL function (`public.provision_organization`) provisions the organization AND bootstraps an explicit active owner membership in `public.memberships` within a single database transaction. If owner bootstrap fails, the entire transaction rolls back, preventing orphaned tenants.
6. **Hardened RLS & Readers**:
   - `organizations_select_member`: Allows Overall Roles (`public.overall_roles`) or active organization members.
   - `organizations_insert_owner`: Overall Owner exclusive.
   - `organizations_update_manager`: Overall Owner/Manager or active Organization Owner/General Manager.
   - Cross-organization mutation isolation: Managers of Organization A cannot view or alter Organization B metadata.

---

## 2. Technical Scope & Architecture

### 2.1. Database Schema Decision (Additive Extension)

`public.organizations` is reused without table alterations:

- `id` (uuid, primary key)
- `name` (text, check length between 1 and 120)
- `slug` (text, unique, regex format check)
- `created_by` (uuid references auth.users)
- `settings` (jsonb object)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

Additive extensions:

1. **Immutability Guard Trigger** (`public.organizations_guard_immutability`): Rejects any change to `id`, `created_by`, or `created_at` on update, and automatically updates `updated_at`.
2. **Hardened RLS Policies**: Aligns SELECT and UPDATE with Overall Roles and eliminates client-side arbitrary tenant creation.
3. **Atomic Provisioning RPC** (`public.provision_organization`):
   ```sql
   create function public.provision_organization(
     p_name text,
     p_slug text,
     p_initial_owner_profile_id uuid default null,
     p_settings jsonb default '{}'::jsonb
   ) returns public.organizations;
   ```

### 2.2. Domain Models & Contracts (`src/features/organizations/domain/`)

- `Organization`: Canonical domain entity.
- `OrganizationBranding`: Typed branding structure (`logoPath`, `displayName`, `primaryColor`).
- `OrganizationSettings`: Strongly typed settings object with branding support.
- Pure validation functions:
  - `isValidOrganizationName(name: string): boolean`
  - `normalizeOrganizationName(name: string): string`
  - `isValidOrganizationSlug(slug: string): boolean`
  - `normalizeOrganizationSlug(slug: string): string`
  - `validateOrganizationBranding(branding: unknown): ValidationResult`
  - `validateOrganizationSettings(settings: unknown): ValidationResult`
  - `sanitizeOrganizationSettings(settings: unknown): OrganizationSettings`

### 2.3. Server Data Loaders & Mutations (`src/features/organizations/data/`)

- Readers:
  - `getOrganizationById(organizationId: string, client?: SupabaseClient)`
  - `getOrganizationBySlug(slug: string, client?: SupabaseClient)`
  - `listUserOrganizations(profileId: string, client?: SupabaseClient)`
  - `getCurrentUserOrganizations(client?: SupabaseClient)`
  - `getUserOrganizationSummaries(profileId: string, client?: SupabaseClient)`
- Mutations:
  - `provisionOrganization(params: ProvisionOrganizationParams, client?: SupabaseClient)`
  - `updateOrganizationMetadata(params: UpdateOrganizationParams, client?: SupabaseClient)`

---

## 3. Migration Plan

- Forward-only migration: `supabase/migrations/20261103040000_organization_model_foundation.sql`.
- No destructive changes or prior migration edits.
- Tested locally via `supabase db reset` and `supabase test db`.
- Applied to hosted DEV (`opmujepkemwcdxxorhfd`) after local test verification.

---

## 4. Quality Gates & Acceptance Conditions

1. Full Vitest test suite passes (`npm test`).
2. Dedicated pgTAP test suite `0056_organization_model.test.sql` passes all assertions.
3. Full pgTAP regression passes (all 56 test files, 1,700+ assertions).
4. Code quality checks pass: `git diff --check`, `npm run format:check`, `npm run lint`, `npm run typecheck`, Next.js production build (`npx next build --webpack`), `npm run check:local-paths`, `npm run check:env`.
5. Hosted DEV migration verified on `opmujepkemwcdxxorhfd`.
