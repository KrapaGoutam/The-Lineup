# Canonical Numeric Table Input Resolution (#157)

Branch `fix/table-input-canonical-resolution` → `development` (merge commit). Never `main`, never PROD.

## Why

#153 (PR #156) deliberately kept the Grid entry `1` and the registered physical table `T1` as different identities. Owner Preview testing then clarified the operational contract: **typing `1` where `T1` exists is `T1`**, exactly like choosing `T1` from Floor or Picker. This is a new product-contract correction, not a reopening of the passed PR #135 smoke.

Central invariant: _user input may be shorthand; persisted/current business identity must be canonical._ If `1` resolves to registered `T1`, every downstream path operates on `T1` and its `dining_table_id`; no separate free-text `1` identity is ever created.

## Non-goals

No alias table, no history rewrite, no RLS widening, no Tasks (#154) or Tips (#155) work, no PROD change, no new midnight/service-day rules, no mobile redesign.

## R1 audit (answers)

| Question                          | Answer                                                                                                                                                                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where does Grid create labels?    | `TableEntry.onSubmit` in `allocation-workspace.tsx` → `claim.intercept({label})` → `execute({type:"assign", tableLabel})`. Picker/Floor/Servers call `pickTable` / `claim.intercept` with registered labels.                                                                    |
| Where does `board_assign` get it? | `executeBoardActionRemote` (`allocation-actions.ts`) → RPC `board_assign(p_table_label)`; `board_end_and_assign(p_table_label)` is the second text entry point (Floor decision dialog).                                                                                         |
| Where does `label_parts` operate? | `20261026090000`: textual split on `+`/trim only; used for same-server, held and displacement checks by exact text.                                                                                                                                                             |
| Where does occupancy resolve?     | `private.sync_table_occupancy()` (latest in `20261023110000`): per part, exact `dining_tables.label = part` (location, active). Free text takes no claim.                                                                                                                       |
| Free text intentionally kept?     | Any label with no exact/shorthand registered match (`Patio A`, `99` without T99): stored as typed, no ledger claim, shown off-map.                                                                                                                                              |
| Combined labels parsed?           | DB `private.label_parts`; TS `parseCombinedTableLabel` (`floor-layout.ts`); canonical join is `" + "`.                                                                                                                                                                          |
| UI that displays off-map?         | Grid badge (`isOffMap`), Floor/Picker `off-map-tables.tsx`, Servers chips, Dashboard `unmappedActiveLabels`.                                                                                                                                                                    |
| Old-contract tests?               | pgTAP `0030` §3 and the `label_parts` "different labels" assertion; `XM-011` in `cross-view-scenarios.ts`; `cross-view-integrity.test.ts` + `.test.tsx` "`1` is not `T1`"; Playwright extras / hosted suites that type `1`. Each is changed deliberately, see `TEST_MATRIX.md`. |

## Resolver contract (`private.resolve_table_input(location, text)`)

1. **Exact registered label wins** (trimmed, case-sensitive, active, same location). `T1`→`T1`; a table genuinely registered as `1` stays `1`.
2. **Digits-only** input and no exact match → `T` + the literal digit string if that active table exists at the same location (`1`→`T1`, `19`→`T19`).
3. **Leading zeros are not collapsed.** `01` → exact `01`, else `T01`, else free text `01`. Never `T1`.
4. **Free text** otherwise: the trimmed text, `registered = false`, `dining_table_id = null` (`Patio A`, `99` without `T99`).
5. Returns `(input_text, canonical_label, dining_table_id, registered)`. Same location only — never across locations or organizations.
6. Combined labels: `private.canonical_label_parts` / `canonical_table_label` resolve every part independently (`1 + 2`→`T1 + T2`, `1 + Patio A`→`T1 + Patio A`), first-seen order, duplicates collapsed.

## Server changes (migration `20261026120000_table_input_canonical_resolution.sql`, forward-only)

- ONE resolver; reused by `board_assign`, `board_end_and_assign`, `displace_conflicting_entries` and the occupancy trigger (no second implementation to drift).
- `board_assign` canonicalizes before same-server, held-conflict, End + Assign, insert, event and occupancy. Conflict details (`label`, `assignment_label`) are canonical, so a stale client typing `1` gets the same PT409 as one typing `T1`.
- Conflict comparison is canonical on **both** sides, so a legacy active free-text `1` and a new `T1` can never both hold the table.
- `board_end_and_assign` stores the canonical label.
- Security: helpers are private, `SECURITY DEFINER`, `search_path = ''`, revoked from `public, anon, authenticated`. No grant or policy widened; `auth.uid()`, active membership, tenant/session validation unchanged.

## Client changes

- `domain/table-input.ts`: pure mirror of the resolver (`canonicalizeTableInput`) used by the demo reducer path and for the instant dialog. **The database stays authoritative**: the client mirror only improves latency and demo mode; a stale or different client is still corrected by PT409.
- Workspace `execute` and `claim.intercept` canonicalize before classify / optimistic apply, so Grid shows `T1` (registered presentation) immediately and the dialog names `T1`.
- Read model / Floor / Picker / Servers / Dashboard need no new logic: they already render canonical stored labels exactly.

## Existing data

History is **not** rewritten. A past free-text `1` stays text. A currently active free-text `1` resolves to `T1` the next time it is written (undo/redo, transfer) and is compared canonically with new claims.

**Release-readiness query (read-only; run per real location before deploying — NOT run against PROD in this feature):**

```sql
select l.name as location, ss.service_date, e.id as entry_id, e.table_label, trim(p.part) as part
from public.table_rotation_entries e
join public.service_sessions ss on ss.id = e.service_session_id
join public.locations l on l.id = ss.location_id
cross join lateral unnest(string_to_array(e.table_label, '+')) as p(part)
where e.status = 'active'
  and ss.status = 'active'
  and trim(p.part) ~ '^[0-9]+$'
  and not exists (select 1 from public.dining_tables d where d.location_id = ss.location_id and d.active and d.label = trim(p.part))
  and exists     (select 1 from public.dining_tables d where d.location_id = ss.location_id and d.active and d.label = 'T' || trim(p.part))
order by 1, 2, 3;
```

Any row is an active free-text numeric label that will now resolve to a physical table. Resolve by ending/re-entering through the app before the release.

## Rollout / rollback

DEV migration via the Management API (`opmujepkemwcdxxorhfd` only) + a `schema_migrations` row. Rollback = forward migration restoring the 20261026090000 function bodies (no destructive down). PROD: not touched; applies later with the normal `main` release.

## Test plan

See `TEST_MATRIX.md`. pgTAP `0031`, unit `table-input.test.ts`, the shared scenario matrix gains an **input-form axis** (canonical / shorthand / free-text), hosted DEV real-mode suites, multi-user stale-client suite.

## Decisions / open

None blocking. Decision recorded: client mirror exists only for latency/demo; server is the authority.

## Codex build prompt

Implement only what this plan and `ACCEPTANCE_CRITERIA.md` describe on `fix/table-input-canonical-resolution`. Do not add an alias table, rewrite history, widen RLS, or touch Tasks/Tips. Keep ONE resolver in the database. Run the repository quality gate (`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npx supabase test db`, demo Playwright) before handing back.
