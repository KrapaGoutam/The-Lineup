# Free-Tier Deployment Runbook

## Intended use

This build is sized for a personal hobby pilot: one Next.js application on Vercel Hobby and one Supabase Free project. Keep an eye on database size, monthly active users, Realtime messages, function usage, and Vercel bandwidth/build quotas. Upgrade before the restaurant depends on availability guarantees or uses the app commercially.

## 1. Create and link the Supabase project

1. Create a Supabase Free project (dashboard, or `supabase projects create` if you have a personal access token — see "CLI authentication" below).
2. Link this checkout to it: `supabase link --project-ref <your-project-ref>`.
3. Apply every migration in `supabase/migrations/` in order: `supabase db push`. This is idempotent — re-running it only applies migrations not already recorded against the project (`supabase migration list` shows local vs. remote status).
4. Generate types against the linked project: `npm run db:types` — commits `src/types/database.generated.ts`. On Windows, if the plain `npm run db:types` fails with a path error, it's very likely `src/types/` not existing yet, not the CLI — create the directory and run `node_modules/.bin/supabase gen types typescript --linked > src/types/database.generated.ts` directly.
5. Create a cryptographically random `APP_PIN_PEPPER` of at least 32 characters (e.g. `openssl rand -hex 24`).

### CLI authentication

Both `supabase` and `vercel` CLIs need your account, not just a project reference. Two ways to get there, either is fine:

- Run `supabase login` / `vercel login` yourself, once, in your own terminal — opens a browser OAuth flow.
- Generate a personal access token instead (Supabase: dashboard → Account → Access Tokens; Vercel: Account Settings → Tokens) and export it as `SUPABASE_ACCESS_TOKEN` / use `vercel --token <token>` — works non-interactively, no browser needed, and is what CI uses.

`gh` (GitHub CLI) is a separate, third credential — check `gh auth status` before assuming it needs setup too.

## 2. Bootstrap the first owner

There is no sign-up flow for the very first owner — self-serve registration always creates a `server`-role account, and there's nothing to sign in as yet to promote one. `scripts/bootstrap-owner.mjs` creates exactly one owner, once:

```bash
node scripts/bootstrap-owner.mjs \
  --org "The Monk's" --slug the-monks \
  --location "River Oaks" --timezone America/Chicago \
  --owner-name "Your Name" --yes
```

Reads `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and `APP_PIN_PEPPER` from `.env.local`. Without `--passcode <4 digits>`, it generates one and writes it to a local, gitignored file, `.bootstrap-owner-passcode.local.txt` — never to stdout, a log, or a second env var. Open that file, note the passcode, delete the file.

Drop `--yes` first to dry-run it — it prints exactly what it would create and writes nothing.

**It refuses to run a second time.** It checks `select count(*) from memberships where 'owner' = any(roles)` before creating anything; if any owner membership already exists anywhere in the database, it exits immediately without writing. This isn't a "please don't re-run this" comment — it's a database-state check that can't be bypassed by running the script again, on purpose or by accident. Promote further owners through the app's Team tab (Feature 014) instead.

The credential locator is:

```text
HMAC-SHA256(APP_PIN_PEPPER, organization_id + ":" + passcode)
```

Never insert the raw passcode in `passcode_credentials`, logs, source control, or analytics — the app never does, and neither does the bootstrap script.

## 3. Configure local production mode

```bash
cp .env.example .env.local
```

Set:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SECRET_KEY=...
APP_PIN_PEPPER=at-least-32-random-characters
NEXT_PUBLIC_RESTAURANT_SLUG=the-monks
NEXT_PUBLIC_DEMO_MODE=false
```

Then run `npm run check`, `npm test`, `npm run build`, and `npm run test:e2e`.

`SUPABASE_PROJECT_ID` and `SUPABASE_ACCESS_TOKEN` are **not** app runtime variables — the Next.js app never reads them. They exist only for the CLI/CI to find the right project; see the GitHub Actions section below for where they actually belong.

## 4. GitHub repository and Actions secrets

If no remote is configured yet:

```bash
gh repo create <name> --private --source=. --remote=origin --push
```

The migration-deploy job in `.github/workflows/database.yml` runs on every push to `main` and needs two repository secrets (Settings → Secrets and variables → Actions, or `gh secret set`):

