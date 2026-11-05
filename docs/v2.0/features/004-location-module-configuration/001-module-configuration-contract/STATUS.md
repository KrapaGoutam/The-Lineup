# V2-004.001 — Status

Status: **`COMPLETE`** (2026-11-05). Cloud implementation validated on the official local Supabase stack and on hosted DEV; merged into `development` by regular merge commit via PR #299 (the merge SHA is recorded on PR #299 and Issue #298).

- Issue [#298](https://github.com/KrapaGoutam/The-Lineup/issues/298) · Parent #252 (open) · Program #248 (open) · Milestone #8 (open)
- Branch `feature/v2.0-004.001-module-configuration-contract` from `development` `fcc661df96b5af1c01ebb8f2f00ff42078e02979`; PR #299 targets `development` only. `main` (`5e5b7747…`) and Production untouched.
- Plan: [PLAN.md](PLAN.md) · Tests: [TEST_MATRIX.md](TEST_MATRIX.md) · Evidence: [EVIDENCE.md](EVIDENCE.md) (§7 = Local / hosted DEV)

## What it delivers

- `public.location_module_configs` (composite key `(location_id, module_key)`, enum-validated key, explicit `is_enabled` with no default, validated informational `metadata`, immutable ownership, server-stamped audit columns, no client delete, frozen at archived locations) with RLS aligned to the existing location-administration authority.
- Canonical TypeScript module registry (stable keys ≠ labels ≠ `AppTab` ids; Settings is system-required) with compile-time exhaustiveness against the generated enum and `AppTab`.
- A result model that distinguishes enabled / disabled / missing / location unavailable / unauthorized / unavailable / error, and a reader that never turns a failure into an empty configuration.

## Validation outcome

| Gate                                           | Result                                                                                          |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Official local stack: `db reset` 73 migrations | ✅ in order, no error                                                                           |
| Official local stack: `supabase test db`       | ✅ 62 files / 2012 assertions; `0062` 92/92; `0039`/`0042`/`0045` pass                          |
| Generated types (CLI 2.76.8 `--local`)         | ✅ identical apart from a pre-existing `__InternalSupabase` header; 59 pure additions in the PR |
| Hosted DEV (`the-lineup-dev`)                  | ✅ only this migration applied (72 → 73); checksum `109b7f4a…f19a`; **0 config rows**           |
| Real-JWT `MCR-01…10` on DEV                    | ✅ 10/10; denied writes proven against stored state, incl. silent zero-row UPDATEs              |
| Data safety                                    | ✅ DEV counts/fingerprints identical; 0 synthetic leftovers; persistent accounts untouched      |
| Static + app gates                             | ✅ lint, format, typecheck, local-paths, `npm test` 3078, `next build --webpack`                |

One defect found and fixed during validation (test harness only): the real-JWT teardown could not remove a location archived through the audit RPC (append-only `location_lifecycle_events`); see [EVIDENCE §7.3](EVIDENCE.md).

## What it does NOT do

No settings UI (V2-004.002), no navigation change (V2-004.003), no backend enforcement (V2-004.004), no backfill (V2-008.004), no operational location scoping (V2-005). Nothing reads the table; behaviour is unchanged. It does **not** fix the known V2-003 residuals (Schedule/Tips/Table Allocation/Bar Inventory location binding, reminder prompt context, direct-PostgREST cross-location RLS, cross-tab sign-out race). **Production release stays blocked.**

## Release gates and open dependencies (carry forward)

- **GATE — V2-004.004 must not be activated** in any environment until every ACTIVE location there has owner-approved explicit rows. A missing row is `missing` = not usable, never enabled. No guessed defaults for Monks, NASA or League City. DEV currently has 0 rows. See [MIGRATION_STRATEGY §2.3](../../MIGRATION_STRATEGY.md).
- **V2-004.002** — first writer. Owner decisions still **open**: Q1 new-location provisioning defaults (currently none: fail-closed), Q2 missing-vs-unauthorized status RPC (not added; no concrete need shown), Q3 passcode reset when Team is disabled, Q4 location-manager configuration authority (currently denied; not widened).
- **V2-004.003 / .004** — consumers; must treat `missing` as not usable; **acceptance requirement:** an authorized administrator must always keep an account-recovery path (passcode reset lives in Team, registry flag `hostsAccountRecovery`) while Settings stays reachable; no new role permissions.
- **V2-005** — operational location binding (Production blocker). **V2-008.004** — owner-approved backfill (Production blocker).
