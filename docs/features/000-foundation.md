# Feature 000 — Foundation

Status: implemented starter; external services not linked.

## User outcome

A product team can open a credible restaurant-operations dashboard, vary the number of active servers to preview balanced table sections, and continue work through a documented Claude-plan/Codex-build feature workflow.

## In scope

- Next.js dashboard shell for manager desktop and host tablet
- Reusable shadcn-compatible UI primitives and design tokens
- Pure table-section allocator and next-server recommendation engine
- Initial Supabase multi-tenant schema, explicit grants, RLS, and pgTAP smoke tests
- CI workflows, Playwright smoke test, Vercel delivery instructions
- Agent contracts, local cross-agent plugin, project skills, and feature template

## Out of scope

- Authentication screens and organization onboarding
- Persisted dashboard data or live subscriptions
- Transactional seating RPC
- Creating/linking hosted Supabase, GitHub, Figma, or Vercel resources

## Acceptance

- `npm run check`, `npm test`, and `npm run build` pass.
- The dashboard renders “Tonight at a glance”, “Table rotation”, and “Weekly roster”.
- Increasing/decreasing server count recomputes table assignments.
- Occupied table assignments are never changed automatically.
- The next-server result is deterministic, excludes ineligible servers, and explains its choice.
- The migration parses as PostgreSQL, enables RLS on exposed tables, grants no table access to `anon`, and has a Docker-backed CI database test.
- The project skill and plugin manifests validate.

## Verification evidence

Record final command output and screenshots in the implementing pull request. Local Docker is unavailable in the generated workspace, so the database reset/pgTAP step is delegated to `.github/workflows/database.yml` until run on a Docker-capable machine.

## Next feature

Use `/feature-dev` to plan `001-authenticated-app-shell.md`, approve the file, then ask Codex to implement only that contract.
