# Infrastructure — DEV Preview & CI Reliability

**Tracking:** parent issue #133 · milestone "Platform / CI Reliability" · Project #4 · branch `infra/dev-preview-ci-reliability` (from `development` @ `ead4e8b`).
**Status:** see `IMPLEMENTATION_REPORT.md` (kept current per sub-feature).
**Refs:** DEV `opmujepkemwcdxxorhfd` · PROD `ftadewtkjlaotfdvtjcv`. PROD is never touched by this feature.

## Outcome

```text
Local dev      -> Supabase DEV
Vercel Preview -> Supabase DEV   (was: demo mode, no database)
Vercel Dev     -> Supabase DEV   (was: nothing configured)
Vercel Prod    -> Supabase PROD  (unchanged)
```

Database CI starts the local Supabase stack reliably despite public-registry pull limits, with no weakening of the validation (35 migrations from scratch, pgTAP).

Non-goals: Tasks V1; Table Rotation changes; any PROD change; running the hosted real-mode suites in CI (still developer-run evidence); fixing #111–#114 (production auth / release skew).

## Audit findings (read-only, 2026-10-24)

- Vercel project `onepiece11/the-lineup` (matches `.vercel/project.json`).
- Production-only: `NEON_DATABASE_URL`, `APP_PIN_PEPPER`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_RESTAURANT_SLUG`, `NEXT_PUBLIC_DEMO_MODE`.
- Preview: only `NEXT_PUBLIC_DEMO_MODE`. Development: nothing.
- Demo mode (`src/lib/page-data.ts`, `src/lib/supabase/proxy.ts`): `NEXT_PUBLIC_DEMO_MODE === "true"` **or** missing Supabase URL/key. Preview was a demo by absence of variables plus an explicit `true`.
- Server login/admin paths need `SUPABASE_SECRET_KEY` (`src/lib/supabase/admin.ts`) and `APP_PIN_PEPPER` (`src/lib/passcode-security.ts`); a real-mode Preview therefore needs both, DEV-valued.
- `NEON_DATABASE_URL` is read lazily at request time; absent in Preview == blank. DEV's local value equals PROD's, so it must never be copied to a non-production scope.
- Database CI (`.github/workflows/database.yml`): `supabase start -x <9 services>` then `db:reset`, `db:test`. Failure = image pull from `public.ecr.aws` (`toomanyrequests: Data limit exceeded`): anonymous pulls from shared runner IPs.

## Decisions

### INFRA-A

1. Preview and Development get DEV values for the four runtime variables plus the DEV restaurant slug. `NEON_DATABASE_URL` stays **absent** (Vercel rejects empty values; absent == blank for the lazy reader).
2. **Demo mode:** Preview `NEXT_PUBLIC_DEMO_MODE` becomes `false` so Preview exercises the real DEV backend. Demo e2e still runs in CI on its own server (`playwright.config.ts` forces `true`), so demo coverage is not lost.
3. Secret values flow only file -> stdin -> `vercel env add`; never argv, logs, docs, or commits. Secrets are `--sensitive` in Preview; Development cannot hold sensitive variables (Vercel rule) so it carries the DEV values as ordinary encrypted variables.
4. Production-scoped entries are never edited; a before/after metadata snapshot (names, targets, created-at) proves it.
5. Targets are verified from `vercel env ls` before each mutation; ambiguity stops the work.

### INFRA-B (options reviewed)

| Option                                                                    | Verdict                                                                                                         |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Authenticate to ECR Public                                                | Needs AWS credentials the project does not have. Rejected.                                                      |
| `docker login`, then `supabase start`                                     | The CLI pulls through the Docker API without the client's stored credentials, so login does not help. Rejected. |
| **Mirror registry** via `SUPABASE_INTERNAL_IMAGE_REGISTRY` (`ghcr.io`)    | Supported by CLI 2.76.8; pinned tags verified present on ghcr.io, docker.io and ECR. **Chosen as primary.**     |
| **Bounded, classified fallback** (ghcr.io -> public.ecr.aws -> docker.io) | Chosen. Only registry/network pull failures move on; SQL, migration, pgTAP and unknown errors fail immediately. |
| `actions/cache` of saved images                                           | Viable but cold on first run and branch-scoped; deferred unless mirrors prove insufficient.                     |
| Fewer services                                                            | Already minimal; unchanged.                                                                                     |

Also: `deploy-migrations` is pinned to `refs/heads/main` so no trigger added for other branches can reach the production job.

### INFRA-C

A pure, unit-tested checker (`scripts/check-nonprod-env.mjs`) fails when a non-production configuration references the PROD ref or a non-DEV Supabase URL. Wired into `npm run check:env`, CI, and reusable against a built `.next`. Existing guards in `tests/real/` are reused, not duplicated.

### INFRA-D

`docs/CI_CD.md`, `docs/DEPLOYMENT.md` (Production vs Preview table), `docs/STATUS.md`, `docs/ROADMAP.md`, `tasks/current-task.md`.

## Rollout / rollback

- Vercel: `vercel env rm <NAME> preview|development` restores the previous state; re-adding Preview `NEXT_PUBLIC_DEMO_MODE=true` restores demo behaviour. Production is unaffected either way.
- CI: revert the workflow/script commit; the old single-attempt `supabase start` returns.
- No database migrations; no application runtime code changes expected.

## Open questions

None blocking.

## Codex build prompt

Not applicable — the user explicitly asked Claude to implement this infrastructure feature.
