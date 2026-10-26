# Acceptance criteria — Cross-View Integrity & Conflict Actions

Status: [ ] open, [x] met (evidence in TEST_MATRIX.md).

## X1 Identity / off-map

- [ ] XV-01 `1` and `T1` are distinct (registered vs unregistered); identity proven from DB, documented
- [ ] XV-02 read model resolves tables to `TableIdentity` (diningTableId or null); no prefix/normalization
- [ ] XV-03 registered-unpositioned tables appear in Floor and Picker off-map sections (not dropped)
- [ ] XV-04 unregistered held labels appear in Floor and Picker off-map sections with owner
- [ ] XV-05 Grid shows an "Off-map" badge; Servers chips mark off-map; Dashboard still counts them
- [ ] XV-06 off-map table never marks a mapped table (e.g. T1) occupied, in any view
- [ ] XV-07 counts agree: Servers sum = Dashboard Active tables; available includes off-map registered

## X2 Conflict resolver

- [ ] XV-10 Grid/Picker/Servers/Floor route an occupied table to one shared dialog
- [ ] XV-11 Transfer moves the whole holder assignment, one active owner, event recorded
- [ ] XV-12 End + Assign ends the whole holder assignment and creates a new active entry; history intact
- [ ] XV-13 Cancel mutates nothing
- [ ] XV-14 same-server duplicate: concise message, no mutation, no duplicate
- [ ] XV-15 combined holder: dialog names the combined assignment; Transfer/End act on all tables
- [ ] XV-16 End + Assign is a single atomic DB mutation (no intermediate state)
- [ ] XV-17 stale client gets a server-authoritative conflict (PT409) and the same dialog
- [ ] XV-18 simultaneous assign of one table: exactly one succeeds, other gets conflict; DB invariant holds
- [ ] XV-19 Undo/Redo of End + Assign restores/reapplies both lifecycle truths
- [ ] XV-20 new migration is forward-only, fixed search_path, auth.uid(), membership authz; pgTAP green

## X3 Servers history

- [ ] XV-30 ended table remains visible (struck through, "Ended") in Servers
- [ ] XV-31 active count excludes ended; table is available again on Floor/Picker
- [ ] XV-32 ended then reassigned: A shows ended, B shows active, both in history

## X4 Automation

- [ ] XV-40 machine-readable scenario matrix drives domain, component and Playwright layers
- [ ] XV-41 `assertBoardAcrossViews` asserts Grid/Floor/Picker/Servers/Dashboard from one expectation
- [ ] XV-42 desktop + tablet + mobile demo coverage

## X5 Real mode

- [ ] XV-50 two+ browser contexts converge without refresh (assign, transfer, end, End + Assign)
- [ ] XV-51 stale double-claim and simultaneous mutation covered on a production build vs DEV
- [ ] XV-52 reconnect/offline converges; refresh preserves active/ended/transferred/combined/off-map
- [ ] XV-53 service-date boundary 23:59→00:01 and previous-date rendering verified
- [ ] XV-54 permissions identical regardless of view; server removal with active tables still blocked
- [ ] XV-55 #134 architecture preserved (DB canonical, Realtime = invalidation); PROD ref absent

## Gate

- [ ] XV-90 unit, component, demo Playwright, production build, lint, typecheck, format, pgTAP, CI green
