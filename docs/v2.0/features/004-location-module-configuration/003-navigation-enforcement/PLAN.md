# V2-004.003 — Navigation enforcement

Approved scope: owner execution prompt, 2026-11-06. Parent #252, program #248, milestone #8. Build on merged PR #301.

Data: no schema or operational authorization changes. After authenticated active-context resolution and profile hydration, read canonical location configuration and serialize its validated rows as an array. Bind snapshot to verified profile, organization and location; preserve distinct failures. Demo bypasses hosted configuration and keeps its existing navigation. Demo administration choices remain isolated to that editor session.

Policy: intersect canonical module state with existing Team/Inventory manager restrictions and demo Payroll exclusion. Settings unconditional. Missing, failed, inactive, archived or mismatched snapshots expose no optional modules. Fallback: Tasks, Allocation, existing secondary navigation order, Settings.

UI: preserve weighted desktop tiers with filtered buttons and no empty primary divider. Mobile shows eligible primary modules plus More. Filter More/account and Settings shortcuts; gate actual module mounting, Tasks badges and reminders. Home/Back use policy. Settings-only explanation retains account/context/administration controls.

URLs/context: resolve before render; replace URL on fallback without adding history; clean incompatible recipe/mode detail parameters; retain verified location. Preserve popstate, V2-003 reconciliation and identity boundaries. Context switching hides old content and remounts by profile/org/location. Successful module saves trigger server refresh; independent-session changes appear on normal reload/refresh, no realtime guarantee.

Recovery: Settings exposes active targets permitted by existing canChangeDesignation. Reuse PasscodeResetDialog and existing reset callback/endpoint, preserving server checks, reason validation and audit; no new permission or credential mutation implementation.

States: pending/mismatched hosted snapshots fail closed. Error distinct from empty with reload. All disabled/missing keeps usable Settings. Staff retains account controls and contact-management guidance. Denied context remains in existing context-recovery flow.

Risks/tests: direct links/history/unknown/default tabs, snapshot mismatch, location/account changes, save refresh, lifecycle/errors vs missing, role intersection, Team-disabled recovery, keyboard/touch/overflow. Pure policy, entry and shell/Settings tests; focused/full Vitest, check/build; Chromium/WebKit responsive and authenticated DEV/HTTPS; synthetic cleanup and exact-head CI before regular merge.

Boundary: Module navigation reflects saved location preferences. Backend operation enforcement is not yet active. Existing backend user/location checks remain. V2-004.004, V2-005, backfill, main and Production out of scope. Q1–Q4 open; zero-row DEV baseline deliberately Settings-only until owner-approved per-location configuration.
