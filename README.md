# ServiceFlow Restaurant Operations

ServiceFlow is a passcode-only restaurant workspace with exactly three operating modules:

1. weekly/monthly staff roster;
2. live table-allocation rotation;
3. interval-based tip splitting.

Managers and owners can plan, publish, clear, undo, calculate, and configure restaurant hours. Anyone signed in can write to any active table column on the live allocation board, with attribution always recorded (Feature 011). Servers can read the published team schedule and see only their own tip estimate. An owner or manager can set anyone's designation — Owner, Manager, Assistant Manager, or Staff; Manager and Assistant Manager get identical full operational access (Feature 014).

## Working demo

The app runs without paid services when `NEXT_PUBLIC_DEMO_MODE=true`.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000` and use:

| Role    | Passcode |
| ------- | -------- |
| Manager | `2468`   |
| Server  | `1357`   |
| Owner   | `9999`   |

Demo data lives in browser memory and resets on refresh. Connect Supabase for persistent users and operational records.

## Stack and free-tier target

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4
- shadcn-style primitives, Lucide, Framer Motion
- Supabase Auth, Postgres, RLS, Realtime
- Vercel Hobby for personal/non-commercial prototyping
- Vitest, Playwright, pgTAP-ready SQL, GitHub Actions

The design intentionally fits Vercel Hobby and Supabase Free for a small personal pilot. Free plans have quotas and are not an uptime/SLA promise. Review current plan terms before using it commercially.

## Quality gate

```bash
npm run check
npm test
npm run build
npm run test:e2e
```

## Supabase and Vercel

Follow [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Secrets never use a `NEXT_PUBLIC_` prefix. Production passcodes use a keyed locator server-side and Supabase Auth's password verifier; raw passcodes are not stored in application tables.

## AI-first development workflow

- Claude Code plans with `/feature-dev`; accepted scope is frozen in `docs/features/`.
- Codex builds the accepted feature and runs the complete quality gate.
- Gemini/Antigravity critiques visual and architecture choices through `GEMINI.md`.
- Shared rules live in `AGENTS.md`; tool policy lives in `docs/AI_TOOLING.md`.
- The local Claude/Codex bridge is `plugins/codex-plugin-cc`.

## Project documents

| Document                                         | Purpose                                       |
| ------------------------------------------------ | --------------------------------------------- |
| [`docs/PRD.md`](docs/PRD.md)                     | Product scope and acceptance                  |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)   | Runtime and module boundaries                 |
| [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md)       | Tables, invariants, grants, and RLS           |
| [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) | UI contract and Figma handoff                 |
| [`docs/SECURITY.md`](docs/SECURITY.md)           | Passcode and authorization model              |
| [`docs/CI_CD.md`](docs/CI_CD.md)                 | Checks, previews, migrations, and releases    |
| [`docs/AI_TOOLING.md`](docs/AI_TOOLING.md)       | Skills, plugins, MCPs, and installation rules |

## Current delivery state

The responsive interactive MVP, domain tests, passcode/self-serve-registration route handlers, session refresh proxy, and forward Supabase migrations are implemented. Hosted Supabase persistence and Vercel deployment require the project credentials and Git remote described in the deployment runbook.
