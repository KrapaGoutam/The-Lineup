# Feature V2-005.005: Payroll Location Scoping — Plan

## 1. Executive Summary

Feature V2-005.005 scopes The Lineup's Payroll module to the canonical V2.0 organization and location architecture.
Payroll is classified as a **HYBRID** module:

- **ORGANIZATION scope**: `payroll_settings` (default hourly rate), `payroll_rates` (per-person hourly rate overrides), organization-wide liability summaries.
- **LOCATION scope**: Operational period generation, dashboard KPI liabilities, period listings, payment recording/confirmation/unconfirmation, adjustments, and branch-specific statements for employees with verified location provenance.
- **SELF scope**: Regular staff members view only their own locked/paid periods, confirmed disbursements, and personal monthly statements via verified attendance identity links.

## 2. Invariants & Constraints

1. **Uniqueness contract**:
   `payroll_periods` preserves `UNIQUE(organization_id, neon_user_id, period_month)`. Exactly one snapshot per employee per calendar month per organization.
2. **Attendance provenance distinction**:
   Neon attendance logs lack physical restaurant location tags. Therefore:
   - Location membership is NOT equated with attendance provenance.
   - An employee assigned to multiple branches cannot have their entire month's attendance captured by a single branch manager. Branch generation fails closed for multi-location employees, requiring organization managers to generate org-wide payroll.
   - Single-location employees can be generated under their exclusive branch with `location_id`.
   - Historical records with `location_id IS NULL` remain untouched and preserved.
3. **Financial integrity**:
   - `balance_cents = gross_cents - confirmed_payments - adjustments`.
   - Draft payments do not deduct from balance.
   - Frozen gross snapshots: once payments exist, regeneration is permanently forbidden.
   - Signed adjustments: corrections are append-only with mandatory reasons.
   - All monetary figures are integer cents.
4. **Attribution FK repair**:
   - Replace composite `memberships(organization_id, profile_id)` FKs on actor columns (`updated_by`, `generated_by`, `regenerated_by`, `locked_by`, `created_by`, `confirmed_by`) with references to `public.profiles(id)` plus actor identity triggers (`actor = auth.uid()`), enabling Overall administrators without tenant memberships to legitimately manage payroll.

## 3. Architecture & Delivery Sequence

- **Stage 1 (Implement)**:
  - Migration: `location_id` on `payroll_periods`, attribution FK repair, actor identity triggers, security definer helpers (`payroll_profile_level`, `payroll_is_org_manager`, `payroll_can_manage_location`, `payroll_can_manage_period`, `payroll_can_read_period`), public RPC `payroll_location_authorized`, update `unconfirm_payroll_payment`, RLS hardening, backend module enforcement.
  - Server actions: `payroll-actor.ts`, active-context resolution, workspace expectation checks, multi-location safeguards.
  - UI components: `PayrollWorkspace` location scope indicators, multi-location badges, export/print parity.
- **Stage 2 (Verify)**:
  - Unit tests, pgTAP tests, real-JWT tests, populated-data rehearsal, migration replay.
- **Stage 3 (Deliver)**:
  - Feature branch `feature/v2.0-005.005-payroll-location-scoping`, PR targeting `development`, full receipts and handoff.
