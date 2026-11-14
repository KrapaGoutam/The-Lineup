# V2-009 B2 — Database security hardening

**Owner:** The Lineup V2.0 owner

**Status:** Local implementation for independent security review

**Scope:** F-1 anonymous grants and F-2 direct Table Allocation RLS

## User outcome

Anonymous clients cannot use the audited assignment table, sequences, or trigger functions. Authenticated users can directly read or change Table Allocation records only where their existing role and canonical active target-location board authority permit it. Overall tiers retain their existing board-read contract without acquiring direct write privileges.

## Scope and acceptance

- F-1 revokes the confirmed current `anon` grants on `public.location_memberships`, seven audited sequences, and two trigger functions, and revokes explicit future `anon` defaults owned by `postgres` in `public`.
- F-2 applies `private.can_operate_board(organization_id, location_id)` to actual stored floor templates and seatings. Seating links validate the stored seating location and joined table location on reads and writes.
- Overall Owner, Manager, and Assistant Manager can directly **read** those three record types at authorized active target locations. No new Overall direct writes are granted.
- Organization Owner/GM board operation follows the same target-location helper. Their organization-wide assignment administration remains separate. Active assigned staff can see their own assignments and their active location roster; historical/self and administrative visibility remain available as approved.
- Cross-organization, inactive, archived, and unassigned target-location operations are denied. Denied writes leave rows unchanged.
- Registration, assignment management, kiosk pairing, GraphQL, Storage, trigger execution by owning operations, and authenticated grants retain their supported behavior.

## Data and authorization

Affected relations: `location_memberships`, `floor_templates`, `seatings`, `seating_tables`; seven existing identity sequences and two existing trigger functions. No new columns, indexes, tables, audit events, client routes, RPCs, generated types, or time-zone behavior. Existing RLS and permissive write-role policies remain; new restrictive policies narrow their location scope. Overall compatibility policies add SELECT only.

The local migration role cannot alter `supabase_admin`-owned default ACLs. Per the owner-approved V9-X2 exception, migration A leaves those explicit future `anon` grants in place. A read-only pgTAP check detects them. **F-1 is not fully hardened** until a separately authorized Supabase-admin operation removes them and verifies future object behavior. No global `PUBLIC` function defaults are changed.

## Implementation and verification

- Forward migration A: `20261114162527_v2_009_b2_anon_privilege_hardening.sql`; pgTAP `0085_b2_anon_privileges.test.sql`.
- Forward migration B: `20261114162724_v2_009_b2_direct_location_rls.sql`; pgTAP `0086_b2_direct_location_rls.test.sql`; real JWT `v2-009-b2-direct-rls.real.test.ts`.
- Regression-first old-schema checks failed as expected: F-1 13/21, F-2 32/56 (two fixture-count expectations subsequently corrected). Corrected F-1/F-2 pgTAP: 78/78; focused existing database compatibility: 433/433; new real JWT: 5/5; existing allocation JWT suites: 45/45.
- `npm run check` and webpack production build passed. Default Turbopack build cannot resolve the external `node_modules` junction in this isolated worktree; the same worktree limitation was observed previously. No runtime application code changed.
- No Playwright or viewport changes apply: this is a database-only security change. Existing UI loading, empty, error, success, and permission-denied states are unchanged.

## Rollout and risks

Local database only: 93 to 95 migrations. Apply both forward migrations in order after independent review and separate hosted authorization. No backfill or feature flag. Forward repair is required if a later rollout must be reverted; do not edit historical migrations. The outstanding `supabase_admin` defaults are a Production release blocker for a claim of complete F-1 hardening. Independent security review must also examine the policy composition and Overall read/write matrix before delivery.
