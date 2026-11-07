# Tasks integration handoff

Base `3fa0bf72b50e92c707fa58436cb78b907f67ef4a`; issue #310; target development. Never merge or apply hosted migrations. Read STATUS/EVIDENCE and local `.tmp/v2-tasks-location-scoping-handoff/`. Verify Preview compatibility before push: hosted DEV is 76 migrations, and hosted schema changes are unauthorized.

## Local verification complete / rollout boundary

The implementation adds one forward-only migration after the 76-migration base. It is not applied to hosted DEV under this task. On the unchanged hosted schema, the new application cannot pass `tasks_location_authorized`, so Tasks reads/commands refuse before legacy operational RPCs; authenticated old-schema browser acceptance and a missing-schema actor unit test verify this boundary. The explicit-ID own-recipient dismissal route remains a recovery operation.

Before any separately authorized hosted rollout: review migration `20261107160548_tasks_location_scoping.sql`, validate current source/schema parity, use the normal CLI migration process, and verify real active-context roles and actors. Preserve STAGED mode and module configurations; migration deployment does not authorize activation. Historical unresolved notification sources stay stored but hidden from location inboxes. Genuine Overall identities are retained by profile FKs; rollback should be a forward fix, not a restoration of membership actor FKs over Overall history.

Independent review is complete with no remaining findings. Local acceptance: JWT17, production browser18, old-schema compatibility1, nonempty historical upgrade, replay77, pgTAP2198 and units3261/7 existing skips. Feature PR/exact-head CI and final SHA receipts are recorded in the delivery checkpoint and local handoff. No merge, hosted migration/configuration/activation, backup change, main or Production operation is authorized. The next owner action after CI is review/approval of the development PR.
