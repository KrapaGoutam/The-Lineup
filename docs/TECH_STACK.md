# Technical Stack

## Chosen baseline

| Layer   | Choice                                         | Why                                                                                               |
| ------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Web     | Next.js 16 App Router, React 19, TypeScript    | First-class Vercel deployment, server-first reads, route-level loading/error boundaries           |
| UI      | Tailwind CSS 4, shadcn/ui on Radix, Lucide     | Accessible source-owned primitives and consistent tokens                                          |
| Motion  | Framer Motion                                  | Small, deliberate transitions for roster changes and live state; no decorative motion requirement |
| Forms   | React Hook Form + Zod                          | Typed validation shared across form boundary and domain service                                   |
| Time    | date-fns + IANA time-zone strings              | Clear schedule math without storing formatted dates as truth                                      |
| Backend | Supabase Postgres, Auth, Realtime              | Relational consistency, RLS, OAuth/passwordless options, and live floor updates                   |
| Hosting | Vercel                                         | Git previews, production promotion, and regional server execution                                 |
| Tests   | Vitest, Testing Library, pgTAP, Playwright     | Pure domain rules, components, policies, and critical browser flows                               |
| CI      | GitHub Actions + Vercel Git integration        | Independent code checks and preview deployment gate                                               |
| Review  | Built-in review checklist; optional CodeRabbit | Human-readable rules remain in repo; external reviewer is additive                                |

## Package policy

- Pin direct production and CI-sensitive packages and commit `package-lock.json`.
- Use npm for this repository; do not add a second lockfile.
- Prefer platform APIs and existing dependencies.
- Run `npm audit --omit=dev` and inspect breaking changes before package updates.
- Renovation is grouped and reviewed; dependency updates do not auto-merge.

## Supabase conventions

- Use `@supabase/ssr` browser/server clients and `getClaims()` for server identity checks.
- Use the publishable key in browser-safe configuration. The older anon/service-role key pattern is not the default.
- Explicitly grant required Data API privileges; new tables are not assumed to be exposed automatically.
- Generate `src/types/database.generated.ts` from the linked project after migrations.
- Use SQL migrations as the schema source of truth; do not create production tables only in the dashboard.
- Use Realtime only for invalidation and live operational updates. Postgres remains authoritative.

## Deliberate omissions

- No ORM in MVP. Generated Supabase types and small query modules keep schema behavior visible.
- No global client state library until a feature proves it is needed. URL state, Server Components, forms, and local state cover the first slices.
- No separate API service. Add one only when integrations, long-running jobs, or independent scaling require it.
- No generic drag/drop dependency until the floor-plan feature is implemented and keyboard behavior is specified.

## Current-source notes

- Supabase's current Next.js guidance uses cookie-based SSR clients, `getClaims()` for protected server access, and publishable keys.
- Supabase is changing Data API defaults, so migrations in this repository include explicit grants and RLS.
- Next.js 16 uses `proxy.ts` instead of the former middleware filename.

See `docs/AI_TOOLING.md` for agent and MCP dependencies. Product runtime packages must never be installed merely because an agent tool uses them.
