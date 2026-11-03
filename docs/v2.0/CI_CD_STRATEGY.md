# The Lineup V2.0 — CI/CD & Integration Strategy

## 1. Branching Model and Integration Pipeline

The Lineup V2.0 enforces cumulative integration into `development`. The `main` branch represents production-ready software and is touched only upon final owner sign-off during Phase V2-009.

```text
feature/v2-<feature>-<subfeature>
  ↓
Local Targeted Validation (Typecheck, Vitest, pgTAP)
  ↓
Comprehensive Pre-PR Gate (npm run check, npm run test, npm run build)
  ↓
Pull Request targeting `development`
  ↓
GitHub Actions CI (Exact-Head Validation)
  ↓
Hosted DEV Verification (where schema or RPCs are modified)
  ↓
Document Evidence in PR & Linked Issue
  ↓
MERGE COMMIT into `development`
```

---

## 2. Pull Request Rules and Merge Discipline

1. **Exact-Head CI Required**: PRs must not be merged until GitHub Actions runs completely green on the exact PR head commit.
2. **Merge Method**:
   - **MERGE COMMIT ONLY**: Always use `gh pr merge <pr_number> --merge`.
   - **NO SQUASH MERGE**: Preserves discrete, reviewable atomic history.
   - **NO REBASE MERGE**: Retains merge commit topologies.
3. **No Direct Pushes to `development` or `main`**: All changes must arrive via a reviewed, tested pull request.
4. **Docs & Status Synchronization**: Every merged PR must be accompanied by updates to `CURRENT_STATE.md`, the active feature's `STATUS.md`, and the linked GitHub issue/milestone.

---

## 3. Database Migration CI/CD Policy

1. **Local Forward Migration**:
   - Created in `supabase/migrations/<timestamp>_<name>.sql`.
   - Validated against local Supabase CLI instance.
   - Accompanying pgTAP tests created in `supabase/tests/database/`.
2. **CI Quality Gate**:
   - GitHub Actions runs database linting and full pgTAP assertion suite.
3. **Hosted DEV Deployment**:
   - After PR CI passes, migration is applied to the linked hosted DEV Supabase project (`opmujepkemwcdxxorhfd`).
   - Hosted DEV test suites verify live schema parity.
4. **Production Isolation**:
   - Production database (`ftadewtkjlaotfdvtjcv`) is **NEVER** modified during standard subfeature execution.
   - Production migrations are bundled and applied only under the final release gate (V2-009) with owner approval.