- `SUPABASE_ACCESS_TOKEN` — a personal access token (see "CLI authentication" above).
- `SUPABASE_PROJECT_ID` — the project ref (the same value from the project's dashboard URL).

Until both are set, that job fails loudly on the next push to `main` rather than silently skipping — intentional, so a missing secret is caught immediately rather than discovered when a migration silently never lands. The job runs under a `production` GitHub Environment (auto-created on first use); optionally add required reviewers to it later if you want a manual approval gate before migrations reach the real database.

Install CodeRabbit only if desired; `.coderabbit.yaml` is already checked in. Human review remains required for authentication, RLS, and money calculations.

## 5. Vercel: import, link, and environment variables

1. Import the GitHub repository in Vercel (or `vercel link` from this checkout if the project already exists — it also writes a `VERCEL_OIDC_TOKEN` line into `.env.local`, which is normal and already gitignored).
2. Keep Framework Preset as Next.js and Build Command as `npm run build`.
3. Environment variables — **Production and Preview are deliberately different**, not a copy of each other:

   | Variable                               | Production      | Preview  |
   | -------------------------------------- | --------------- | -------- |
   | `NEXT_PUBLIC_SUPABASE_URL`             | yes             | **no**   |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes             | **no**   |
   | `SUPABASE_SECRET_KEY`                  | yes (Sensitive) | **no**   |
   | `APP_PIN_PEPPER`                       | yes (Sensitive) | **no**   |
   | `NEXT_PUBLIC_RESTAURANT_SLUG`          | yes             | optional |
   | `NEXT_PUBLIC_DEMO_MODE`                | `false`         | `true`   |

   Both entry routes (`/` and `/r/[restaurantSlug]`) already compute demo mode as `NEXT_PUBLIC_DEMO_MODE === "true" || !NEXT_PUBLIC_SUPABASE_URL || !NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — simply never adding the Supabase variables to Preview already forces it into demo mode, with `NEXT_PUBLIC_DEMO_MODE=true` set explicitly there too for clarity. This means a PR's preview deployment is always a fully-functional demo-mode app with zero chance of touching the production database, at zero extra infrastructure cost. `SUPABASE_PROJECT_ID` and `SUPABASE_ACCESS_TOKEN` do not belong in Vercel at all — they're GitHub Actions secrets only (step 4).

   **If a project was set up via Vercel's "import your `.env` file" convenience prompt, check this table against reality** (`vercel env ls`) rather than assuming it — that flow can default to selecting every environment for every variable, which is exactly the split this section exists to prevent. Fixing an existing over-scoped variable: `vercel env rm <NAME> preview` removes the whole entry (there's no partial-target edit), then re-add it with `vercel env add <NAME> production --value "..." [--sensitive]` scoped correctly.

4. Do not expose `SUPABASE_SECRET_KEY` or `APP_PIN_PEPPER` to the browser — neither is `NEXT_PUBLIC_`-prefixed, so Next.js already enforces this; the table above is about which _deploy environment_ sees them, not client/server exposure.
5. Deploy, then run the login verification below against the production URL.

GitHub Actions runs code checks and (on `main`) deploys migrations. Vercel creates previews for branches/PRs and deploys `main` after the repository's branch protections pass.

## 6. Verify: sign in against the real database

1. Open the deployed Production URL at `/r/<your-slug>` (e.g. `/r/the-monks`) — or `/` if `NEXT_PUBLIC_RESTAURANT_SLUG` matches.
2. Enter the owner passcode from `.bootstrap-owner-passcode.local.txt`, click **Open workspace**.
3. Confirm: the header shows the owner's name and role; the Team tab is reachable (owner-only surfaces gate correctly); signing out and back in with a wrong passcode shows the generic "not recognized" error, not a stack trace or a leak of which part was wrong.
4. Delete `.bootstrap-owner-passcode.local.txt` once you've confirmed you can sign in — it's gitignored, but there's no reason to keep it lying around locally either.

## 7. Production readiness checks

- Disable demo mode (done above — confirm it stays disabled in Production, not just locally).
- Passcodes are 4 digits (Feature 006) with a degrading, exemptible organization-wide rate limit — not a hard lockout; see `docs/SECURITY.md`. Rotate any code you suspect is exposed by promoting the person to a fresh one via the Team tab (no passcode-rotation self-service exists yet — flagged as a known gap, not built).
- Confirm RLS with two organizations and cross-tenant denial tests (`npm run db:test`).
- Run Supabase security/performance advisors.
- Configure backups appropriate to business risk; Free is not a substitute for a recovery plan.
- Confirm opening/closing time and IANA time zone per location.
- Make one test tip pool whose allocation sum equals its interval sum.
- Record who can promote/demote a designation (Feature 014) and clear a passcode lockout (Feature 006) — both are owner/manager-only, in-app actions now, not a support ticket.
