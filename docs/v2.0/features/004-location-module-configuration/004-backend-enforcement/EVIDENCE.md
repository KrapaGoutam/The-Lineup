# V2-004.004 — Evidence

Companion to [PLAN.md](PLAN.md). Facts measured during this phase. Nothing here is inferred from a mock where a real leg was possible; where a leg could not run it says so.

## 1. Git

| Item                                        | Value                                                                                                                                  |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Starting local branch                       | `docs/recipes-owner-retest-handoff` (unrelated work, 3 modified tracked files + untracked) — **preserved, untouched**                  |
| `origin/development` before and after fetch | `53ad8397dd8712b70846b13b067d9c3c1ef0c06a`                                                                                             |
| PR #303 included                            | yes — `git merge-base --is-ancestor 53ad839 origin/development` → exit 0                                                               |
| `origin/main`                               | `5e5b7747693b6e81014eafdf299b87e56c3f033d` (unchanged)                                                                                 |
| Worktree                                    | `.tmp/v2-module-backend-enforcement`, branch `feature/v2.0-004.004-backend-module-enforcement`                                         |
| Existing V2-004.004 branch / issue / PR     | none found; issue #304 created                                                                                                         |
| Local-only change not committed             | `supabase/config.toml` ports shifted to `563xx` (JobQuest2.0's local stack owns `54xxx`/`55xxx`); marked `skip-worktree`, never staged |

## 2. Migration

`supabase/migrations/20261106120000_module_backend_enforcement.sql` (next after head `20261105210000`; no timestamp invented).

- Clean replay: `supabase db reset --local` → **74 migrations**, head `20261106120000`.
- Inserts exactly one row (the `staged` switch); **0** module configuration rows (pgTAP 0062 MC-013a still passes).
- Re-declares three helpers verbatim + one `perform private.assert_location_module_enabled(...)` each; creates 1 table, 11 new functions, 1 trigger and 36 restrictive policies.
- Generated types: `supabase gen types typescript --local` + Prettier equals the committed file except the new `module_enforcement_settings` table (+24 lines).

## 3. Test results

| Suite                                                   | Result                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pgTAP, full suite (local stack, clean replay)           | 63 files / 2064 assertions reported; **61 files pass**. `0039` and `0042` hardcode `dblink` port `54322` and abort on the shifted stack (not a regression): re-run with a temporary port-patched copy, **196/196 pass**. Effective: **63/63 files, 2071 assertions, 0 failures** |
| New pgTAP `0063_module_backend_enforcement`             | **59/59**                                                                                                                                                                                                                                                                        |
| Updated pre-existing pgTAP `0062` MC-014c               | passes with an allow-list of exactly the two new readers (92/92)                                                                                                                                                                                                                 |
| Unit (`npm test`)                                       | **238 files, 3222 passed, 7 skipped (pre-existing), 0 failed**                                                                                                                                                                                                                   |
| Real-JWT, disposable local stack (`npm run test:local`) | **15/15**; after cleanup `organizations`, `locations`, `memberships`, `auth.users`, `profiles`, `location_module_configs`, `tasks`, `inventory_vendors` all **0**; switch `staged`                                                                                               |
| `npm run format:check` / `lint` / `typecheck`           | PASS / PASS (`--max-warnings=0`) / PASS                                                                                                                                                                                                                                          |
| `npm run check:local-paths`                             | PASS                                                                                                                                                                                                                                                                             |
| `CI=1 next build --webpack` (cold, blank Supabase env)  | PASS (13 static pages); `check-nonprod-env.mjs --scan .next` PASS                                                                                                                                                                                                                |
| Mutation check                                          | removing the `team` guard from `member-actions.ts` fails `enforcement-denial` (restored)                                                                                                                                                                                         |

## 4. Real-JWT behaviour observed (local stack, real Auth sessions via PostgREST)

- Staged: owner creates a task at a tasks-Missing location (legacy behaviour).
- `UPDATE … SET mode='active'` with an unconfigured location → `55000 "…cannot be activated: N active location(s)…"`; switch stays staged; **0** rows written.
- Owner/server sessions cannot update the switch (`42501`); anonymous cannot read it.
- After a fully reconciled estate, activation succeeds; `activated_at` and the reference are stored.
- `task_create` at a Disabled location → `42501 "This module is turned off for this location."`, **no row**; at an Enabled location → success.
- `inventory_vendor_create` Disabled → `42501`, no vendor; Enabled → success. `dining_areas` / `tip_pools` direct inserts follow the same rule.
- A staged-era task at a Disabled location is no longer returned to the owner's `select` but **still exists** (service-role count = 1): hidden, not deleted.
- Staff session with Enabled module → still `Only an owner, manager…`; foreign-org session → `You do not have access…` (never "turned off").
- Back to `staged` → the Disabled location works again.

## 5. Hosted DEV (`the-lineup-dev`) — read-only

Only one operation touched DEV: `node scripts/module-enforcement-readiness.mjs --env-file .env.development.local --summary` (HTTP GET with the service key; the script refuses the Production ref).

```text
Module enforcement readiness (hosted DEV)
  active locations:            44
  with complete configuration: 0
  missing configuration:       44
  configuration rows read:     0
  RESULT: NOT READY            (exit 1)
```

- No migration applied, no row inserted, no user/org/location created, no persistent identity (`TestOwner`, `TestManager`, `TestServer1/2`, `TestHost`) touched. **Fixture counts before/after: identical (nothing was created).** No cleanup was needed, so none is claimed.
- The hosted real-JWT suite for active mode was **not run**: it requires activating enforcement, which the database gate would refuse (and which must not be forced) while DEV is unreconciled.

## 6. Not performed (and why)

| Item                                                                                 | Reason                                                                                                                                                     |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apply migration to hosted DEV                                                        | Held: no merge decision, and active-mode validation on DEV is impossible. Applying a staged migration is harmless but not required for the evidence above. |
| Synthetic hosted fixtures (Org A/B, Locations A–E)                                   | They exist as local-stack fixtures instead (`0063`, `tests/local`). On DEV they would be inert while staged and un-activatable.                            |
| HTTPS Preview / browser (Chromium, WebKit, mobile, themes) of **active** enforcement | Active enforcement cannot be on in DEV. Staged enforcement is invisible in the UI; V2-004.003's accepted browser evidence is unchanged.                    |
| Hosted-DEV account-reset-with-Team-disabled browser test                             | Not changed by this phase (route exempt, structurally unimportable by the guard).                                                                          |

## 7. CI and delivery

PR [#305](https://github.com/KrapaGoutam/The-Lineup/pull/305) → `development`. CI is verified at each pushed head and never carried over from an older one.

Head `732b509a629cad7b3f6f855c7f8957bc1d7e0c60` (run 42272720555 / 42272720676): `application` PASS (2m46s) · `browser-smoke` PASS (9m01s) · `migrations-and-policies` PASS (3m39s; includes the pgTAP suite at default ports, so `0039`/`0042` pass there) · Vercel Preview deployment PASS · `deploy-migrations` SKIPPED by design (runs on `main` only). Required checks for any later head are recorded on the PR.
