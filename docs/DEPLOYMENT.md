# Free-Tier Deployment Runbook

## Intended use

This build is sized for a personal hobby pilot: one Next.js application on Vercel Hobby and one Supabase Free project. Keep an eye on database size, monthly active users, Realtime messages, function usage, and Vercel bandwidth/build quotas. Upgrade before the restaurant depends on availability guarantees or uses the app commercially.

## 1. Create Supabase project

1. Create a Supabase Free project near the expected users.
2. In the SQL editor or CLI, apply migrations in `supabase/migrations/` in timestamp order.
3. Copy the project URL, publishable key, and server-only secret key.
4. Create a cryptographically random `APP_PIN_PEPPER` of at least 32 characters.
5. Create the first owner Auth user, profile, organization, membership, location, and passcode credential from a trusted server/admin workflow.

The credential locator is:

```text
HMAC-SHA256(APP_PIN_PEPPER, organization_id + ":" + passcode)
```

Use the same numeric passcode as the synthetic Supabase Auth user's password. Never insert the raw passcode in `passcode_credentials`, logs, source control, or analytics.

## 2. Configure local production mode

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

## 3. Create and push GitHub repository

This package contains a local Git repository. If no remote is configured:

```bash
gh repo create serviceflow-restaurant-operations --private --source=. --remote=origin --push
```

Or create the private repository in GitHub, then:

```bash
git remote add origin <your-repository-url>
git push -u origin main
```

Install CodeRabbit only if desired; `.coderabbit.yaml` is already checked in. Human review remains required for authentication, RLS, and money calculations.

## 4. Import into Vercel Hobby

1. Import the GitHub repository in Vercel.
2. Keep Framework Preset as Next.js and Build Command as `npm run build`.
3. Add every environment variable above to Production and Preview.
4. Do not expose `SUPABASE_SECRET_KEY` or `APP_PIN_PEPPER` to the browser.
5. Deploy, then smoke-test manager and server passcodes through `/r/<restaurant-slug>`.

GitHub Actions runs code checks. Vercel creates previews for branches/PRs and deploys `main` after the repository's branch protections pass.

## 5. Production readiness checks

- Disable demo mode.
- Use unique 6–8 digit passcodes and rotate any exposed code immediately.
- Confirm RLS with two organizations and cross-tenant denial tests.
- Run Supabase security/performance advisors.
- Configure backups appropriate to business risk; Free is not a substitute for a recovery plan.
- Confirm opening/closing time and IANA time zone per location.
- Make one test tip pool whose allocation sum equals its interval sum.
- Record who can approve access requests and reset passcodes.
