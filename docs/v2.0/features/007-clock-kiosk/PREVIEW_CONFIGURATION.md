# V2-007 Preview configuration — November 12, 2026

This focused continuation changes Preview configuration and the kiosk public-key dependency. The earlier implementation review, backup, isolated restoration and migration rehearsal remain preserved; they were not repeated. The final pushed source SHA, exact-head CI and replacement Preview receipt are maintained in [PR #324](https://github.com/KrapaGoutam/The-Lineup/pull/324).

## Verified configuration

- Authenticated CLI: Vercel 65.14.0, owner `krapagoutam-2284`.
- Team/project: `onepiece11/the-lineup`, project ID `prj_vIbup0LAziHwNv1cbJ5sUSxqaoaJ`; team ID verified against project metadata.
- Baseline: ready Preview `dpl_98CPTfrK1LwaNRjsjNL4xK3BMBez`, branch `feature/v2-007-clock-kiosk`, source `b6cb82a239d34ffdd9692b9a7d24c79446a7a1ce`.
- Effective inherited public Supabase URL equals the expected Hosted DEV project; only the equality result was reported. Baseline deployed entry assets independently match DEV with no other Supabase project binding found.
- Effective inherited `NEXT_PUBLIC_DEMO_MODE` is `false`. `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, server-only `SUPABASE_SECRET_KEY`, and `APP_PIN_PEPPER` are configured. Server credentials were verified by metadata, without retrieving their values.
- Node.js is `24.x`. Project `autoExposeSystemEnvs` is enabled; baseline deployment build/runtime variable names include `VERCEL`.
- Added `KIOSK_SESSION_SECRET` as type Secret (API metadata: `sensitive`), target **Preview only**, Git branch **`feature/v2-007-clock-kiosk` only**. No existing kiosk variable was overwritten. Its value was generated from 48 cryptographically random bytes using Node's crypto API, passed directly to CLI stdin, never printed, saved to a plaintext file, placed in shell arguments, or retrieved after creation. It is independent of `APP_PIN_PEPPER`.
- Generic Preview variables are inherited; development-branch overrides do not apply to this feature branch. Adding the variable does not update the baseline deployment. The next feature-branch push must create a new Preview before configuration readiness is declared.

## Public-key correction and verification

Both the isolated PIN Auth client and employee JWT client in `kiosk-clock-actions.ts` now use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, matching the main application. [Supabase documents publishable keys with separate user authentication and authenticated RLS roles](https://supabase.com/docs/guides/getting-started/api-keys). No duplicate legacy public credential is needed. Admin operations remain server-only, employee JWTs remain isolated, and attendance authorization/session behavior is unchanged.

Affected action fixtures now use a publishable key. Regression assertions verify PIN Auth and employee JWT client options while the legacy variable is explicitly absent. The only remaining kiosk `NEXT_PUBLIC_SUPABASE_ANON_KEY` reference is that negative test setup.

- Focused kiosk Vitest: 11 files, **96/96 PASS**.
- `npm run check`: **PASS** (formatting, zero-warning ESLint, TypeScript).
- `npm run build`: local Turbopack cannot resolve Next.js through this existing worktree's external `node_modules` junction; no dependency/configuration change was made.
- `npm run build -- --webpack`: **PASS**, production compilation and 13 routes on local Node 24.18.1.
- Diff review: no new authorization inputs, service credential use in employee clients, schema change, dependency, UI behavior or attendance rule change. Migration SHA-256 still matches the approved `a83150c1abd5f2b143e5f29da33549dc7ef255727be2384b56ac5b1ddd531f82`.

The existing GitHub workflows supply full unit/browser/database gates and the normal production-mode build on the new head. They must pass on that exact SHA. Full suites, recovery and migration rehearsal were not manually repeated for this correction. The actual Preview build verifies public-variable substitution in Vercel's normal build/runtime mode; read-only entry/kiosk smoke and deployment metadata must verify its branch, SHA, DEV binding, variable names and ready state. Hosted employee authentication/attendance acceptance remains behind the migration/fixture approval gates.

## Trusted ingress

[Vercel's request-header contract](https://vercel.com/docs/headers/request-headers) makes forwarding headers available to Functions, describes edge replacement of external forwarding IPs to prevent spoofing, and identifies `x-vercel-forwarded-for` as the Vercel-specific source. The application reads it through server-side Next.js headers, requires `VERCEL=1`, validates exactly one IP, and stores only a domain-separated HMAC digest. Other forwarding headers and payload identifiers cannot select the bucket. Missing/malformed identity, missing secret or accounting failure denies the request. Existing source/privacy tests pass. No raw IP or secret is intentionally serialized or logged by this helper, and no diagnostic endpoint was added.

[Vercel documents `VERCEL=1` at build and runtime](https://vercel.com/docs/environment-variables/system-environment-variables); system-variable exposure is already enabled. The mechanism is supported by the verified Vercel deployment and documented platform contract. A live pairing/spoofing attempt was not performed because it would write Hosted DEV attempt/device data. This is configuration/contract verification, not hosted pairing acceptance or a log-exhaustiveness audit. No project-wide setting was changed.

## Remaining owner gates

Before merging V2-007, separately authorize a dedicated kiosk Secret for the **development branch's Preview**; the feature-specific secret does not follow a merge. Any Production configuration remains separately authorized.

The approved kiosk migration remains unapplied to Hosted DEV. Separate owner authorization is still required for that migration, synthetic acceptance fixtures, hosted acceptance and any development/main merge. Financial activation remains OFF and backend enforcement remains STAGED. No Hosted DEV migration, hosted fixtures, Production deployment, Neon modification, activation, enforcement change or merge was performed. The separate readiness documentation commit `8744924` remains preserved on its original local branch.

This correction only substitutes the existing public credential convention and its regression fixtures. The focused diff review found no material security-boundary change requiring another independent security review; prior low-severity review observations remain unchanged.
