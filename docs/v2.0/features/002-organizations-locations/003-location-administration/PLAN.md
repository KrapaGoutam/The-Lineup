# Subfeature V2-002.003: Location Administration — Plan

Parent Feature: [V2-002: Organizations & Locations](../README.md)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8) (Milestone #8)  
Tracking Issue: [#277](https://github.com/KrapaGoutam/The-Lineup/issues/277)  
Parent Issues: [#250](https://github.com/KrapaGoutam/The-Lineup/issues/250) (Feature V2-002), [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248) (Program V2.0)  
Prerequisites: V2-002.001 Organization Model (#273, PR #274) & V2-002.002 Location Model (#275, PR #276 Merged at `23cfa4156b07ecbfc9e17c262182fbbeb7dcc229`)  
Branch: `feature/v2.0-002.003-location-administration`  
Worktree: `.tmp/v2-location-administration`  
Target: `development`

---

## 1. Problem Statement & Mission

Subfeature **V2-002.003** delivers the complete, professional Manager/Owner UI for provisioning and configuring branches (restaurant locations) in The Lineup V2.0.

Core tenets:

1. **Manager/Owner Administrative Surface**: An authorized manager (Overall Owner, Overall Manager, active Org Owner, or active Org General Manager) can provision and manage branches without requiring database console access.
2. **Settings/App Shell Integration**: Extends the existing Settings subview architecture (`SettingsPage`), preserving full compatibility with the existing tab/view-state model without creating disjointed page routes.
3. **Authorized Organization Selection**:
   - Single-org managers automatically see their authorized organization with zero friction and no redundant selector.
   - Multi-org managers (e.g. Jack administering Monks and Liquor Tap) can switch between authorized organizations via a clean selector.
   - Unauthorized organizations are never exposed or selectable.
4. **Deterministic Location Listing**:
   - Displays all locations for the selected organization (active first, then alphabetical by name).
   - Avoids single-row or arbitrary `.limit(1)` truncation.
   - Shows location name, address summary (or "Address not configured"), time zone, active badge, and manage action.
5. **Secure Branch Creation**:
   - Full-featured creation form: Location name, physical address (`line1`, `line2`, `city`, `region`, `postalCode`, `countryCode`), IANA time zone selector, operating defaults (opening/closing times, cover weight).
   - Reuses `provision_location` RPC and `provisionNewLocation` mutation contract.
   - Enforces name length (1–120) and tenant uniqueness.
   - Disables double-submission and handles errors gracefully without dropping user input.
6. **Location Details & Metadata Editing**:
   - Authorized managers can edit name, address, time zone, and operating metadata.
   - Reuses `updateLocationMetadata` mutation contract.
   - Strict immutability guards: `id`, `organization_id`, `created_at` are non-editable.
7. **Weekly Operating Hours Schedule Editor**:
   - 7-day normalized weekly schedule editor (Sunday through Saturday).
   - Closed days explicitly distinguished from unconfigured days.
   - Supports overnight operating hours (e.g. 17:00 to 02:00) with clear "Closes next day" indicator.
   - Reuses `updateLocationOperatingHours` mutation contract.
8. **Server-Authoritative Security Boundary**:
   - Frontend role checks are for UX only; every server action validates caller identity via `requireLiveSession`, queries database-backed role assignments, and checks RLS/RPC permissions.
   - Cross-organization mutation is strictly blocked: an actor administering Org A cannot mutate Org B's locations.
   - No creator bypass regression (Issue #106 remains closed).
9. **Out of Scope / Non-Goals**:
   - NO new database migrations: 100% reuse of V2-002.002 schema and RPCs.
   - NO staff assignment management (deferred to V2-002.004).
   - NO location deactivation, archive, or delete (deferred to V2-002.005).
   - NO global active context switching (deferred to V2-003).
   - NO per-location module toggle configuration (deferred to V2-004).
   - NO Attendance V2 or Clock Kiosk implementation (deferred to V2-006 / V2-007).

---

## 2. Technical Architecture & File Layout

### 2.1. Server Actions (`src/features/locations/actions/`)

- `src/features/locations/actions/location-admin-actions.ts`:
  - `getLocationAdminContextAction()`: checks whether caller is overall manager/owner or org owner/GM, and returns list of administrable organizations.
  - `listLocationsForAdminAction(organizationId)`: returns all locations for the authorized tenant.
  - `provisionLocationAction(params)`: provisions a new branch via `provisionNewLocation`.
  - `updateLocationDetailsAction(params)`: updates branch metadata via `updateLocationMetadata`.
  - `getLocationOperatingHoursAction(locationId, organizationId)`: returns 7-day schedule via `getLocationOperatingHours`.
  - `updateLocationOperatingHoursAction(params)`: updates 7-day schedule via `updateLocationOperatingHours`.
  - Tests: `src/features/locations/actions/location-admin-actions.test.ts`.

### 2.2. Components (`src/features/locations/components/`)

- `location-administration.tsx`: Primary view with header, organization picker, search filter, Add Location modal trigger, location card list, and editor drawer/view.
- `location-list.tsx`: Deterministic card grid, address summary formatting, active status badges, and action triggers.
- `location-form.tsx`: Add/Edit branch form with client-side validation, duplicate submission protection, and address fields.
- `location-time-zone-select.tsx`: Searchable IANA time-zone selector with friendly labels (e.g. Central Time — America/Chicago).
- `location-operating-hours-editor.tsx`: 7-day schedule table with closed toggles, local wall-clock inputs, and overnight overnight indicators.
- Tests:
  - `src/features/locations/components/location-administration.test.tsx`
  - `src/features/locations/components/location-form.test.tsx`
  - `src/features/locations/components/location-operating-hours-editor.test.tsx`

### 2.3. Settings Navigation Integration

- `src/features/settings/components/settings-page.tsx`:
  - Adds subview navigation: `subview: "main" | "locations"`.
  - Renders "Locations" QuickLinkCard for authorized managers in main Settings.
  - Renders full `LocationAdministration` component with clean Back button when subview is `"locations"`.

---

## 3. Database Migration Decision

**NO NEW SCHEMA MIGRATION REQUIRED.**  
All necessary schema (`public.locations`, `public.operating_hours`), triggers (`locations_guard_payload`), RLS policies, and RPCs (`public.provision_location`) were established in V2-002.002 and verified on hosted DEV `opmujepkemwcdxxorhfd`.
