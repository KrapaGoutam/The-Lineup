# Subfeature V2-001.007: RLS / Server Security Hardening

Parent Feature: [V2-001: Access & Role Foundation](../README.md)
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8) (Milestone #8)
Tracking Issue: [#271](https://github.com/KrapaGoutam/The-Lineup/issues/271)
Linked Debt Issue: [#106](https://github.com/KrapaGoutam/The-Lineup/issues/106)
Status: `IN_PROGRESS`

---

## 1. Overview & Objective

Subfeature **V2-001.007** hardens PostgreSQL Row-Level Security (RLS) policies and privileged `SECURITY DEFINER` functions, permanently eliminating the historic organization-creator authorization bypass debt tracked in Issue [#106](https://github.com/KrapaGoutam/The-Lineup/issues/106).

---

## 2. Key Deliverables

1. **Eliminate Creator Bypass in `private.has_org_role`**:
   Remove `organizations.created_by` bypass clause. Authority strictly requires active `memberships` rows with matching role sets.
2. **Audit and Harden `public.apply_location_assignment_changes`**:
   - Prevent authenticated actor spoofing.
   - Enforce Overall Owner and Overall Manager global assignment capabilities.
   - Restrict Overall Assistant Manager and normal staff from self-promotion, cross-user promotion, and unauthorized assignment.
   - Prevent cross-organization assignment.
   - Ensure atomic multi-location batch transactions (zero partial writes).
3. **Harmonize RLS Policies**:
   Update `public.location_memberships` policies to honor Overall Roles and fail-closed tenant boundaries.
4. **Comprehensive Test Suite**:
   Update `0008_member_deactivation.test.sql` and add `0055_rls_security_hardening.test.sql` verifying all 15 security scenarios.
5. **Forward-Only Migration**:
   `supabase/migrations/20261103030000_rls_security_hardening.sql`.
