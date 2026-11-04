# Subfeature V2-002.002: Location Model — Status

Parent Feature: [V2-002: Organizations & Locations](../README.md)  
Tracking Issue: [#275](https://github.com/KrapaGoutam/The-Lineup/issues/275)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8) (#8)  
Status: **IMPLEMENTATION COMPLETE (AWAITING PR & MERGE)**  
Branch: `feature/v2.0-002.002-location-model`  
Worktree: `.tmp/v2-location-model`  
Integration Target: `development`

---

## Deliverables Status

| Deliverable                                           | Status   | Notes                                                                                                         |
| ----------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| Existing `public.locations` schema audit              | Complete | Additive `updated_at` column identified; existing fields preserved                                            |
| Canonical location identity                           | Complete | Stable UUID, immutable primary key                                                                            |
| Organization ownership & immutability guards          | Complete | `organization_id`, `id`, `created_at` locked via trigger `public.locations_guard_payload`                     |
| Location name validation & tenant-scoped uniqueness   | Complete | 1–120 chars, `unique (organization_id, name)` enforced                                                        |
| Physical address contract & legacy compatibility      | Complete | Typed `LocationAddress`, object validation, backward compatible                                               |
| Authoritative IANA time-zone validation               | Complete | `pg_timezone_names` check in DB; `Intl.supportedValuesOf` in domain (`America/Chicago` valid, `CST` rejected) |
| Weekly operating hours contract & overnight semantics | Complete | Reusing `public.operating_hours` (Option C), overnight `opening <> closing` supported                         |
| Operating metadata & cover weight preservation        | Complete | `cover_weight` numeric(5,2) and `active` boolean preserved                                                    |
| Domain model & pure validators                        | Complete | `src/features/locations/domain/location.ts` (23 tests passed)                                                 |
| Server data readers & mutations                       | Complete | `src/features/locations/data/` (26 tests passed)                                                              |
| Hardened RLS policies                                 | Complete | `locations_select_member`, `locations_insert_manager`, `locations_update_manager`, DELETE denied              |
| Hardened `public.operating_hours` RLS                 | Complete | Overall role support added, tenant isolated                                                                   |
| Secure location provisioning RPC                      | Complete | `public.provision_location`                                                                                   |
| No automatic staff assignment to new locations        | Complete | Explicit assignment preserved (0 synthetic staff memberships generated)                                       |
| Dedicated pgTAP database security tests               | Complete | `0057_location_model.test.sql` (32 assertions passed; full suite: 57 files, 1,759 assertions passed)          |
| Unit and integration tests                            | Complete | Full Vitest suite: 179 files, 2,433 tests passed                                                              |
| Quality gates verification                            | Complete | `format:check`, `lint`, `typecheck`, `check:env`, `check:local-paths`, `npx next build --webpack` all passed  |
| Hosted DEV verification                               | Complete | Target `opmujepkemwcdxxorhfd`: Migration `20261103050000` pushed and confirmed in sync                        |
