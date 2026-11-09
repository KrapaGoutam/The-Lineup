# V2-005 Stage C6 — Limited DEV Pilot Acceptance & Verification Report

Date: 2026-11-09  
Agent: Antigravity (Gemini 3.8 Flash High)  
Environment: Hosted DEV (`opmujepkemwcdxxorhfd`) & Preview Deployment  
Target Branch: `development` (`1d5bb9869960d721458903ea4185c50aea955d62`)  
Parent Issue: #253 | Milestone: #8 | Program: #248

---

## 1. Executive Summary

Under explicit owner authorization (**P-1 — Limited DEV Pilot**), Stage C6 executed the targeted configuration and authenticated hosted smoke acceptance for **Bar Inventory** at The Monk's DEV (`DEV Location`):

1. **Preflight Verified:** Ledger 82, enforcement STAGED, 0 pre-existing module configs, 44 active locations (42 test-harness fixtures), baseline inventory counts verified.
2. **Authorized Configuration Applied:** Exactly 1 row inserted into `public.location_module_configs` via authenticated TestOwner session (`b3add6a2-fd5f-45ac-93bc-0fbbd55b9e2f`). Actor attribution verified. All other 8 modules and 43 other locations remain unconfigured.
3. **Hosted Authenticated Smoke Executed (4/4 PASS):** Playwright automated suite (`tests/real/ui/v2-005-c6-hosted-smoke.real.spec.ts`) executed against the DEV-bound Vercel Preview (`https://the-lineup-git-docs-v2-005-formal-closeout-onepiece11.vercel.app`):
   - **C1 Navigation:** Bar Inventory visible in branch navigation; active branch DEV Location; unconfigured modules hidden; Settings accessible.
   - **C2 Inventory Table:** Real products load, search, sort, filter, and non-mutating row selection verified.
   - **C3 Cooler Layout:** View toggle renders, branch selector confirms DEV Location, All Storage Areas filter present, Unassigned Storage section present, expected empty physical layout rendered, drawer inspection verified.
   - **C4 Responsive:** Desktop (1280×800), Tablet (820×1180), and Mobile (390×844) verified with zero horizontal overflow.
4. **Data Reconciliation (100% Preservation):** Pre/post table counts across all 10 inventory and configuration tables verified completely identical (zero stock drift, zero audit drift).
5. **Closeout State:** Issue #253 is ready for final owner closeout sign-off. Backend enforcement remains STAGED.

---

## 2. GitHub & Environment Baseline

