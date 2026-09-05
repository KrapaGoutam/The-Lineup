---
description: Turn a feature request into an approved, bounded Codex handoff.
argument-hint: <feature request>
---

Read `AGENTS.md`, `CLAUDE.md`, the product/architecture/data/design documents, and the relevant current source. Use the official `/feature-dev` workflow for discovery and architecture when it is installed.

Plan this request: $ARGUMENTS

Ask only questions that materially change behavior. Write the accepted plan to `docs/features/<feature-slug>.md` using `docs/ai/FEATURE_HANDOFF.md`. Do not implement. Finish with the exact `## Codex build prompt` that bounds implementation to the approved plan and its tests.
