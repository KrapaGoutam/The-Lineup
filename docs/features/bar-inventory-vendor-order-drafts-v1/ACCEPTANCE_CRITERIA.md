# Bar Inventory — Vendor Order Drafts V1 — Acceptance criteria

Each criterion is testable and maps to rows in `TEST_MATRIX.md` (IDs `VOD-…`). "Draft" means a `DRAFT` order draft; "Sent" means `SENT`. Decisions referenced as D-VOD-n are in `PLAN.md` §3.

## A. Placement and access

- **AC-NAV-1** Bar Inventory shows a tab **Order Drafts** between Inventory and Manage. It is not a top-level app module. History and Analytics remain reachable exactly as before.
- **AC-NAV-2** Dashboard → Order soon keeps its current content and role: it answers "what needs ordering". It is not an order editor.
- **AC-NAV-3** Each vendor group in Order soon shows **Create Order Draft** when the vendor has no active draft and **Open Order Draft** when it has one. The button opens the Order Drafts tab on that vendor's draft.
- **AC-NAV-4** The system "Unassigned" vendor group shows no button, only "Assign a vendor in Manage to draft an order" (D-VOD-9).
- **AC-ACC-1** Only Owner, Manager and Assistant Manager can see, create, edit, fill, clear, send, copy or export drafts. Staff never mount the view; the database also refuses them (RPC `42501`, RLS returns no rows). Server authorization is authoritative; hiding UI is not the control.
- **AC-ACC-2** A manager of organization A can never read or write a draft of organization B, and a draft is bound to one location. A forged draft/product/vendor id from another tenant is refused.

## B. One active draft per vendor and location

- **AC-DRAFT-1** At most one `DRAFT` exists per organization + location + vendor, enforced by the database, not by the client.
- **AC-DRAFT-2** Creating a draft for a vendor that already has one returns the existing draft; no duplicate is created, including when two managers or two tabs do it at the same moment, and when the request is retried.
- **AC-DRAFT-3** After a draft is Sent, a new draft for that vendor can be created; it starts from current stock and does not copy the Sent draft's quantities or notes.
- **AC-DRAFT-4** A new draft contains one line per Critical/Low item of that vendor (the same set Order soon shows) and nothing else. An inactive vendor, the system vendor, or another organization's vendor is refused with a plain-language message.
- **AC-DRAFT-5** A manager can add an active item of the same vendor that is not currently low; an item of another vendor, an archived item, or another organization's item is refused.
- **AC-DRAFT-6** **Update suggestions** re-stamps the suggestion snapshots, appends newly Critical/Low items, and never changes any Order Qty, item note, Included flag or the vendor note.

## C. Fields and calculations

- **AC-FIELD-1** Each line shows Item (name and size), status, **Suggested Order**, **Order Qty**, **Item Note** and **Included**. Suggested Order is read-only everywhere (UI, RPCs).
- **AC-FIELD-2** Suggested Order is the system value stored when the line was prepared. Changing inventory afterwards never changes a stored suggestion or an Order Qty (only an explicit **Update suggestions** re-stamps the suggestion, never the quantity).
- **AC-FIELD-3** A line whose item needs ordering but has no Par shows "Order needed", stores no numeric suggestion, and its Order Qty stays blank until the manager types one. No quantity is ever invented.
- **AC-FIELD-4** Order Qty accepts a non-negative number with at most two decimals; negative, non-numeric, more than two decimals, or absurdly large values are refused with a message naming the item. Blank means "not decided". `0` is accepted but treated like blank for Copy and Export.
- **AC-FIELD-5** Item note ≤ 200 characters and vendor note ≤ 1,000 characters, plain text; longer input is refused, not silently truncated. The vendor note is separate from item notes.
- **AC-FIELD-6** An excluded line (Included off) stays visible, keeps its values, and is omitted from Copy, Export and the Planned total.
- **AC-TOT-1** Suggested total = sum of numeric suggestions over all lines (equal to the Order soon group total at the moment the lines were stamped). Planned order total = sum of Order Qty over Included lines with Order Qty > 0. Both use exact decimal arithmetic (no floating-point drift).
- **AC-TOT-2** Lines without a numeric suggestion are reported separately ("+ N order needed"), never added to the Suggested total. Included lines without a quantity are reported ("N included lines have no quantity").
- **AC-TOT-3** Totals are labelled as ordering units; no currency symbol appears anywhere in this feature.

## D. Fill, Clear, Update

