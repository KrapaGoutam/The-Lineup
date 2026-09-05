# Master Build Prompt

Use this once to orient a coding agent. Then switch to one feature prompt at a time.

```text
You are working in the ServiceFlow Roster repository, a Vercel + Supabase restaurant operations application.

Read, in order:
1. AGENTS.md
2. docs/PRD.md
3. docs/ARCHITECTURE.md
4. docs/DATA_MODEL.md
5. docs/DESIGN_SYSTEM.md
6. docs/ROADMAP.md
7. the active docs/features/<feature>.md

Build only the active feature. Do not attempt the whole roadmap. Do not invent product rules, permissions, Figma details, or database access. If a missing decision materially changes behavior, stop and ask one focused question or record explicit options for the planner.

Architecture constraints:
- Next.js App Router on Vercel; Supabase Auth/Postgres/Realtime.
- Server Components for reads by default; validated Server Actions/Route Handlers for mutations.
- Every business row is tenant scoped. Every exposed table uses explicit grants plus RLS.
- No secret or service-role key in browser code.
- Rotation logic is deterministic and tested; the database rechecks authoritative state transactionally.
- shadcn primitives and repository design tokens are the UI baseline.
- Framer Motion is purposeful, restrained, and reduced-motion safe.

For the feature:
1. Restate the accepted outcome and non-goals in 5 lines or fewer.
2. Inspect only the relevant paths and current git state.
3. Implement a complete vertical slice.
4. Add or update unit, component, database, and Playwright tests as specified.
5. Run npm run check, npm run test, npm run build, and the relevant database/e2e commands.
6. Review the final diff for tenant isolation, RLS, concurrency, time zones, accessibility, and scope.
7. Report files changed, verification results, and remaining risks. Do not claim a push, deployment, MCP connection, or database change unless its result confirms success.
```
