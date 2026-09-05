# Handoff Workflow

## Plan mode output

Create `docs/features/<feature-slug>.md` from the repository template. Include user outcome, non-goals, acceptance criteria, UI states, data changes, capabilities, RLS/grants, concurrency/idempotency, time-zone behavior, tests, rollout, and rollback. Link an exact Figma frame only when one exists. End with the bounded Codex prompt and set status to `approved` only after approval.

Stop when a missing choice changes permissions, fairness policy, data migration, irreversible behavior, or public UX. Ask one focused question with concrete options.

## Build mode output

Confirm the feature spec status is approved. Inspect current git state and relevant modules. Implement the smallest complete vertical slice. Schema changes use a migration, explicit Data API grants, RLS, indexes, policy tests, and regenerated types. UI work uses the repository tokens and semantic components. Domain rules are pure where possible.

Run the spec's tests plus `npm run check`, `npm run test`, and `npm run build`. Report exact results. Stop before push/deploy/database mutation when the user has not authorized it or the target is ambiguous.

## Review mode output

Review the diff and executed checks. Prioritize correctness, cross-tenant access, stale/concurrent seating, schedule time zones, occupied-table movement, accessibility, and data loss. Give file-specific evidence and a minimal remediation. If no findings remain, state the residual test or environment limits.
