# Current Task: none active

**Status:** Idle — the "Payroll UX / Timezone / PIN Keypad" mega-request
(6 phases: attendance timezone fix, payroll bulk generation,
Generate Payroll + ledger modal dialogs, ledger unlock, payment
unconfirm/edit, PIN keypad hardening) is fully merged to `main` as PRs
#35, #36, #41 (replaces #37, which GitHub auto-closed when its stacked
base branch was deleted — see `docs/agent-handoff.md`), #38, #39, and
#40. Full history, design decisions, and per-phase writeups live in
`docs/agent-handoff.md` — read that first if picking up related work
(e.g. the flagged CI credentials gap below, or Phase 9's noted
portrait-tablet coverage gap).

**Known open item (not a code defect):** the `Database` GitHub Actions
workflow's `deploy-migrations` job fails on push to `main` —
`SUPABASE_ACCESS_TOKEN` lacks the privileges Supabase's API now
requires for `supabase link`. This blocks automatic deployment of the
payment-unconfirm migration (`20260911130000_payroll_payment_unconfirm.sql`)
to the hosted production database. The migration itself is verified
correct (pgTAP, a full local `db reset` replay, and the PR's own
`migrations-and-policies` check all passed) — this needs a repo owner
to rotate/re-scope the token (Supabase dashboard → Access Tokens) and
update the `SUPABASE_ACCESS_TOKEN` GitHub Actions secret, then either
re-run the `Database` workflow on `main` or push a trivial commit.

## Next task

None assigned. When a new feature or bug request comes in, follow
`CLAUDE.md`/`AGENTS.md`'s planning workflow: write the plan to
`docs/features/<slug>.md`, initialize this file from
`docs/ai/FEATURE_HANDOFF.md`, and update `docs/STATUS.md` once
implemented.