- **AC-FILL-1** **Fill from Suggestions** copies each numeric suggestion into Order Qty for lines whose Order Qty is blank; lines with no numeric suggestion stay blank.
- **AC-FILL-2** If any line already has a typed Order Qty, the dialog offers "fill empty only" (default) and "replace all"; "replace all" states how many typed quantities will be replaced and needs an explicit confirmation. A typed value is never overwritten without that confirmation.
- **AC-CLEAR-1** **Clear Draft** asks for confirmation naming what is lost. It sets all Order Qty and item notes to blank, all lines to Included, and the vendor note to blank. Lines, snapshots and the draft remain. It never changes inventory and is unavailable on a Sent draft.

## E. Concurrency and failure

- **AC-CONC-1** Every mutation carries the draft version the screen was based on. If another manager saved in between, the write is refused (`PT409`, kind `stale`) and **nothing is applied**; the screen says who changed it and when, and offers **Load their version** or **Apply my edits on top** (re-sends only the lines I changed). No silent last-write-wins.
- **AC-CONC-2** A stale conflict whose other writer is the same person (second tab, retried request) reloads quietly without an alarm.
- **AC-CONC-3** Saving with nothing changed is a no-op: no version bump, no error.
- **AC-CONC-4** Offline or a failed request keeps the typed edits on screen, says the save failed, and allows retry; it never shows a false "Saved".
- **AC-CONC-5** Unsaved edits are not lost by switching views without a prompt; the user is asked to Save, Discard or stay.

## F. Copy and export

- **AC-COPY-1** **Copy Order** produces the plain text of D-VOD-11 from Included lines with Order Qty > 0: header "{Vendor} — Order Request", one line per item `{Name} {Size} — {Qty}` (item note in parentheses), then a `Notes:` block only when the vendor note is non-empty. Excluded lines and blank/zero quantities never appear. Labels are live for a Draft and frozen for a Sent order.
- **AC-COPY-2** With nothing to send, Copy and Export are disabled and say why ("Add a quantity to at least one included line").
- **AC-EXP-1** The draft exports as **CSV** and **XLSX** through the existing export infrastructure (`ExportDocument`, `exportDataAction`); no second spreadsheet writer. Contents follow D-VOD-12 (Included lines with Order Qty > 0).
- **AC-EXP-2** The server builds the file from the draft it loads under the caller's access. The request carries a draft id and a format only; client-supplied rows are not accepted; another tenant's or location's draft id is refused.
- **AC-EXP-3** CSV and XLSX neutralise formula-leading text in every text cell (item names, SKUs, item notes, vendor note, vendor name), exactly as the other Bar Inventory exports do; numbers stay numbers.
- **AC-EXP-4** The pending owner decision on an export audit log (BI-11 AC-EXP-4) applies to this export too and is neither decided nor blocked by this feature.

## G. Mark Sent and Sent history

- **AC-SENT-1** **Mark Sent** is available only on a Draft that has at least one Included line with Order Qty > 0, and only after a confirmation that says the order is recorded as sent **outside The Lineup**, that **inventory will not change**, and that it can no longer be edited.
- **AC-SENT-2** Marking Sent sets the status, the sender and the time (shown in the location's time zone), freezes vendor and item labels and suggestion snapshots, and makes the draft read-only in the database (updates and deletes are refused with `23514`, including by direct SQL as a privileged role other than tenant teardown).
- **AC-SENT-3** **Mark Sent never changes On Hand, Backup, Total, stock versions, or the adjustment ledger.** Inventory changes only when a delivery or restock is recorded through the existing audited path.
- **AC-SENT-4** Mark Sent is idempotent: repeating it, or a second manager sending after the first, reports "Already marked sent by {name} at {time}" and changes nothing. Sending a draft that another manager has edited since this screen loaded is refused as stale.
- **AC-SENT-5** The **Sent** list shows vendor, date sent, sent by, line count and planned total, newest first, loaded in explicit pages with no silent row cap. A Sent order opens read-only showing, per line, the frozen label, **Suggested (at draft)**, **Ordered**, item note, and the vendor note. Renaming, archiving or re-pricing a catalog item afterwards does not change it.
- **AC-SENT-6** Sent history is separate from the stock ledger History, which is not modified.

## H. Quality gates

- **AC-QA-1** Desktop, host-tablet and phone (390 px) layouts work without horizontal page scroll; Order Qty, Item Note, Included and the primary actions are reachable by keyboard and touch (targets ≥ 44 px on touch).
- **AC-QA-2** Inputs have programmatic labels that name the item; dialogs trap and restore focus and close with Escape; success is announced politely, failures assertively; status is not conveyed by colour alone.
- **AC-QA-3** Demo mode supports the same flows in memory using the same pure engine; real mode uses only the RPCs.
- **AC-QA-4** The repository quality gate passes (format, lint, typecheck, unit, pgTAP for the migration PR, Playwright on all three device projects for the UI PRs) with exact-head CI green before each merge.
