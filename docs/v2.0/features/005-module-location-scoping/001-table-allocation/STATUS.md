# V2-005.001 - locally integrated; Preview push blocked

PR #305 is merged into development as ad878715b84fcdc3f36414b882d52207fb4f139e; enforcement remains STAGED. PR #306 is reconciled and validated locally, with push BLOCKED: live Preview uses hosted DEV, which lacks board_location_roster, and no password/SSO containment is configured. No #306 push/merge, hosted migration/configuration/activation or main/Production change. V2-005.002 NOT STARTED.

The bounded Overall actor repair remains intact: canonical Allocation actor,
real profile attribution and immutable authority facts, ordinary assignment/RLS,
live-session/stale/timezone/session ownership, revocation and undo/redo. No shadow
memberships, participant-FK weakening or global identity replacement.

Actual local integration validation: targeted57; fullunits3258 passed/7 existing
skipped; check/build/scans PASS; pgTAP65files2163 assertions; actual AllocationJWT45,
module/OverallJWT18, eleven-role matrix13; authenticated three-device browser15.
One pgTAP fixture's fixed2026-11-06 date expired; corrected to current restaurant-local
date. No application or migration change from prior validated composition.
Prior cleanreplay76 and legacy upgrade evidence reused for unchanged migrations.

New remote exact-head CI is NOT RUN because branch push is held. Existing remote
PR306 remains40c99addf568c1c34c91678ee09e300d55227437, OPEN/UNMERGED. #307 and
parent253 stay open. [Integration details and resume gate](INTEGRATION_HANDOFF.md).
