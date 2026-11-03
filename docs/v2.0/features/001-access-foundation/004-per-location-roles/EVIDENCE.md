# Subfeature V2-001.004: Per-Location Roles — Evidence

Parent Feature: [V2-001: Access & Role Foundation](../README.md)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8)  
Tracking Issue: [#265](https://github.com/KrapaGoutam/The-Lineup/issues/265)  
Parent Issues: [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248), [#249](https://github.com/KrapaGoutam/The-Lineup/issues/249)  
Status: `IN_PROGRESS`

---

## 1. Git Baseline

- **Starting development SHA:** `1ae02516a1d7aa6df606d1672d27f9c9a006db55`
- **Starting main SHA:** `5e5b7747693b6e81014eafdf299b87e56c3f033d`
- **Feature Branch:** `feature/v2.0-001.004-per-location-roles`
- **Worktree:** `.tmp/v2-location-roles`

---

## 2. Schema Architecture & Migration Decision

- **Decision:** **Outcome A — Additive Column on `location_memberships`**
- **Migration File:** `supabase/migrations/20261103010000_location_roles_foundation.sql`
- **Enum Created:** `public.location_role` (`'manager'`, `'assistant_manager'`, `'staff'`)
- **Column Added:** `public.location_memberships.role public.location_role not null default 'staff'`
- **Index Created:** `location_memberships_location_role_idx on public.location_memberships (location_id, role) where active`
- **Local Database Reset:** (Pending)
- **Generated Types:** (Pending)

---

## 3. Test Evidence

### 3.1. Vitest Unit Suite

- Command: `npm test`
- Results: (Pending)

### 3.2. pgTAP Database Suite

- Command: `npx supabase test db`
- Results: (Pending)

### 3.3. Quality Gates

- `npm run format:check`: (Pending)
- `npm run lint`: (Pending)
- `npm run typecheck`: (Pending)
- `npx next build --webpack`: (Pending)

---

## 4. Hosted DEV Verification

- **Target Project Ref:** `opmujepkemwcdxxorhfd` (`the-lineup-dev`)
- **Supabase Authentication:** Process-locally mapped `LINEUP_SUPABASE_ACCESS_TOKEN` as authoritative token; local CLI default login NOT trusted.
- **Dry-run & Migration:** (Pending)
- **Hosted Verification:** (Pending)
- **Production Guard:** `ftadewtkjlaotfdvtjcv` completely untouched.

---

## 5. Pull Request & CI Gate

- **PR Number:** (Pending)
- **Exact Head SHA:** (Pending)
- **CI Checks:** (Pending)
- **Merge Commit SHA:** (Pending)
