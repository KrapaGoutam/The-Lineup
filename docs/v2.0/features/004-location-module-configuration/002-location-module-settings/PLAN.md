# V2-004.002 — Location Module Settings

Approved scope: owner execution prompt, 2026-11-06. Reuse V2-004.001.

Data: existing location_module_configs only; explicit individual insert/update, no delete, no defaults or seeds. No migration. Last-writer fields suffice for this preference editor; append-only event history is not a requirement of this slice.

Authorization: request-scoped authenticated client, verified location and derived organization, canonical verifyLocationAdminAuthority, RLS as second layer. Overall Owner/Manager and active org Owner/GM only. Editor binds actor, organization and location explicitly; operational active-location cookie is not a target selector. Conditional updated_at writes prevent stale overwrites; first insert conflicts cannot overwrite another first choice.

UI: Settings → Locations → Manage → Modules, registry order, explicit Enable/Disable immediate per-row saves. No unsaved draft; pending/error choice retained for retry. Inactive configurable, archived read-only. Error results never become empty success. Settings always available. Demo source isolated in memory for this administration session.

Risks/tests: stale editor, identity switch, denied RLS, single-key/location isolation, read failures, retry, archived writes, responsive/keyboard. Validate focused Vitest, full checks/build, hosted real JWT, browser matrix, exact-head Preview/CI before merge.

Deferred: navigation/backend enforcement, backfill, stock isolation. Q1–Q4 remain open: zero new-location rows; no enumeration; preserve Settings/self-service and Team administrative passcode recovery; conservative authority unchanged.
