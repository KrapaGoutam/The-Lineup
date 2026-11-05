# V2-004.001 — Status

Status: **`IMPLEMENTED IN CLOUD — HOSTED DEV VALIDATION PENDING`** (2026-11-05). Not complete; not merged.

Implemented in Cloud; hosted DEV validation pending.

- Issue [#298](https://github.com/KrapaGoutam/The-Lineup/issues/298) · Parent #252 · Program #248 · Milestone #8
- Branch `feature/v2.0-004.001-module-configuration-contract` from `development` `fcc661df96b5af1c01ebb8f2f00ff42078e02979`; Draft PR targets `development` only. `main` (`5e5b7747…`) and Production untouched.
- Plan: [PLAN.md](PLAN.md) · Tests: [TEST_MATRIX.md](TEST_MATRIX.md) · Evidence: [EVIDENCE.md](EVIDENCE.md)

## What it delivers

- `public.location_module_configs` (composite key `(location_id, module_key)`, enum-validated key, explicit `is_enabled`, validated informational `metadata`, immutable ownership, server-stamped audit columns, no client delete, frozen at archived locations) with RLS aligned to the existing location-administration authority.
- Canonical TypeScript module registry (stable keys ≠ labels ≠ `AppTab` ids; Settings is system-required) with compile-time exhaustiveness against the generated enum and `AppTab`.
- A result model that distinguishes enabled / disabled / missing / location unavailable / unauthorized / unavailable / error, and a reader that never turns a failure into an empty configuration.
- pgTAP 92/92 and Vitest +58 in Cloud; the 61 pre-existing pgTAP files re-run (58 pass; 3 environment-limited identically at baseline).

## What it does NOT do

No settings UI (V2-004.002), no navigation change (V2-004.003), no backend enforcement (V2-004.004), no backfill (V2-008.004), no operational location scoping (V2-005). Nothing reads the table; behaviour is unchanged. It does **not** fix the known V2-003 residuals (Schedule/Tips/Table Allocation/Bar Inventory location binding, reminder prompt context, direct-PostgREST cross-location RLS, cross-tab sign-out race). **Production release stays blocked.**

## Pending before completion (Local)

Real Supabase stack `supabase test db` (including the 3 environment-limited legacy files), `supabase gen types --local` diff, hosted DEV migration of this single file, `tests/real/module-config.db.real.test.ts` 10/10, exact-head CI. Exact steps: [EVIDENCE.md §5](EVIDENCE.md).

## Open dependencies

- **V2-004.002** — first writer; provisioning defaults (Q1), recovery path outside Team (Q3), optional status RPC (Q2).
- **V2-004.003 / .004** — consumers; must treat `missing` as not usable; must keep account-recovery reachable when Team is disabled; .004 must not be activated before ACTIVE locations have explicit rows.
- **V2-005** — operational location binding (Production blocker). **V2-008.004** — owner-approved backfill (Production blocker).
