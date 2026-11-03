# Subfeature V2-001.005: Multi-Location / Multi-Role Assignment — Evidence

Parent Feature: [V2-001: Access & Role Foundation](../README.md)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8)  
Tracking Issue: [#267](https://github.com/KrapaGoutam/The-Lineup/issues/267)  
Parent Issues: [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248), [#249](https://github.com/KrapaGoutam/The-Lineup/issues/249)  
Status: `IN_PROGRESS`

---

## 1. Git Baseline

- **Starting development SHA:** `7065d397fd52e923a1f40913fec6b9d9d5d6b6cc`
- **Starting main SHA:** `5e5b7747693b6e81014eafdf299b87e56c3f033d`
- **Feature Branch:** `feature/v2.0-001.005-multi-location-multi-role`
- **Worktree:** `.tmp/v2-multi-location-roles`

---

## 2. Schema Architecture & RPC Decision

- **Architecture Choice:** Narrow database RPC `public.apply_location_assignment_changes`
- **Migration File:** `supabase/migrations/20261103020000_multi_location_assignment_workflow.sql`
- **Core Storage:** Existing `public.location_memberships` reused without new redundant core tables
- **Security Mode:** `security definer` with locked search path (`public, private, extensions`) and explicit per-organization caller authorization checks (`private.has_org_role`)
- **Execution Grants:** Revoked from `public, anon`; granted to `authenticated`

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
