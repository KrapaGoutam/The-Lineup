# V2-005.001 ? Overall actor repair closeout

**LOCAL ACCEPTANCE VERIFIED ? final delivery / exact-head CI in flight.**
Existing issue #307 and PR #306; neither PR is merged.

The 23503 actor-membership blocker is repaired through Allocation-specific
canonical actor hydration, validated profile attribution FKs and immutable real
actor/authority snapshots. No fake memberships, nullable actor relaxation, global
identity replacement or tenant/location RLS expansion. Participant membership and
composite tenant/session/location constraints remain intact. Existing history is
preserved, including names for former location actors and attributed undo/redo.

Current verification is recorded in EVIDENCE.md and OA-01?OA-22 in TEST_MATRIX.md.
The earlier independent security corrections remain covered. This is a targeted
repair; no new feature/module work is included.

## Owner-controlled rollout remains pending

- PR #305 stays OPEN / staged / activation blocked. R1 configuration decisions
  for hosted DEV locations remain unresolved.
- Prefer #305 then #306 for migration chronology. The detached integration has
  verified the three-migration sequence and documented action/type/fixture
  reconciliation; the original #305 branch is untouched.
- Hosted DEV deployment and acceptance remain SKIPPED. No migrations or module
  configuration were applied there; this task made no hosted DEV contact.
- No merge approval or Production reconciliation V2-008.004 is implied.
- main and development remain at their verified starting SHAs. Production was
  never contacted. V2-005.002 Tasks is next and NOT STARTED.

Exact delivery SHA and CI receipts will be added to the existing PR/issue. Do not
substitute old-head results for final-head checks.
