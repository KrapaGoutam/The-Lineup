# Current Task: DEV Preview & CI Reliability (INFRA-A..D)

# DEV Preview / CI Reliability — Agent Handoff

Branch: `infra/dev-preview-ci-reliability`
HEAD: see `git log -1` (last: "docs(infra): handoff and final matrix" on top of `be8e6e8`)
Base development HEAD: `ead4e8b` (PR #132)

Current sub-feature: all implemented; waiting on owner merge decision.
INFRA-A: ✅ Vercel env applied; deployed-Preview browser smoke is an owner step (Vercel Authentication, no bypass secret created)
INFRA-B: ✅ CI green on PR #135 (Database job passed via ghcr.io)
INFRA-C: ✅ `scripts/check-nonprod-env.mjs`, `npm run check:env`, CI scan of `.next`
INFRA-D: 🟡 docs updated; final "merged" status update after the PR merges

Completed: audit, plan, issue #133, Vercel Preview/Development env, wrapper `scripts/ci/supabase-run.mjs` (start|reset|test), guard, docs, PR #135, CI green.
In progress: none.
Not started: owner smoke on the deployed Preview URL; merge; post-merge doc status.

Files changed: `.github/workflows/{ci,database}.yml`, `package.json`, `vitest.config.ts`, `scripts/ci/supabase-run.{mjs,test.ts}`, `scripts/check-nonprod-env.{mjs,test.ts}`, `docs/{CI_CD,DEPLOYMENT,STATUS,ROADMAP}.md`, `docs/features/dev-preview-ci-reliability/*`, `tasks/current-task.md`.
Uncommitted files: none tracked. Untracked and must stay uncommitted: `docs/testing/` (DEV validation report + evidence), `The Lineup.code-workspace`.
Commits created: plan docs; Vercel mapping docs; Database CI hardening; env guard + docs; wrapper extended to reset/test; handoff.

Vercel Preview state: DEV URL/publishable key, DEV secret key + pepper (Sensitive), slug, `NEXT_PUBLIC_DEMO_MODE=false`; no Neon.
Vercel Development state: same DEV values (non-sensitive, Vercel rule), demo=false; no Neon.
Vercel Production state: unchanged (metadata diff identical).
DEV Supabase ref: opmujepkemwcdxxorhfd
PROD Supabase ref: ftadewtkjlaotfdvtjcv
Production variables changed: NO

Database CI state: PASS on PR #135 (run 40106511748)
Workflow/run: `Database / migrations-and-policies`; first run failed at `db:test` (pg_prove pulled from ECR) -> fixed by routing reset/test through the wrapper.
Failure classification: registry-transient (`toomanyrequests`) — correctly classified; the retry path itself is only unit-tested, not yet exercised in CI.
Tests reached: start, reset (35 migrations), pgTAP. Tests passed: 25 files / 387 assertions. Tests blocked: none.

GitHub issues updated: #133 (parent), #134 (new bug: Realtime in production builds)
Project #4 state: #133 In Progress -> Review; #134 Backlog
Milestone: Platform / CI Reliability
PR: #135 -> development (merge commit only)

Local docs updated: STATUS, ROADMAP, CI_CD, DEPLOYMENT, feature docs.

development merged: NO
main merged: NO
DEV touched: YES (read-only config use; real-mode suite creates and deletes its own synthetic org)
PROD touched: NO

Running processes: none.
Exact next action: owner opens the Preview URL of PR #135, signs in with a synthetic DEV user, checks Table Allocation / Schedule / Team; then merge PR #135 with a **merge commit**; then update docs (INFRA-D final) and close #133.
Read first: `docs/features/dev-preview-ci-reliability/IMPLEMENTATION_REPORT.md`
Run first: `gh pr checks 135`
DO NOT: touch PROD or Production Vercel variables; merge to `main`; commit `docs/testing/`; use `git add -A` / `git add .` (it swept `docs/testing/` into a commit once — it was removed from the branch with a lease-guarded force push); start Tasks V1; fix #134 inside this PR.
