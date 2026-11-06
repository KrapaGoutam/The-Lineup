# V2-005.001 - Independent closeout

**BLOCKED - NOT COMPLETE / NOT MERGED.** Issue #307; existing PR #306.

Security fixes close zero-assignment multi-location access, permissive manager
policy composition, and the Organization Owner/GM operational-location exemption.
The historical action uses the common live-session guard. The unchanged loader's
canonical fallback is safe; no source file was omitted.

Actual verification: standalone pgTAP 63 files / 2,077 assertions; combined 64 /
2,136; allocation real JWT 23/23 standalone and combined; #305 local JWT 15/15;
focused combined units 183/183; full unit suite 3,163 passed / 7 skipped;
authenticated local browser 6/6 on Chromium desktop, WebKit iPad and mobile.
Demo regression initially 155/159; all four failures passed focused serial reruns.
Application quality gates and production builds pass. Final commit/push and
exact-head CI evidence are recorded in the PR closeout; do not substitute old CI.

## Remaining blockers and owner decisions

- Overall-only users can read but cannot mutate without tenant membership:
  getCurrentUser and actor-membership FKs conflict with canonical cross-tenant
  Overall authority. Three actual JWT regressions reproduce 23503 and verify
  no persisted mutation. These passing NEGATIVE tests do not satisfy Overall
  mutation acceptance. A bounded identity/audit-contract repair or explicit
  owner acceptance of this functional limitation is required for a full GO.
- PR #305 remains implemented / activation blocked and OPEN. Its integration
  requires the documented action conflict resolution and explicit assignment
  fixtures. Choose merge/deployment order; prefer #305 before #306 to preserve
  migration chronology. #306 code can stand alone, but applying its later
  migration first requires an intentional include-all plan for #305 later.
- Hosted DEV browser/deployment validation is SKIPPED. No hosted parity or
  migration deployment is inferred from CI's skipped production deploy job.

No automatic merges, hosted activation, configuration changes to The Monk's or
Liquor Tap, main edits, or Production contact. V2-005.002 through .008 NOT STARTED.
Detailed findings, initial failures, cleanup and assertion scope: EVIDENCE.md.
