# Bar Inventory V1 — Analytics specification

Status: owner decision D3 locked in BI-0 (terminology below is normative). All rules below are testable pure functions (`src/features/bar-inventory/domain/analytics.ts`) fed from the adjustment ledger; the database never stores derived analytics in V1.

## 1. Principle: only the right events count as consumption

The ledger (`inventory_adjustments`) records every quantity change with a **reason**. Analytics classify each row by reason, because `-2 Usage` and `-2 Correction` mean different things.

| Reason             | Direction | Counts as…                                                             | In "depletion" (movement)                               |
| ------------------ | --------- | ---------------------------------------------------------------------- | ------------------------------------------------------- |
| Usage              | −         | **Confirmed Usage**                                                    | **Yes**                                                 |
| Stock Count (−)    | −         | **Observed Depletion** (count variance; never called a confirmed sale) | **Yes by default**, toggle "Include observed depletion" |
| Breakage           | −         | Shrink (loss)                                                          | Separate series; optional include                       |
| Comp               | −         | Shrink (giveaway)                                                      | Separate series; optional include                       |
| Transfer Out       | −         | Moved elsewhere — not consumed                                         | No                                                      |
| Correction (−/+)   | ±         | Data fix                                                               | **Never**                                               |
| Stock Count (+)    | +         | Count gain (found stock) — a variance, not inflow                      | No (shown as variance)                                  |
| Delivery / Restock | +         | Inflow                                                                 | No (counts as restock)                                  |
| Transfer In        | +         | Inflow from elsewhere                                                  | No                                                      |
| Other              | ±         | Unclassified                                                           | No (listed under "Other")                               |

Delta used = the change in **total available** (on hand + backup). A move between on-hand and backup (e.g., −2 on hand, +2 backup) has total delta 0 and is neither depletion nor restock; it is recorded and shown in history but ignored by analytics.

**Rationale for D3 (locked).** Most bars do not log each pour. They count periodically. Without counting a negative count variance as _Observed Depletion_, a bar that only counts weekly would show zero movement. Observed Depletion and Confirmed Usage are always shown as **separate series**; the combined "Movement" series adds them, and the toggle "Include observed depletion" (default on) only changes that combined series. Observed Depletion is never labelled sales or confirmed usage. Correction, Transfer In/Out and Delivery/Restock never count as consumption.

## 2. Windows and data sufficiency

Windows: 7, 14, 30, 90 days (default 30), plus custom date range. All dates are interpreted in the **location's time zone** (service-day boundaries as elsewhere in the product), never the browser's.

`daily_depletion_rate(item, window)` = total depletion in the window ÷ **days in the window** (calendar days, not days with events — zero-movement days are real data).

An item has **enough history** when its window contains ≥ 3 depletion events **and** the item has existed ≥ 14 days. Otherwise every rate-derived metric shows "Not enough history yet" and the item is excluded from rankings that need a rate. No false precision.

## 3. Metrics

| Metric                          | Definition                                                                                                                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fastest-moving                  | Highest `daily_depletion_rate`; within one unit type by default. Global view ranks by **par turns/week** = weekly depletion ÷ par (needs par) so bottles and kegs are comparable |
| Slowest-moving                  | Lowest rate among items with total > 0 and enough history; flagged "possible dead stock" when 0 depletion over 30+ days                                                          |
| Depletion over time             | Daily (≤ 30d) or weekly (> 30d) series of depletion units, per item / vendor / category; reasons stacked when "show reasons" is on                                               |
| Average depletion / day, / week | `daily_depletion_rate`, ×7                                                                                                                                                       |
| Restocked quantity / # restocks | Sum / count of Delivery-Restock (+) rows in the window                                                                                                                           |
| Current total                   | `on_hand + backup`                                                                                                                                                               |
| Items repeatedly hitting cutoff | Count of **cutoff crossings** in the window: ledger rows whose `status_after = critical` and whose previous status was not critical. ≥ 2 crossings in 30 days flags "chronic"    |
| Vendor demand                   | Per vendor: depletion units, suggested order units now, # critical / low items, # restocks                                                                                       |
| Shrink                          | Breakage + Comp totals (and % of depletion), per item/vendor                                                                                                                     |
| Count variance                  | Σ of Stock Count deltas (± shown separately)                                                                                                                                     |

