# Subfeature V2-001.006: Canonical Authorization Resolver

Parent Feature: [V2-001: Access & Role Foundation](../README.md)  
Status: `NOT STARTED`

## Scope

1. Implement the canonical, pure authorization resolver function in TypeScript (`src/lib/auth-resolver.ts`) and equivalent PostgreSQL helper.
2. Calculate effective capabilities via the union of baseline Overall roles and location-scoped assignments.
3. Unit test coverage for all precedence permutations (baseline dominance, location elevation, staff-only).
