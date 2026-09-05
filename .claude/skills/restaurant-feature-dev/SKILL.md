---
name: restaurant-feature-dev
description: Plan, implement, or review one ServiceFlow restaurant scheduling, floor-assignment, or table-rotation feature through a durable Claude-to-Codex handoff. Use for feature work in this repository; do not use for unrelated applications or broad whole-roadmap builds.
---

# Restaurant Feature Dev

Work on one vertical feature at a time. Read `AGENTS.md`, the active `docs/features/<feature>.md`, and only the routed product documents named there.

## Choose the mode

- **Plan:** Use when the request says Claude, discovery, design, plan, or when no approved feature spec exists. Create the spec from `docs/ai/FEATURE_HANDOFF.md`; resolve material questions; stop before implementation.
- **Build:** Use when the request says Codex, implement, or build and an approved feature spec exists. Implement only that contract and run its quality gates.
- **Review:** Compare the diff to the approved spec. Report evidence-backed findings before suggestions; do not rewrite the feature unless asked.

If the intended mode is still ambiguous, default to planning. Do not claim one agent invoked another: the checked-in feature file is the handoff.

## Preserve these product invariants

- Tenant and location authorization is enforced by grants plus RLS.
- Scheduling respects the restaurant's IANA time zone.
- Table rotation remains deterministic, explainable, and transaction-safe.
- Rebalancing never moves occupied tables automatically.
- Manual overrides require a reason and audit event.
- User-facing work covers manager desktop, host tablet, and server mobile as applicable.

Read [references/handoff-workflow.md](references/handoff-workflow.md) for the required outputs and stop conditions in the selected mode.
