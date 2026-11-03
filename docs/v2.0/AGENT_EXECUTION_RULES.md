# The Lineup V2.0 — Agent Execution & Token Efficiency Rules

This document establishes the mandatory operational rules for AI agents executing implementation phases across The Lineup V2.0.

---

## 1. Token Efficiency: What to Read

To preserve context window budget and maintain execution precision, agents executing V2 tasks must **NOT** read historic V1 feature documents or the entire repository.

An agent session should read **ONLY**:
1. Root agent instructions (`AGENTS.md` / `GEMINI.md`).
2. `docs/v2.0/README.md`.
3. `docs/v2.0/CURRENT_STATE.md`.
4. The active section of `docs/v2.0/ROADMAP.md`.
5. The active feature specification (`docs/v2.0/features/<feature>/README.md`).
6. The active subfeature specification (`docs/v2.0/features/<feature>/<subfeature>/README.md`).
7. Directly affected source code and migrations.
8. Directly affected test files.

Do not load `docs/PRD.md`, `docs/STATUS.md`, or historic `docs/features/001-035` unless a specific subfeature explicitly cites an invariant defined therein.

---

## 2. Subagent Rules & Limits

When an implementation task benefits from parallel exploration:
1. **Maximum Two Subagents**: Do not launch fleets of speculative agents.
2. **Focused & Specialized**:
   - **Security Subagent**: Read-only audit of RLS policies, `SECURITY DEFINER` RPCs, and tenant isolation.
   - **Schema Subagent**: Read-only review of foreign keys, migration constraints, and backward compatibility.
3. **No Redundant Reading**: Subagents must be instructed to inspect only target diffs, not reread the entire repository.
4. **Primary Agent Ownership**: Subagents only provide review findings. The primary agent owns synthesis, file edits, testing, and git operations.

---

## 3. Mandatory AI Agent Section in Every Future Prompt

Every implementation prompt generated for V2 subfeatures must contain an explicit **AGENT RECOMMENDATION** block structured as follows:

```markdown
# AGENT RECOMMENDATION

## 1st — IDEAL
- **Agent:** Antigravity Local
- **Model:** Gemini 3.8 Flash
- **Effort:** High
- **Session:** NEW LOCAL SESSION
- **Environment Requirement:** [LOCAL REQUIRED | LOCAL STRONGLY RECOMMENDED | LOCAL PREFERRED]
- **Rationale:** [Specific reason why this model/agent is ideal]

## 2nd
- **Agent:** Claude Code
- **Model:** Claude Sonnet 4.5
- **Effort:** High
- **Session:** Local preferred; Cloud acceptable with full GitHub access
- **Environment Requirement:** [LOCAL PREFERRED | CLOUD ACCEPTABLE]
- **Rationale:** [Fallback rationale]

## 3rd
- **Agent:** Codex
- **Model:** GPT-5.6 Sol
- **Effort:** High
- **Session:** Local preferred
- **Environment Requirement:** [LOCAL PREFERRED]
- **Rationale:** [Deep reconciliation fallback]
```

### Model Selection Principle:
Always evaluate **Antigravity with Gemini 3.8 Flash (High effort)** first. If the subfeature consists of bounded code modifications, targeted tests, or focused schema work, prefer Flash for speed and token efficiency. Do not automatically escalate to larger frontier models unless complex multi-system refactoring requires it.

---

## 4. Post-Subfeature Synchronization Discipline

Immediately upon completing any subfeature, the agent must synchronize documentation across local files and GitHub:

### Local Updates:
- Update active subfeature `STATUS.md` &rarr; `DONE`.
- Check off the completed subfeature `[x]` in the feature `README.md`.
- Update the parent feature `STATUS.md`.
- Update `docs/v2.0/CURRENT_STATE.md` with current SHA, PR, and next step.
- Update `docs/v2.0/ROADMAP.md` checklist.
- Record evidence and test results in the feature directory.

### GitHub Updates:
- Create pull request targeting `development`.
- Link parent and feature issue numbers in PR description.
- Await exact-head CI green status.
- Merge PR using **MERGE COMMIT** (`gh pr merge <pr> --merge`).
- Comment on the linked subfeature/feature issue with the exact merge SHA and test evidence.
- Close the completed subfeature issue if one exists.
