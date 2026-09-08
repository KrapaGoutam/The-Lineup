# ServiceFlow Agent Instructions

## Mission

Build a reliable restaurant scheduling and table-rotation product one vertical feature at a time. Prefer the smallest complete change that satisfies an approved feature spec.

## Read before editing

1. `tasks/current-task.md` for active in-flight task checklist and current step
2. `docs/STATUS.md` for global project and milestone health
3. `docs/PRD.md`
4. `docs/ARCHITECTURE.md`
5. The relevant file in `docs/features/`
6. `docs/DATA_MODEL.md` for database or authorization work
7. `docs/DESIGN_SYSTEM.md` for user-facing work
8. `AGENTS.md`

## Non-negotiable rules

- Keep restaurant data tenant-scoped by `organization_id` and location-scoped when applicable.
- Enable RLS on every exposed table and pair grants with explicit policies.
- Never authorize with user-editable metadata. Use membership rows and server-verified identity.
- Never expose a Supabase secret/service-role key to the browser.
- Use Server Components for reads by default; use Server Actions or Route Handlers for validated mutations.
- Keep the table-rotation decision engine pure and deterministic. Persist decisions and overrides separately.
- Do not move an occupied table during floor rebalancing.
- Manual overrides require an audit event; a reason is required too unless a specific, approved feature spec scopes a narrower exception (the allocation board's cross-column edit, Feature 011 as revised twice, records attribution unconditionally with no reason mechanism at all — see `docs/features/011-allocation-board-open-editing.md`).
- Use semantic shadcn primitives before inventing controls. Preserve keyboard and touch usability.
- Motion must be purposeful and honor `prefers-reduced-motion`.
- Do not add a dependency until the platform or existing code cannot reasonably solve the requirement.
- Do not combine unrelated refactors with a feature.
- Always maintain `tasks/current-task.md` during execution: check off `- [x]` after each step is verified, and document in-flight state before halting.

## Workflow

For every feature:

1. Create or approve `docs/features/<feature>.md` from `docs/ai/FEATURE_HANDOFF.md`, and initialize `tasks/current-task.md`.
2. State the data, authorization, UI states, risks, and tests before implementation.
3. Implement one vertical slice.
4. Run `npm run check`, `npm run test`, and `npm run build`.
5. Run relevant Playwright and database tests.
6. Review the diff for security, accessibility, tenant isolation, and accidental scope.
7. Commit with `feat:`, `fix:`, `test:`, `docs:`, `refactor:`, or `chore:`.

Do not push after every file edit. Push each green, reviewable feature commit or pull request; CI/CD is a quality gate, not a backup mechanism.

## Definition of done

- Acceptance criteria pass.
- Loading, empty, error, success, permission-denied, and responsive states are handled where relevant.
- Types contain no avoidable `any`.
- New schema is migration-backed, indexed, RLS-protected, and covered by policy tests.
- Business rules have unit tests; critical user flows have Playwright coverage.
- Documentation and generated Supabase types are current.
- No secrets, debug logs, generated artifacts, or unrelated changes are committed.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
