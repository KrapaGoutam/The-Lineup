# AI Tooling and Installation Policy

The repository uses a small, auditable core. Agent tools are separated from application dependencies so a coding assistant cannot silently change the production runtime.

## Already installed in this repository

The checked-in `skills-lock.json` and `.agents/skills` contain project copies for Codex, Claude Code, and Gemini CLI:

- Supabase
- Supabase Postgres best practices
- shadcn
- UI UX Pro Max
- Emil Design Engineering
- Animate
- local `restaurant-feature-dev` after running the local install step

Restore recorded project skills with:

```bash
npx --yes skills@1.5.23 experimental_install
```

Review skill diffs before updating. Skills execute with the coding agent's permissions.

## Claude Code: verified baseline

On Windows, install the current official CLI with WinGet:

```powershell
winget install Anthropic.ClaudeCode
```

From inside Claude Code, or with the CLI where supported, install the official/verified plugins individually:

```bash
claude plugin install feature-dev@claude-plugins-official
claude plugin install claude-code-setup@claude-plugins-official
claude plugin install frontend-design@claude-plugins-official
claude plugin install code-review@claude-plugins-official
claude plugin install context7@claude-plugins-official
claude plugin install playwright@claude-plugins-official
claude plugin install figma@claude-plugins-official
```

Authenticate Figma after installation. The Figma plugin is preferred over a manual server because it includes MCP configuration and Figma skills.

Test the repository's local cross-agent plugin with:

```bash
claude --plugin-dir ./plugins/codex-plugin-cc
```

Then invoke `/codex-plugin-cc:restaurant-feature-dev <feature request>`. The official `/feature-dev` can still perform the deeper discovery; the local skill defines the durable Claude-to-Codex handoff.

## Codex

Codex reads `AGENTS.md` automatically. Install/authorize remote MCP servers in the Codex CLI or app rather than committing tokens:

```bash
codex mcp add figma --url https://mcp.figma.com/mcp
codex mcp add supabase --url https://mcp.supabase.com/mcp
codex mcp add playwright -- npx -y @playwright/mcp@0.0.80
codex mcp add context7 -- npx -y @upstash/context7-mcp@4.0.5
```

The Codex app's Figma plugin is also supported and is the simpler authenticated path. Keep Supabase MCP in read-only mode while planning. Enable project-scoped write tools only for an approved migration task.

## Gemini CLI / Antigravity

Use `GEMINI.md` as the repository contract and restore the same Agent Skills from `skills-lock.json`. Configure the same remote Figma and Supabase endpoints through the client's supported MCP settings. Do not commit OAuth tokens or machine-local configuration.

## Requested optional tools: decision record

| Tool               | Decision                         | Reason                                                                                                           |
| ------------------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `claude-mem`       | Optional after privacy review    | Valuable cross-session compression, but it captures tool/session activity and adds local processes               |
| Headroom           | Do not install by default        | A proxy/compression layer changes what the model sees; evaluate only after measuring a real context-cost problem |
| Task Observer      | Optional, explicit sessions only | Writes observation and proposed-skill files; useful later, noisy during initial product work                     |
| Graphify           | Defer until repository is large  | A knowledge graph has little payoff in a fresh modular monolith                                                  |
| CodeBurn           | Optional local telemetry         | Useful for measuring agent token/cost usage; unrelated to product runtime                                        |
| Ponytail           | Optional experiment              | Minimal-code guidance can help, but must not override acceptance, security, or test requirements                 |
| CodeRabbit         | Enable after GitHub repo exists  | Adds PR review; `.coderabbit.yaml` is ready                                                                      |
| Claude Map         | Not installed                    | The name did not resolve to one authoritative package; avoid guessing                                            |
| Leon's taste skill | Not installed                    | Ambiguous package/owner; exact repository is required                                                            |
| “skill UI”         | Replaced by specific skills      | shadcn, UI UX Pro Max, and Emil Design Engineering cover the request without a vague duplicate                   |

Add optional tools only in a separate `chore(tooling): ...` pull request. Inspect repository, license, hooks, network calls, data retention, and permissions before installation.

## Figma workflow

Figma's remote MCP endpoint is `https://mcp.figma.com/mcp`. Use it to read variables, component structure, Dev Mode context, and Code Connect mappings. A feature plan must contain the exact Figma file/frame URL before an agent claims design parity.

## Playwright workflow

Use checked-in Playwright tests for CI. Use Playwright MCP only for exploratory verification or reproducing a bug. Never let browser automation approve a destructive external action without explicit user authorization.

## Source links

- [Anthropic Feature Dev](https://claude.com/plugins/feature-dev)
- [Anthropic Frontend Design](https://claude.com/plugins/frontend-design)
- [Anthropic Code Review](https://claude.com/plugins/code-review)
- [Anthropic Context7](https://claude.com/plugins/context7)
- [Anthropic Claude Code Setup](https://claude.com/plugins/claude-code-setup)
- [Figma remote MCP setup](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/)
- [Supabase Next.js quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)
- [OpenAI Codex skills](https://developers.openai.com/codex/build-skills)
- [OpenAI AGENTS.md](https://developers.openai.com/codex/agent-configuration/agents-md)
