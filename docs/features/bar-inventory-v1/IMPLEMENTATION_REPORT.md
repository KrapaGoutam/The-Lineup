# Bar Inventory V1 — Implementation report

Running record of what each phase delivered, with evidence. Newest phase last. Safety ledger is repeated in every phase.

```
development merged: see each phase
main merged: NO
DEV touched: see each phase
PROD touched: NO
PROD migrations: NO
```

---

## BI-0 — Decisions, XLSX library review, vectors, test matrix (docs + fixtures only)

Branch `feature/bar-inventory-bi0-foundation` → PR into `development`. **No application code, no migration, no dependency change.**

### Delivered

| Item                                       | Where                                                                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner decisions D1–D8 locked + spec deltas | `PRD.md` §10 (+ consequences), `DATA_MODEL.md` (units, read-time warning fallback), `ANALYTICS_SPEC.md` (D3 terminology), `SECURITY_AND_ROLES.md` |
| **D6 XLSX library decision with evidence** | `IMPORT_EXPORT_SPEC.md` §1                                                                                                                        |
| Golden vectors (status, keys, analytics)   | `tests/fixtures/bar-inventory/*.json`                                                                                                             |
| Vector integrity tests                     | `src/features/bar-inventory/domain/golden-vectors.test.ts` (99 tests; independent integer-cent / plain-string oracle)                             |
| Test matrix                                | `TEST_MATRIX.md` (107 scenarios mapped to layers, ACs and phases)                                                                                 |

### D6 — dependency review evidence (2026-10-26)

Scratch installs outside the repository, Node 24.18.1, npm 11.16.0.

| Check                                               | Result                                                                                                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `read-excel-file@9.3.12` + `write-excel-file@4.1.1` | 9 packages total (`fflate`, `saxen`, `unzipper-esm`, `graceful-fs`, `node-int64`, `worker-f` + the two), **`npm audit`: 0 vulnerabilities**, MIT                                |
| `exceljs@4.4.0`                                     | 194 packages, `npm audit`: 2 moderate (`uuid`), 21.8 MB unpacked — rejected                                                                                                     |
| `xlsx@0.18.5` (npm SheetJS)                         | `npm audit`: **1 high** (prototype pollution GHSA-4r6h-8v6p-xvw6, ReDoS GHSA-5pgg-2g8v-p4x9) — rejected                                                                         |
| Round trip                                          | Written `[Vendor, Name, 4, -2, 0]` / `[…, 3.5, null, null]` read back identically; `=cmd\|' /C calc'!A0` survives as text; blank → `null`, `0` → `0`                            |
| Formulas                                            | cached `=1+1` → `2`; **formula without a cached value → `null` (indistinguishable from blank)** → our guard must flag it (specified for BI-8)                                   |
| Multi-sheet                                         | default export returns `[{ sheet: "Bar List", data }, { sheet: "Old counts", data }]` → sheet picker is possible                                                                |
| Corrupt input                                       | truncated zip → `InvalidInputError "Couldn't unzip"`; text renamed `.xlsx` → `InvalidInputError "Doesn't look like an .xlsx"`                                                   |
| **Zip bomb, library alone**                         | 150 MB-uncompressed entry (0.15 MB compressed) inflated fully: **~509 MB RSS** before the library rejected the (incomplete) workbook → unsafe without a guard                   |
| **Zip bomb, our guard**                             | `fflate` `Unzip` bounded streaming inflate: 400 MB bomb (0.39 MB compressed) rejected as `entry_too_large` in **~304 ms, ~185 MB RSS**; header-declared sizes are never trusted |
| Macro workbook                                      | `xl/vbaProject.bin` entry detected by the guard (`macro: true`)                                                                                                                 |

Not evaluated (and not claimed): `exceljs` / `xlsx` zip-bomb behaviour, their formula semantics. They were rejected on audit results and footprint alone.

Decision: **`read-excel-file@9.3.12` + `write-excel-file@4.1.1`, exact pins, server-only, behind the bounded guard; `fflate@0.8.3` as a direct pin.** Installed in BI-8, so BI-0 changes no `package.json`/lockfile. Accepted risk: single-maintainer packages with API churn across majors → thin adapters + exact pins + adapter test suite as the upgrade gate. Fallback: CSV-only.

### Decisions beyond D1–D8 made in BI-0 (flagged for the owner, easy to reverse)

1. **No CSV dependency** — a small RFC 4180 parser/writer in `src/lib/csv` (caps, BOM, delimiter sniffing). Revisit `papaparse` if it exceeds ~150 lines.
2. **Warning fallback is computed at read time**, never stored on the row.
3. **Cent arithmetic everywhere** (`numeric(13,2)` in SQL; integer cents in TypeScript) — the `0.1 + 0.2` vector proves a naïve float implementation fails a boundary.
4. **Phase naming for this cycle:** the plan's _BI-11 = Release_ is **not in scope** (no `development → main` without separate owner authorization and the #111/#113 gate). In this cycle **BI-11 is the final integration gate** (full suite once, release-readiness input), per the owner's execution brief.
5. **"Include count variance as usage" toggle renamed "Include observed depletion"** (D3 terminology), default on.

### Gates

| Gate                                | Result                         |
| ----------------------------------- | ------------------------------ |
| Vitest (new file)                   | 99/99                          |
| Full `npm run check` / `vitest run` | recorded in the PR (see below) |

### Safety

```
development merged: see PR
main merged: NO
DEV touched: NO
PROD touched: NO
PROD migrations: NO
```
