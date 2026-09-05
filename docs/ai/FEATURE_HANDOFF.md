# Feature Handoff Template

Copy to `docs/features/<feature-slug>.md`. Claude plans and freezes the accepted contract; Codex implements it.

## Feature

**Name:**  
**Owner:**  
**Status:** discovery | approved | building | review | shipped  
**Issue/PR:**

## User outcome

Who can do what, and why does it matter?

## Scope

- In:
- Out:

## Acceptance criteria

- [ ] Given / when / then

## UX contract

- Entry point:
- Desktop:
- Host tablet:
- Server mobile:
- Loading:
- Empty:
- Error:
- Success:
- Permission denied:
- Keyboard/screen reader:
- Figma frame URL, if any:

## Data and authorization

- Tables/columns:
- Constraints/indexes:
- Grants/RLS policies:
- Roles/capabilities:
- Audit events:
- Idempotency/concurrency:
- Time-zone behavior:

## Implementation map

- Routes:
- Feature modules:
- Server actions/RPCs:
- Realtime events:
- Migration:
- Generated types:

## Test plan

- Unit:
- Component:
- Database/RLS:
- Playwright:
- Manual viewports:

## Rollout and rollback

- Feature flag:
- Expand/migrate/contract:
- Backfill:
- Rollback limit:

## Decisions and risks

- Decision:
- Risk/mitigation:
- Open question:

## Codex build prompt

```text
Implement docs/features/<feature-slug>.md exactly as approved. Follow AGENTS.md. Do not expand scope or change product policy. Run the specified test plan plus npm run check, npm run test, and npm run build. Stop for a materially missing decision. Return the diff summary, verification evidence, and remaining risk.
```
