# Bar Inventory V1 — Import / export specification

Planning only. Findings from the repo audit that shape this spec: there is **no XLSX library and no robust CSV parser** in the project (Feature 008's `parse-schedule-csv.ts` is a hand-rolled line parser: no multi-line quoted cells, no BOM stripping, no delimiter handling, schedule-specific validation, 500-row cap); the only CSV export helpers (`csvField`, `downloadCsv` with a UTF-8 BOM) are private to `payroll-workspace.tsx` and have **no formula-injection protection**. Bar Inventory therefore lifts and hardens these into `src/lib/csv/` and adds XLSX under an explicit dependency decision (D6).

## 1. Formats

| Format | Read (import)                                                                                                                          | Write (export)                                                           |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| CSV    | Robust parser (RFC 4180: quoted fields, doubled quotes, embedded newlines, BOM strip, delimiter sniff `,` `;` tab, UTF-8 / UTF-16 BOM) | UTF-8 **with BOM** (Excel-friendly), CRLF                                |
| XLSX   | Sheet list → **sheet selection** when > 1 sheet; first non-empty row = header; cached cell values only                                 | One sheet per export; **one sheet per vendor** for order recommendations |

Excel users never need to convert to CSV. Rejected: `.xls`, `.xlsm`, `.xlsb` (legacy / macro formats) with a clear message ("Save as .xlsx or .csv").

### XLSX library — DECISION D6 (made in BI-0, 2026-10-26)

**Chosen: `read-excel-file@9.3.12` (import) + `write-excel-file@4.1.1` (export), both MIT, installed with exact pins in BI-8 (not before), imported only from server code (`read-excel-file/node`, `write-excel-file/node`), behind our own bounded pre-flight guard (below). `fflate@0.8.3` is declared as a direct pinned dependency because the guard imports it (both libraries already depend on it).**

Review evidence (scratch installs on Node 24.18.1, `npm audit` run 2026-10-26; probe scripts and results recorded in `IMPLEMENTATION_REPORT.md` BI-0):

| Criterion           | `read-excel-file` + `write-excel-file`                                                                                           | `exceljs@4.4.0`                                                                        | `xlsx@0.18.5` (npm SheetJS CE)                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --- |
| License             | MIT / MIT                                                                                                                        | MIT                                                                                    | Apache-2.0                                                                                                          |
| Installed packages  | **9** (8.1 MB on disk)                                                                                                           | **194** (21.8 MB unpacked package)                                                     | not counted                                                                                                         |
| `npm audit`         | **0 vulnerabilities**                                                                                                            | 2 moderate (`uuid` bounds check)                                                       | **1 high** (prototype pollution GHSA-4r6h-8v6p-xvw6 + ReDoS GHSA-5pgg-2g8v-p4x9); registry copy abandoned at 0.18.5 |
| Maintenance         | read 157 releases since 2018, latest 2026-10-07; write 105 releases, latest 2026-06-08                                           | latest 4.4.0 (registry last modified 2024-12); legacy deps (archiver 5, unzipper 0.10) | latest on npm is 0.18.5; patched builds are distributed from the vendor CDN, not npm                                |
| Read + write        | separate packages (read / write)                                                                                                 | both                                                                                   | both                                                                                                                |
| Runtime             | Node ≥ 18, ESM + CJS, `sideEffects: false`                                                                                       | not evaluated                                                                          | not evaluated                                                                                                       |
| Sheet list          | default export returns **all sheets with names** (`[{sheet, data}]`) → sheet picker                                              | not evaluated                                                                          | not evaluated                                                                                                       |
| Formulas            | reads the **cached value** (verified: `=1+1` cached 2 → 2); a formula with **no** cached value returns `null` (blank!)           | not evaluated                                                                          | not evaluated                                                                                                       |
| Blank vs zero       | blank cell → `null`, `0` → `0` (verified; needed for D4)                                                                         | not evaluated                                                                          | not evaluated                                                                                                       |
| Round trip          | exported numbers (incl. `-2`, `0`, `3.5`) and a `=cmd                                                                            | …` text cell read back unchanged                                                       | —                                                                                                                   | —   |
| Corrupt / truncated | `InvalidInputError` ("Doesn't look like an `.xlsx`", "Couldn't unzip")                                                           | not evaluated                                                                          | not evaluated                                                                                                       |
| Zip-bomb behaviour  | **unsafe alone**: inflates whole XML entries into memory with only a filename filter (150 MB entry → ~509 MB RSS before failing) | not evaluated                                                                          | not evaluated                                                                                                       |

**Rejected:** `xlsx@0.18.5` (confirmed high-severity advisories on the registry copy; the patched build is distributed only from a vendor CDN tarball, which we will not vendor); `exceljs` (194 transitive packages and a 21 MB footprint for a feature that needs a flat sheet, plus two advisories); a hand-written OOXML parser (more attack surface than a maintained, audited-by-use library).

**Risk accepted:** both packages have a single maintainer and have changed their public API across majors (read-excel-file 6 → 7 → 8 → 9). Mitigations: exact pins (no caret), all calls wrapped by two thin adapters (`src/lib/xlsx/read.ts`, `write.ts`) so an API change or a replacement touches two files, and the adapter test suite (import/export vectors below) is the upgrade gate. Fallback if the library is ever withdrawn: CSV-only with a clear "Save as CSV" message (documented in the risk register).

**Mandatory pre-flight guard (ours, built and fully tested in BI-8; the bounded-inflate core, corrupt-zip and macro detection were prototyped and measured in BI-0).** The library is never handed an unvalidated buffer. The guard performs a **bounded streaming inflate with `fflate`'s `Unzip`**, counting real decompressed bytes (never the declared sizes in the zip header, which an attacker controls) and aborts as soon as a cap is exceeded:

| Check                                 | Limit / result                                                                                                                                                                                                   |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compressed upload size                | ≤ 5 MB (checked before reading the body into memory)                                                                                                                                                             |
| Entry count                           | ≤ 200 (`too_many_entries`)                                                                                                                                                                                       |
| Decompressed size per entry / archive | ≤ 30 MB / ≤ 50 MB (`entry_too_large` / `archive_too_large`)                                                                                                                                                      |
| Corrupt or truncated zip              | `corrupt` → "This file isn't a valid .xlsx"                                                                                                                                                                      |
| Not an OOXML workbook                 | must contain `[Content_Types].xml` and `xl/workbook.xml` → else `not_xlsx`                                                                                                                                       |
| Macros / legacy                       | any `vbaProject.bin` entry or a macro-enabled content type → `macro_enabled`; `.xls/.xlsm/.xlsb` rejected by extension **and** magic bytes                                                                       |
| External links / embedded objects     | ignored (never followed); a count is surfaced as a file warning                                                                                                                                                  |
| Formula without a cached value        | the guard scans `<f>` cells while streaming sheet XML; a formula cell with no `<v>` is reported as an **Error cell** (the library alone would silently return a blank, which D4 would read as "leave unchanged") |
| Sheet count                           | ≤ 5 listed; the sheet picker shows names and row counts                                                                                                                                                          |
| Rows / cells                          | ≤ 5,000 data rows, ≤ 40 columns; cell text ≤ 200 chars (Notes ≤ 500)                                                                                                                                             |

BI-0 prototype results (Node 24, `fflate` 0.8.3): a 400 MB-uncompressed / 0.39 MB-compressed bomb is rejected by the guard in **~300 ms at ~185 MB RSS**; the same class of file passed straight to the library inflated 150 MB (~509 MB RSS) before failing; a truncated zip → `corrupt`; plain text renamed `.xlsx` → rejected by the library (`InvalidInputError`); a `vbaProject.bin` entry is detected; a two-sheet workbook lists both sheet names. These cases become permanent unit vectors in BI-8 (`tests/fixtures/bar-inventory/` zip builders generate the hostile files at test time; no hostile binary is committed).

### CSV parser/writer decision

No CSV dependency is added. A small RFC 4180 state-machine parser and a writer live in `src/lib/csv` (BI-8): quoted fields, doubled quotes, embedded newlines, UTF-8/UTF-16 BOM, delimiter sniffing (`,` `;` tab), hard caps (5 MB, 5,000 rows, 40 columns, 200-char cells), and the formula-injection neutralizer shared with the XLSX writer. Revisit (papaparse, MIT, zero dependencies) only if the parser grows beyond ~150 lines or fails a vector.

## 2. Template and columns

Recommended template (download from Manage → Import):

`Vendor, Name, Category, Subcategory, Size, Unit, SKU, On Hand, Backup, Cutoff Limit, Warning Level, Par Level, Notes`

**Required minimum:** `Vendor, Name, On Hand, Backup, Cutoff Limit`. Category and Subcategory remain optional; a blank Category/Subcategory never invalidates a row. `Unit` defaults to `bottle` if blank on **create** (shown in the preview as an assumed value; owner may prefer required).

Header matching: case-insensitive, trimmed, with aliases (`Qty` → On Hand, `Cut off`/`Min` → Cutoff Limit, `Warn` → Warning Level, `Par`/`Target` → Par Level, `Item`/`Product` → Name, `Item Code`/`UPC` → SKU …). A **column-mapping step** shows the auto-mapping and lets the manager fix it; unmapped optional columns are ignored with a notice; unmapped required columns block the import.

## 3. The flow (never mutate on upload)

```
1 Upload  →  2 Sheet (xlsx, if > 1)  →  3 Map columns  →  4 Preview & validate
          →  5 Confirm (entities to create, rows to skip)  →  6 Import  →  7 Result + error report
```

- **Parse is server-side** (bounded route/server action), result staged via `inventory_import_stage` (`DATA_MODEL.md` §2). Nothing in stock, products or vendors changes until step 6.
- Step 6 calls `inventory_import_commit(batch_id)`: atomic, server-staged plan (the manager commits exactly what was reviewed), per-row `expected_stock_version` conflict detection.
- Cancel at any step discards the staged batch; staged batches also expire after 24 h.

## 4. Preview classification (per row)

| Class      | Meaning                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| **Create** | No catalog match → new product (+ stock row at this location)                                                 |
| **Update** | Matched an existing product → stock/threshold/metadata changes shown                                          |
| **Skip**   | Nothing would change, or the manager unticked the row                                                         |
| **Error**  | Row cannot be imported (reason shown); blocks nothing else — manager chooses "import valid rows, skip errors" |

Counts header: `Create 12 · Update 183 · Skip 9 · Error 4 · New vendors 1 · New categories 2`.

### Update rows show a diff, never a silent overwrite

```
Tito's Handmade 750 mL         Update (matched by identity)
  On hand   current 6   import 4   → −2
  Backup    current 3   import 8   → +5
  Cutoff    current 4   import 4   (no change)
  Status    Low → Healthy
```

A confirmed import writes one **adjustment per changed product** (`source = bulk_import`, `import_batch_id`, `reason` = the batch-level reason, default **Stock Count**; selectable **Delivery / Restock** for a "received" sheet), and a change-log row for threshold/metadata edits. **Blank cell on update = leave unchanged** (D4); `0` means zero.

## 5. Matching and normalization

- **Identity** (owner brief): `(location) + vendor + product name + size + unit`. Implemented as the catalog key `(organization, vendor, name_key, size_key, unit_key)` plus the location's stock row. Name alone is **never** a key: _Tito's 750 mL_ and _Tito's 1.75 L_ are separate products.
- **SKU** present and matching an existing product's `sku_key` → **stronger match**. If SKU matches but the identity key differs (renamed product) the row is a flagged **Update (matched by SKU — name/size changed)** needing the manager's tick. SKU present but matching nothing → create with that SKU. A SKU that collides with a _different_ identity inside the same file → **Error** on both rows.
- **Vendor matching:** `trim` + collapse spaces + the vendor key (letters/digits only, lowercase): _Del Papa / DelPapa / del papa / DEL PAPA_ all match the existing vendor. Matched → shows the existing vendor. No match → badge **NEW VENDOR — will be created**, one line per new vendor in the confirmation step. Near-misses (edit distance ≤ 2, e.g. _Fuast_ vs _Faust_) show **"Did you mean Faust?"** and require an explicit choice per vendor name: map to existing, or create new. Vendors are never created silently and never with a malformed duplicate name; the created display name is the first-seen trimmed spelling, editable in the confirmation step.
- **Category / Subcategory** follow the same rules (**New Category**, **New Subcategory** badges, user may approve or leave blank). A Subcategory with no Category in the row is an **Error** ("Subcategory needs a Category").
- **In-file duplicates** (same identity twice) → **Error** on the later row(s) naming the first.
- **Size / unit** are normalized for matching only (`750 mL`/`750ml`); no conversion between units.

## 6. Validation and file-safety limits

| Rule                | Limit / behaviour                                                                                                                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File size           | ≤ 5 MB (CSV and XLSX)                                                                                                                                                                                                       |
| Rows                | ≤ 5,000 data rows (hard error above; Feature 008's 500 is too small for a bar catalog)                                                                                                                                      |
| XLSX safety         | ≤ 5 sheets listed; uncompressed size and entry count capped (zip-bomb guard); macros/external links ignored; **formulas are never evaluated** — the cached value is read, a formula without a cached value is an Error cell |
| Cell length         | ≤ 200 chars (Notes ≤ 500); control characters stripped                                                                                                                                                                      |
| Numbers             | ≥ 0, ≤ 2 decimals, `1,200`/`1.200,5` thousand separators rejected with a clear message rather than guessed                                                                                                                  |
| Cutoff ≤ Warning    | else row Error "Warning level must be ≥ Cutoff"                                                                                                                                                                             |
| Par below Cutoff    | **warning** (row still importable) "Par is below the cutoff"                                                                                                                                                                |
| Vendor / Name blank | Error                                                                                                                                                                                                                       |
| Encoding            | UTF-8 / UTF-16 with BOM; otherwise decode UTF-8 and flag replacement characters as a file warning                                                                                                                           |

Error report (CSV download): `Row, Column, Problem, Original value`.

## 7. Import batch history

Every batch (staged, committed, cancelled, failed) is listed under Manage → Import / Export → **History**: filename, format, sheet, actor, time, row count, created/updated items, created vendors/categories/subcategories, errors, status. Opening a batch shows its rows (action, raw values, resolved diff) read-only; committed batches link to the resulting adjustments (`import_batch_id`). Batch rows retain raw cell values (no uploaded file is kept).

## 8. Export

| Export                           | Content                                                                                                            | Formats                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Current inventory                | all columns of the Inventory table                                                                                 | CSV, XLSX                                                        |
| **Filtered inventory**           | exactly the rows matching the on-screen filters/sort (button reads "Export 37 filtered rows" next to "Export all") | CSV, XLSX                                                        |
| Item / inventory history         | ledger rows with the history filters applied                                                                       | CSV, XLSX                                                        |
| **Vendor order recommendations** | per vendor: item, current total, cutoff, par, suggested qty / "Order needed"                                       | CSV (flat, vendor column), XLSX (one sheet per vendor + summary) |
| Analytics data                   | the table behind the current analytics view                                                                        | CSV, XLSX                                                        |

- Numbers are written as numbers (XLSX numeric cells; CSV plain decimals, `.` separator), dates ISO-8601 plus a local-time column. Export filename: `bar-inventory_<location>_<export>_<yyyy-mm-dd>.csv|xlsx`.
- **Filtered export is re-executed on the server** from the filter spec (same pure filter module the client uses, run in the export handler over RLS-authorized rows). The client never uploads rows; management-only; each export writes a lightweight `inventory_change_log` entry (actor, export type, filter spec, row count).
- **Formula-injection protection (mandatory, unit-tested):** in CSV **and** XLSX text cells, a value starting with `=`, `+`, `-`, `@`, tab or CR is prefixed with a single quote (`'`) (XLSX: stored as an explicit string cell). Numeric cells (including negative numbers) are never altered. Applies to Name, Vendor, Notes, SKU, Category, user names, reasons and notes.
- Large exports stream; the UI shows progress and a download link; no row cap below 5,000.

## 9. Test vectors (`TEST_STRATEGY.md`)

Header alias mapping; quoted newline cell; BOM; `;` delimiter; `=cmd|' /C calc'!A0` in Name exported as `'=cmd…`; `-2` numeric stays `-2`; `Tito's 750 mL` vs `Tito's 1.75 L`; `Del Papa`/`DelPapa`/`DEL PAPA` → one vendor; `Fuast` → "Did you mean Faust?"; SKU rename flagged; blank On Hand on update = unchanged; `0` = zero; two sheets → sheet picker; `.xlsm` rejected; 5,001 rows rejected; a stock row changed after preview → `conflict`, others commit.
