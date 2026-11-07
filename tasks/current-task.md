# PR305 staged merge and PR306 integration execution

Owner approved PR305 merge only, PR306 reconciliation/validation and push only after
verified Preview safety. PR306 merge, hosted migrations/configuration/activation,
main/Production, JobQuest and V2-005.002 remain unauthorized.

- [x] CP00: create durable local handoff outside tracked files
- [x] CP01: exact-head CI, protection and staged preflight
- [x] CP02/03: merge305 and verify development ad878715; publish actual receipts
- [x] CP04: inspect clean existing306 worktree and merge origin/development
- [x] Reuse validated actions/tests/fixture resolutions; reconcile shared docs/types
- [x] CP05: verify effective tree against validated reference and save local merge
- [x] CP06: validate combined security gates and cleanup
- [x] CP07: verify Preview safety before any branch push
- [ ] CP08/09: BLOCKED - push and new-head CI require compatible Preview/schema
- [ ] CP10: durable handoff and final report; never merge306

Data/security: three reviewed migrations unchanged; actor/live-session/context,
stale/timezone/session binding, location RLS, module guards before operational
reads, real audit actors/undo/redo and recovery exemptions retained. No UI change.
Prior validated reference bde49c9/b7c7059 is preserved unchanged. Handoff is
../v2-integration-handoff/{CURRENT_AGENT_STATE,INTEGRATION_HANDOFF,
VERIFICATION_RECEIPTS,NEXT_AGENT_INSTRUCTIONS}.md; keep it current at checkpoints.

Current: local reconciliation and security validation PASS; committing the local
merge before final CP10. Live Preview binding to DEV confirmed; no password/SSO
containment and required rosterRPC absent. Push BLOCKED. Newcheck/build/unit3258,
pgTAP2163, JWT45+31, browser15 PASS. Fixture-only date correction; migrations unchanged.
Local cleanup zero/staged; taskserver stopped. No remote306 push/CI/merge.
