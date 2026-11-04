# Subfeature V2-002.002: Location Model — Plan

Parent Feature: [V2-002: Organizations & Locations](../README.md)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8) (Milestone #8)  
Tracking Issue: [#275](https://github.com/KrapaGoutam/The-Lineup/issues/275)  
Parent Issues: [#250](https://github.com/KrapaGoutam/The-Lineup/issues/250) (Feature V2-002), [#248](https://github.com/KrapaGoutam/The-Lineup/issues/248) (Program V2.0)  
Prerequisite: V2-002.001 Organization Model ([#273](https://github.com/KrapaGoutam/The-Lineup/issues/273), PR #274 Merged at `f078104d56f29809880d0cd584958c9fd47fbdb3`)  
Branch: `feature/v2.0-002.002-location-model`  
Worktree: `.tmp/v2-location-model`  
Target: `development`

---

## 1. Problem Statement & Mission

Subfeature **V2-002.002** establishes the canonical location (branch) foundation for multiple physical restaurant locations operating under one parent organization in The Lineup V2.0.

Core tenets:

1. **Single Canonical Location Table**: The canonical technical entity is `public.locations`. No parallel table (`branches`, `locations_v2`, `restaurant_branches`, etc.) is introduced.
2. **Location Identity**: Permanent, immutable UUID primary key (`id`). Location renaming or address alterations never alter the location's UUID.
3. **Immutable Organization Ownership**: Every location belongs to exactly one parent organization via `organization_id` foreign key referencing `public.organizations(id)`. Organization reassignment is strictly blocked by database-level immutability triggers.
4. **Tenant-Scoped Name Uniqueness**: Location names are 1–120 trimmed characters. Names are unique within each parent organization via `UNIQUE (organization_id, name)`. Cross-organization duplicate names (e.g., "Downtown" for two separate organizations) are explicitly permitted.
5. **Physical Address Contract**: Typed `LocationAddress` structure (`line1`, `line2`, `city`, `region`, `postalCode`, `countryCode`). Stored in `locations.address` (jsonb object). Empty or missing fields in legacy rows remain fully backward compatible. Geocoding, GPS, or coordinate lookups are explicitly omitted.
6. **Authoritative IANA Time Zones**: `locations.time_zone` requires an authoritative IANA time zone (e.g. `America/Chicago`, `America/New_York`, `UTC`). Ambiguous fixed abbreviations (`CST`, `EST`, `GMT-6`) and invalid strings (`Texas`, `America/Huston`) are strictly rejected at both domain and database levels using PostgreSQL's `pg_timezone_names` catalog.
7. **Canonical Operating Hours Representation (Option C)**: Reuses existing normalized table `public.operating_hours` (`location_id`, `organization_id`, `day_of_week`, `opening_local`, `closing_local`, `closed`) and location fallback hours (`opening_local`, `closing_local`). Supports overnight operations (e.g. 17:00 to 02:00) where `opening_local <> closing_local`. Distinguishes explicitly `closed` days from unconfigured days.
8. **Preservation of Existing Fields**: `cover_weight` numeric(5,2) default 0.25 and `active` boolean default true are fully preserved.
9. **Secure Provisioning & Management**:
   - Direct INSERT and UPDATE on `public.locations` restricted to Overall Owner/Manager or active Org Owner/General Manager.
   - Atomic RPC `public.provision_location` validates organization existence, caller management authority, name uniqueness, IANA zone validity, and address JSON.
   - Creating a location never automatically assigns ordinary staff to the new location (explicit location assignment remains under V2-002.004).
10. **Hard Deletes Prohibited**: DELETE on `public.locations` is denied to prevent catastrophic cascades across shifts, attendance, tips, inventory, and payroll. Full lifecycle management is deferred to V2-002.005.

---

## 2. Technical Scope & Architecture

### 2.1. Database Schema Decision (Additive Extension)

The existing `public.locations` table is reused with additive enhancements:

- `id` (uuid, primary key)
- `organization_id` (uuid, references public.organizations(id))
- `name` (text, check length between 1 and 120)
- `time_zone` (text, authoritative IANA zone)
- `address` (jsonb, object)
- `cover_weight` (numeric(5,2), between 0 and 10)
- `active` (boolean, default true)
- `opening_local` (time, default '11:00')
- `closing_local` (time, default '23:00')
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now()) — **Additive column**

Additive database extensions:

1. **Additive Column**: `updated_at timestamptz not null default now()`.
2. **Locations Payload & Immutability Guard Trigger** (`public.locations_guard_payload`):
   - Validates `time_zone` against `pg_timezone_names` (enforcing valid IANA named zone or 'UTC').
   - Validates `address` is a valid JSON object.
   - Enforces trimmed `name` length 1–120.
   - On UPDATE: strictly prevents modification of `id`, `organization_id`, and `created_at`; automatically refreshes `updated_at := now()`.
3. **Hardened RLS Policies on `public.locations`**:
   - `locations_select_member`: Overall Role holders OR active organization members.
   - `locations_insert_manager`: Overall Owner/Manager OR active Org Owner/General Manager.
   - `locations_update_manager`: Overall Owner/Manager OR active Org Owner/General Manager.
   - DELETE: Denied (no policy granted).
4. **Hardened RLS Policies on `public.operating_hours`**:
   - `operating_hours_select_member`: Overall Role holders OR active organization members.
   - `operating_hours_write_manager`: Overall Owner/Manager OR active Org Owner/GM/Shift Manager.
5. **Secure Provisioning RPC** (`public.provision_location`):
   ```sql
   create function public.provision_location(
     p_organization_id uuid,
     p_name text,
     p_time_zone text default 'UTC',
     p_address jsonb default '{}'::jsonb,
     p_cover_weight numeric default 0.25,
     p_opening_local time default '11:00'::time,
     p_closing_local time default '23:00'::time
   ) returns public.locations;
   ```

### 2.2. Domain Models & Contracts (`src/features/locations/domain/`)

- `Location`: Canonical domain entity.
- `LocationAddress`: Typed address contract.
- `LocationSummary`: Lightweight summary contract for context switcher.
- `DayOperatingHours`: Daily schedule model (`dayOfWeek`, `openingLocal`, `closingLocal`, `closed`, `isOvernight`).
- Pure validation functions:
  - `isValidLocationName(name: string): boolean`
  - `normalizeLocationName(name: string): string`
  - `isValidIanaTimeZone(timeZone: string): boolean`
  - `validateLocationAddress(address: unknown): ValidationResult`
  - `validateOperatingHours(hours: unknown): ValidationResult`
  - `mapLocationRow(row: DatabaseLocationRow): Location`

### 2.3. Server Data Loaders & Mutations (`src/features/locations/data/`)

- Readers:
  - `getLocationById(locationId: string, client?: SupabaseClient)`
  - `listLocationsByOrganization(organizationId: string, client?: SupabaseClient)`
  - `listActiveLocationsByOrganization(organizationId: string, client?: SupabaseClient)`
  - `getCurrentUserAccessibleLocations(organizationId: string, client?: SupabaseClient)`
  - `getLocationOperatingHours(locationId: string, client?: SupabaseClient)`
- Mutations:
  - `provisionNewLocation(params: ProvisionLocationParams, client?: SupabaseClient)`
  - `updateLocationMetadata(params: UpdateLocationParams, client?: SupabaseClient)`
  - `updateLocationOperatingHours(locationId: string, hours: DayOperatingHours[], client?: SupabaseClient)`

---

## 3. Migration Plan

- Forward-only migration: `supabase/migrations/20261103050000_location_model_foundation.sql`.
- No modifications to prior migrations.
- Local reset verification: `npx supabase db reset` and `npx supabase test db`.
- Remote DEV target: `opmujepkemwcdxxorhfd`.
- Production `ftadewtkjlaotfdvtjcv` prohibited.