`status_after` and `cutoff_at_time` are stored on each ledger row (see `DATA_MODEL.md`), so a later change of cutoff does not rewrite history and crossings are exact, not recomputed.

## 4. Estimated days to cutoff

```
if cutoff is null                → "No cutoff set"
if total ≤ cutoff                → "At or below cutoff"
if not enough history            → "Not enough history"
rate_fast = max(rate_7d, rate_30d); rate_slow = min(rate_7d, rate_30d)
if rate_fast = 0                 → "No recent movement"
days_low  = (total − cutoff) / rate_fast
days_high = (total − cutoff) / max(rate_slow, ε)
display   = whole days: "4–5 days" (floor(low)–ceil(high)); equal ends → "about 3 days";
            low ≥ 30 → "30+ days"; low < 30 < high → "12–30+ days" (open upper end)
```

Never a decimal. A range reflects that recent and long-run rates differ. The estimate sorts the Dashboard "running out soonest" list; it does **not** change status colours (status is purely stock vs. thresholds).

## 5. Suggested order (recommendation, not a purchase)

For Critical and Low items: `max(0, par − total)`; no par → "Order needed". Vendor roll-up shows item count, critical count, low count and total suggested units (items with "Order needed" are listed but do not add to the sum). An optional **"order to cover N days"** helper (V1.1) = `ceil(rate × N − (total − cutoff))` is documented but not in V1 scope.

## 6. Dashboard analytics placement

- Dashboard: KPI cards; Order Soon by vendor; **Running out soonest** (days-to-cutoff); **Fastest movers** (top 5); small sparkline of depletion per listed item.
- Secondary Analytics sub-view (from Dashboard "See analytics"): full ranking tables with the filters in §7; depletion-over-time chart; vendor demand table; chronic-cutoff list; shrink and count-variance tables.

Charts need SVG primitives (none exist in the repo today — see `UI_UX_PLAN.md` §10). V1 charts: bar (vendor demand, depletion by period), line (depletion over time), sparkline (rows). No pie/donut. Every chart has a data table equivalent for accessibility and export.

## 7. Analytics filters

Vendor, Category, Subcategory, Item, Date range (with the presets above), Movement reason (checkbox set per §1 table), "Include count variance as usage", "Include shrink in depletion", Unit type. Filters are URL-synced and apply to export.

## 8. Test vectors (shared by the SQL-side reference and the TypeScript functions)

| Scenario                                                      | Expectation                                                           |
| ------------------------------------------------------------- | --------------------------------------------------------------------- |
| −2 Usage, −2 Correction                                       | depletion = 2                                                         |
| −3 Stock Count, D3 on / off                                   | depletion 3 / 0                                                       |
| +4 Delivery                                                   | restock 4, depletion 0                                                |
| −2 on hand, +2 backup (same row)                              | total delta 0, ignored                                                |
| 30-day window, 12 units usage, ≥ 3 events, item age 40 d      | 0.4 / day; 2.8 / week                                                 |
| total 20, cutoff 8, rate_7d 1.0, rate_30d 0.5                 | high-rate 12 d, slow-rate 24 d → "12–24 days"                         |
| total 8, cutoff 8                                             | "At or below cutoff"                                                  |
| 2 depletion events                                            | "Not enough history yet"                                              |
| cutoff changed 10 → 6 after a crossing                        | historical crossing still counted at the cutoff recorded at that time |
| item time zone boundary (event 11:30 pm local = next UTC day) | counted on the local service date                                     |

## V1.1 separation of stock movement and freshness

Bulk Count uses existing reasons and source derivation (stock_count -> count,
delivery_restock -> delivery). Each changed product produces one normal ledger
entry; unchanged products produce none. Negative Stock Count remains Observed
Depletion, not a confirmed sale. Date/rule mutations never touch stock or the
quantity ledger. Freshness/expiration Dashboard cards count distinct active
products using their nearest expiration/oldest manufacture and configured rule.
Expiration windows overlap and are labelled; do not sum the cards as unique
products. No dates change stock status, Order Soon or usage analytics. No FIFO,
automatic depletion, Tasks or notifications are introduced.
