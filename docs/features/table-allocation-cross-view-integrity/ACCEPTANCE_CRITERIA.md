# Acceptance criteria — Cross-View Integrity & Conflict Actions

Status: [ ] open, [x] met (evidence in TEST_MATRIX.md).

## X1 Identity / off-map

- [x] XV-01 `1` and `T1` are distinct (registered vs unregistered); identity proven from DB, documented
- [x] XV-02 read model resolves tables to `TableIdentity` (diningTableId or null); no prefix/normalization
- [x] XV-03 registered-unpositioned tables appear in Floor and Picker off-map sections (not dropped)
- [x] XV-04 unregistered held labels appear in Floor and Picker off-map sections with owner
- [x] XV-05 Grid shows an "Off-map" badge; Servers chips mark off-map; Dashboard still counts them
- [x] XV-06 off-map table never marks a mapped table (e.g. T1) occupied, in any view
- [x] XV-07 counts agree: Servers sum = Dashboard Active tables; available includes off-map registered

## X2 Conflict resolver

- [x] XV-10 Grid/Picker/Servers/Floor route an occupied table to one shared dialog
- [x] XV-11 Transfer moves the whole holder assignment, one active owner, event recorded
- [x] XV-12 End + Assign ends the whole holder assignment and creates a new active entry; history intact
- [x] XV-13 Cancel mutates nothing
- [x] XV-14 same-server duplicate: concise message, no mutation, no duplicate
- [x] XV-15 combined holder: dialog names the combined assignment; Transfer/End act on all tables
- [x] XV-16 End + Assign is a single atomic DB mutation (no intermediate state)
- [x] XV-17 stale client gets a server-authoritative conflict (PT409) and the same dialog
- [x] XV-18 simultaneous assign of one table: exactly one succeeds, other gets conflict; DB invariant holds
- [x] XV-19 Undo/Redo of End + Assign restores/reapplies both lifecycle truths
- [x] XV-20 new migration is forward-only, fixed search_path, auth.uid(), membership authz; pgTAP green

## X3 Servers history

- [x] XV-30 ended table remains visible (struck through, "Ended") in Servers
- [x] XV-31 active count excludes ended; table is available again on Floor/Picker
- [x] XV-32 ended then reassigned: A shows ended, B shows active, both in history

## X4 Automation

- [x] XV-40 machine-readable scenario matrix drives domain, component and Playwright layers
- [x] XV-41 `assertBoardAcrossViews` asserts Grid/Floor/Picker/Servers/Dashboard from one expectation
- [x] XV-42 desktop + tablet + mobile demo coverage

## X5 Real mode

- [x] XV-50 two+ browser contexts converge without refresh (assign, transfer, end, End + Assign)
- [x] XV-51 stale double-claim and simultaneous mutation covered on a production build vs DEV
- [x] XV-52 reconnect/offline converges; refresh preserves active/ended/transferred/combined/off-map
- [x] XV-53 service-date boundary 23:59→00:01 and previous-date rendering verified
- [x] XV-54 permissions identical regardless of view; server removal with active tables still blocked
- [x] XV-55 #134 architecture preserved (DB canonical, Realtime = invalidation); PROD ref absent

## Gate

- [ ] XV-90 unit, component, demo Playwright, production build, lint, typecheck, format, pgTAP, CI green