| Asset                                 | Identifier / Status                                                                        |
| :------------------------------------ | :----------------------------------------------------------------------------------------- |
| `origin/development`                  | `1d5bb9869960d721458903ea4185c50aea955d62` (PR #317 merged)                                |
| `origin/main`                         | `5e5b7747693b6e81014eafdf299b87e56c3f033d` (UNCHANGED)                                     |
| PR #316 (006-E Inventory Enhancement) | MERGED (`c9e78dac48c932c2735988194f62db2b76a28702`)                                        |
| PR #317 (Closeout Readiness Audit)    | MERGED (`1d5bb9869960d721458903ea4185c50aea955d62`)                                        |
| Hosted Preview Deployment             | `dpl_DQm4UB7vUQ3BX3CMpP3HJ7pTVohU` (READY; 10 JS chunks; DEV ref present, PROD ref absent) |
| Hosted DEV Project                    | `the-lineup-dev` (`opmujepkemwcdxxorhfd`, us-east-2)                                       |
| Migration Ledger                      | **82** (latest `20261109120000_inventory_physical_storage_layout.sql`)                     |
| Backend Enforcement Mode              | **STAGED** (`activated_at = NULL`, `activation_reference = NULL`)                          |

---

## 3. P-1 Configuration Mutation

### Pre-State

- `location_module_configs` count: **0**
- Active locations: 44 (The Monk's DEV, Manual Preview, 42 V2 Harness fixtures)

### Authenticated Actor

- Profile: `b3add6a2-fd5f-45ac-93bc-0fbbd55b9e2f` (`TestOwner`)
- Role: Active `owner` in `memberships` (`c5e8ad9c-39be-4344-bbdb-ae84306f0134`), `manager` in `location_memberships` (`a5d46f61-cf64-4b96-8d9f-41d6812d561c`).
- Session: Real Supabase Auth JWT obtained via derived password HMAC.

### Mutation Execution

Atomic insert executed through authenticated Supabase client:

```json
{
  "location_id": "a5d46f61-cf64-4b96-8d9f-41d6812d561c",
  "module_key": "bar_inventory",
  "is_enabled": true,
  "metadata": {},
  "created_at": "2026-11-09T22:54:44.077448+00:00",
  "updated_at": "2026-11-09T22:54:44.077448+00:00",
  "updated_by": "b3add6a2-fd5f-45ac-93bc-0fbbd55b9e2f"
}
```

### Post-State Verification

- `location_module_configs` total count: **1**
- Other 8 modules at DEV Location: **Unchanged / not configured** (missing)
- Other 43 active locations: **Unchanged / not configured** (missing)
- Backend enforcement settings: **STAGED** (`mode = staged`, `singleton = true`)

---

## 4. Hosted Authenticated UI Smoke Results

Executed via Playwright against the live Vercel Preview with legitimate `TestOwner` session:

| Test Case                         | Scope                                                          | Outcome          | Evidence                                                                                                                                                                                   |
| :-------------------------------- | :------------------------------------------------------------- | :--------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C1: Navigation & Availability** | Secondary navigation, branch indicators, module visibility     | **PASS** (1.4s)  | Bar Inventory appears; active branch DEV Location; Tasks, Tips, Payroll, Schedule hidden; Settings accessible                                                                              |
| **C2: Inventory Table**           | Products table, search, sort, filter, row selection            | **PASS** (438ms) | Existing products render; search & clear verified; selection checkbox works with zero stock mutations; no overflow                                                                         |
| **C3: Cooler Layout**             | View toggle, branch selector, area filter, empty state, drawer | **PASS** (691ms) | Toggle works; branch combobox confirms "DEV Location"; storage filter visible; Unassigned Storage heading visible; "No storage areas defined" empty state visible; drawer inspection clean |
| **C4: Responsive Viewports**      | Desktop (1280×800), Tablet (820×1180), Mobile (390×844)        | **PASS** (1.6s)  | Clean rendering across both table and cooler views; zero horizontal overflow (`scrollWidth <= clientWidth + 1`)                                                                            |

---

## 5. Multi-Branch & Write-Dependent Test Status

| Area                                        | Status                               | Rationale                                                                                                                                                                                                                                        |
| :------------------------------------------ | :----------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **All Authorized Branches (Multi-Branch)**  | **LOCAL VERIFIED / HOSTED DEFERRED** | Verified locally in real-JWT suite (distinct branch quantities, unauthorized branch exclusion). Hosted DEV execution deferred because neither non-harness DEV organization has >1 location and no dual-branch test actor was approved under P-1. |
| **Placement Mutations (Drag/Drop/Reorder)** | **DEFERRED**                         | Hosted DEV currently has 0 storage areas and 0 shelves. Option A invariant verified locally in unit, pgTAP, and component tests. Dedicated test data creation deferred until owner D4 decision.                                                  |
| **Stock Adjustments & Date Group Imports**  | **DEFERRED**                         | Business stock preservation strictly honored. Tested extensively in local/preview rehearsal suites.                                                                                                                                              |

---

## 6. Pre / Post Data Reconciliation

Full database audit before and after the smoke test:

| Table                            | Pre-Smoke | Post-Smoke | Delta |           Status            |
| :------------------------------- | :-------: | :--------: | :---: | :-------------------------: |
| `inventory_products`             |    148    |    148     |   0   |    **PASS (Preserved)**     |
| `inventory_stock`                |    236    |    236     |   0   |    **PASS (Preserved)**     |
| `inventory_stock` (DEV Location) |    32     |     32     |   0   |    **PASS (Preserved)**     |
| `inventory_adjustments`          |    123    |    123     |   0   |    **PASS (Preserved)**     |
| `inventory_date_lots`            |    47     |     47     |   0   |    **PASS (Preserved)**     |
| `bar_recipes`                    |    32     |     32     |   0   |    **PASS (Preserved)**     |
| `inventory_storage_areas`        |     0     |     0      |   0   |    **PASS (Preserved)**     |
| `inventory_storage_shelves`      |     0     |     0      |   0   |    **PASS (Preserved)**     |
| `inventory_storage_placements`   |     0     |     0      |   0   |    **PASS (Preserved)**     |
| `inventory_date_group_imports`   |     0     |     0      |   0   |    **PASS (Preserved)**     |
| `location_module_configs`        |     0     |     1      |  +1   | **PASS (Exact P-1 triple)** |
| `module_enforcement_settings`    |  staged   |   staged   |   0   |    **PASS (Preserved)**     |

---

## 7. Open Owner Decisions Summary

1. **D1 (Pilot scope):** Resolved (P-1 granted and executed).
2. **D2 (42 Harness Fixtures):** Decision remains whether to archive throwaway fixtures through the audited lifecycle path or configure them.
3. **D3 (Multi-Branch Hosted Actor):** Pending owner approval of dual-branch test actor in a harness organization.
4. **D4 (Write Smoke Dataset):** Pending approval for dedicated smoke test entities (`SMOKE-TEST-COOLER`, etc.).
5. **D5-Q1 & D5-R2:** New branch defaults and Team-gated roster boundary policies pending confirmation.
6. **P-2 (Reconciliation):** Not authorized.
7. **P-3 (ACTIVE Enforcement):** Not authorized; enforcement remains STAGED.

---

## 8. Safety & Compliance Attestation

- `main`: **UNCHANGED**
- Production (`ftadewtkjlaotfdvtjcv`): **UNTOUCHED**
- JobQuest: **UNTOUCHED**
- Backend enforcement: **STAGED**
- Active locations altered: **0** (only 1 config row inserted)
- V2-006 Attendance: **NOT STARTED**
