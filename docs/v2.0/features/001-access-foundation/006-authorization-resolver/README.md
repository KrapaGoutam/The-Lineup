# Subfeature V2-001.006: Canonical Authorization Resolver

Parent Feature: [V2-001: Access & Role Foundation](../README.md)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8) (Milestone #8)
Tracking Issue: [#269](https://github.com/KrapaGoutam/The-Lineup/issues/269)
Parent Issues: [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248), [#249](https://github.com/KrapaGoutam/The-Lineup/issues/249)
Status: `IN_PROGRESS`

## Scope

1. Pure, deterministic domain resolver: `src/features/auth/domain/access-resolver.ts` (`resolveUserAccess`).
2. Server-authoritative data loader: `src/features/auth/data/access-resolver.ts` (`resolveCurrentUserAccess`).
3. Capability union and precedence across:
   - System-wide Overall Roles (`owner`, `manager`, `assistant_manager` from `public.overall_roles`);
   - Multi-tenant Organization Memberships (`public.memberships`);
   - Independent Per-Location Roles (`manager`, `assistant_manager`, `staff` from `public.location_memberships`).
4. Strict tenant isolation (`locations.organization_id === targetOrganizationId`), fail-closed validation, and zero reliance on `organizations.created_by`.
5. Comprehensive unit tests covering Overall roles, scoped roles, combinations (elevation/baseline dominance), tenant safety, and the permanent Jack/Sam/Tom/Jerry and John test matrices.
