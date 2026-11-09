# V2-005 Closeout — Hosted Authenticated Owner Smoke

Status: **EXECUTED (PASS — Limited DEV Pilot).** Precondition P-1 granted and executed; `bar_inventory` Enabled at DEV Location. Authenticated read-only smoke executed against the DEV-bound Vercel Preview (`dpl_DQm4UB7vUQ3BX3CMpP3HJ7pTVohU`).

Target: `https://the-lineup-git-docs-v2-005-formal-closeout-onepiece11.vercel.app` against DEV `opmujepkemwcdxxorhfd`. Production never used. Legitimate `TestOwner` session used; no credentials printed or committed.

Scope note: Backend enforcement remains **STAGED**. This smoke proves location scoping, UI navigation gating, and component integrity under hosted conditions. ACTIVE-mode database rejection is verified locally and remains gated behind P-3.

---

## Preconditions

- [x] P-1 approved with exact triples; `bar_inventory` Enabled at `DEV Location` (`a5d46f61-cf64-4b96-8d9f-41d6812d561c`).
- [ ] D3: an actor with genuine access to two or more branches (All authorized branches) — **DEFERRED** on hosted DEV.
- [ ] D4: approved dataset and cleanup owner for write tests — **DEFERRED** (read-only pilot authorized).
- [x] Baseline counts captured and verified: products 148, stock 236, adjustments 123, date lots 47, recipes 32, storage tables 0.

---

## Inventory Table & Navigation

- [x] Bar Inventory appears in branch navigation; active branch DEV Location.
- [x] Unconfigured optional modules (Tasks, Tips, Payroll, Schedule) hidden.
- [x] System-required Settings remains accessible.
- [x] Inventory Table opens; products, categories, vendors load.
- [x] Search, sort, and filtering work.
- [x] Row selection works (individual, select all shown, clear, indeterminate header). Zero stock mutations produced.

---

## Cooler Layout

- [x] View toggle switches cleanly between Inventory Table and Cooler Layout.
- [x] Branch selector displays real branch name: `DEV Location` (value: `current`).
- [x] "Select storage area" filter displays `All Storage Areas` and `Unassigned Storage (30)`.
- [x] "Unassigned Storage" heading (30 items) renders correctly.
- [x] Empty physical storage layout renders expected guidance ("No storage areas defined").
- [x] Search filter ("Filter products or slots…") works.
- [x] "Manage Unassigned" drawer opens read-only product inspection.
- [x] Responsive layout verified on Desktop (1280×800), Tablet (820×1180), and Mobile (390×844) with zero horizontal overflow.
- [ ] Placement mutations (create cooler/shelf, drag/drop placement) — **DEFERRED** (write test, pending D4).

---

## All Authorized Branches

- [x] Local verification: Distinct branch quantities, unauthorized exclusion, read-only aggregation verified in local real-JWT and pgTAP suites.
- [ ] Hosted DEV verification: **DEFERRED** (requires multi-branch test actor and harness location configuration under D3).

---

## Negative Security & Data Preservation

- [x] Actor permissions: Authenticated location manager/owner authority required; client cannot hard-delete configuration rows.
- [x] Module visibility follows configuration: unconfigured modules remain hidden.
- [x] Post-state equals approved pre-state across all 10 tables (100% preservation; zero stock changes).
- [ ] Owner final sign-off to close Issue #253 — **PENDING OWNER ACCEPTANCE**.
