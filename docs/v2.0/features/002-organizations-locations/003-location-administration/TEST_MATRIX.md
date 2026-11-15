# Subfeature V2-002.003: Location Administration — Test Matrix

Parent Feature: [V2-002: Organizations & Locations](../README.md)  
Tracking Issue: [#277](https://github.com/KrapaGoutam/The-Lineup/issues/277)  
Milestone: [The Lineup V2.0](https://github.com/KrapaGoutam/The-Lineup/milestone/8) (#8)

---

## 1. UI Acceptance Test Cases (UI-001 through UI-020)

| ID         | Description                                   | Component / Action       | Expected Result                                                    |
| ---------- | --------------------------------------------- | ------------------------ | ------------------------------------------------------------------ |
| **UI-001** | Locations entry visible to authorized manager | `SettingsPage`           | Locations card rendered in Settings for authorized managers        |
| **UI-002** | Locations entry hidden/unavailable for staff  | `SettingsPage`           | Non-manager / unauthorized users do not see Locations card         |
| **UI-003** | Auto-selection for single-org manager         | `LocationAdministration` | Organization automatically active; selector omitted                |
| **UI-004** | Selector displayed for multi-org manager      | `LocationAdministration` | Dropdown displays authorized orgs; switching refreshes list        |
| **UI-005** | Unauthorized organization blocked             | Server Action / UI       | Attempting to fetch/select unauthorized org returns error          |
| **UI-006** | Correct locations displayed                   | `LocationList`           | All locations belonging to the chosen organization rendered        |
| **UI-007** | No single-row truncation                      | `LocationList`           | Multiple locations shown without `.limit(1)` truncation            |
| **UI-008** | Empty state rendered                          | `LocationAdministration` | Shows "No locations yet" and Add Location prompt                   |
| **UI-009** | Loading state rendered                        | `LocationAdministration` | Displays skeleton cards during initial fetch                       |
| **UI-010** | Error state rendered                          | `LocationAdministration` | Displays error alert with retry button                             |
| **UI-011** | Add Location opens functional form            | `LocationForm`           | Dialog opens with clean fields and defaults                        |
| **UI-012** | Cancel does not mutate data                   | `LocationForm`           | Dialog closes, no RPC invoked, no state change                     |
| **UI-013** | Valid form submits successfully               | `LocationForm`           | Calls `provisionLocationAction`, shows success, closes dialog      |
| **UI-014** | Invalid name rejected                         | `LocationForm`           | Inline error shown for empty or >120 char name                     |
| **UI-015** | Invalid time zone rejected                    | `LocationForm`           | Rejects non-IANA time zones                                        |
| **UI-016** | Duplicate name error handled                  | `LocationForm`           | Catches 23505 and shows "A location with this name already exists" |
| **UI-017** | Creation refreshes location list              | `LocationAdministration` | Newly provisioned location appears in list immediately             |
| **UI-018** | Edit Location loads correct data              | `LocationManageDialog`   | Current name, address, time zone, and hours loaded                 |
| **UI-019** | Authorized edit succeeds                      | `LocationForm`           | Calls `updateLocationDetailsAction`, persists updates              |
| **UI-020** | Unauthorized edit denied                      | Server Action            | Returns error; database RLS denies mutation                        |

---

## 2. Operating Hours Test Cases (HOURS-001 through HOURS-012)

| ID            | Description                             | Component / Action                   | Expected Result                                             |
| ------------- | --------------------------------------- | ------------------------------------ | ----------------------------------------------------------- |
| **HOURS-001** | Seven weekdays displayed                | `LocationOperatingHoursEditor`       | Sunday through Saturday rows rendered                       |
| **HOURS-002** | Existing schedule loads correctly       | `LocationOperatingHoursEditor`       | Hydrates persisted `openingLocal`, `closingLocal`, `closed` |
| **HOURS-003** | Closed day displayed correctly          | `LocationOperatingHoursEditor`       | Closed badge shown; time inputs disabled/blank              |
| **HOURS-004** | Unconfigured day distinguished          | `LocationOperatingHoursEditor`       | Clear label distinguishing unconfigured from closed         |
| **HOURS-005** | Opening time editable                   | `LocationOperatingHoursEditor`       | Input accepts valid HH:mm wall-clock time                   |
| **HOURS-006** | Closing time editable                   | `LocationOperatingHoursEditor`       | Input accepts valid HH:mm wall-clock time                   |
| **HOURS-007** | Overnight hours accepted                | `LocationOperatingHoursEditor`       | When closing < opening, shows "Closes next day"             |
| **HOURS-008** | Invalid local time rejected             | `LocationOperatingHoursEditor`       | Rejects malformed time strings with inline error            |
| **HOURS-009** | Save persists schedule                  | `updateLocationOperatingHoursAction` | Upserts to `operating_hours` table and updates state        |
| **HOURS-010** | Failed save preserves unsaved data      | `LocationOperatingHoursEditor`       | Form values retained on error; retry available              |
| **HOURS-011** | Reopening editor shows persisted values | `LocationOperatingHoursEditor`       | Fresh data fetched and displayed                            |
| **HOURS-012** | Local wall-clock time preservation      | `LocationOperatingHoursEditor`       | No silent browser timezone conversions                      |

---

## 3. Security Test Cases (SEC-001 through SEC-012)

| ID          | Description                         | Mechanism                            | Expected Result                                           |
| ----------- | ----------------------------------- | ------------------------------------ | --------------------------------------------------------- |
| **SEC-001** | Staff cannot provision locations    | Server Action / RPC                  | Denied with 42501                                         |
| **SEC-002** | Staff cannot edit location metadata | Server Action / RLS                  | Denied with 42501                                         |
| **SEC-003** | Cross-org manager creation denied   | Server Action / RPC                  | Denied when actor lacks role in target org                |
| **SEC-004** | Cross-org manager update denied     | Server Action / RLS                  | Denied when actor lacks role in target org                |
| **SEC-005** | Invalid org/location pair denied    | Server Action validation             | Denied when `location.organization_id !== organizationId` |
| **SEC-006** | Revoked org creator denied          | RLS / RPC                            | Issue #106 check: `created_by` has no bypass              |
| **SEC-007** | Forged client role ignored          | Server Action                        | Authenticates via `getUser()`, reads DB roles only        |
| **SEC-008** | Arbitrary actor identity rejected   | Server Action                        | Rejects unauthenticated caller or invalid session         |
| **SEC-009** | Location ID immutable               | DB trigger `locations_guard_payload` | Updating ID raises 22023                                  |
| **SEC-010** | Organization ownership immutable    | DB trigger `locations_guard_payload` | Updating `organization_id` raises 22023                   |
| **SEC-011** | No unintended staff assignments     | Provisioning RPC                     | 0 synthetic location_memberships created                  |
| **SEC-012** | No location deletion exposed        | RLS / UI                             | DELETE is denied; no UI control exposed                   |

---

## 4. End-to-End Playwright Scenarios (E2E-A through E2E-C)

- **E2E-A (Authorized Manager Flow)**: Sign in as manager -> navigate to Settings -> Locations -> select org -> view locations -> create branch -> edit details -> configure weekly hours -> verify persistence.
- **E2E-B (Unauthorized Staff Flow)**: Sign in as staff -> open Settings -> verify Locations card is hidden -> attempt direct action invocation -> confirm denial.
- **E2E-C (Responsive Viewports)**: Verify layout, cards, and modal dialogs at Desktop (1280px), Tablet (768px), and Mobile (375px) viewports in both light and dark mode.
