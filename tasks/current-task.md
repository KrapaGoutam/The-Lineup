# V2-005.001 - Table Allocation / Rotation Location Scoping

Approved: owner prompt 2026-11-06. Branch feature/v2.0-005.001-allocation-location-scoping.
Worktree .tmp/v2-allocation-location-scoping; baseline 53ad8397dd8712b70846b13b067d9c3c1ef0c06a, PR #303 verified.
Main 5e5b7747693b6e81014eafdf299b87e56c3f033d; Production forbidden.
Predecessor PR #305 (V2-004.004) open and unmerged; independent implementation on development base.

- [x] Fetch/verify baseline; create isolated worktree; inspect Docker & port status
- [x] Checkpoint A: Audit application loaders, mutations, database RPCs, RLS policies, and entry points
- [x] Checkpoint A: Author ENTRY_POINT_MATRIX.md, PLAN.md, TEST_MATRIX.md, STATUS.md
- [x] Checkpoint B: Implement database location scoping migration (can_operate_board, board_add_column, RLS)
- [x] Checkpoint B: Implement server action verified-context binding, session validation & error responses
- [x] Checkpoint B: Wire expectedContext through AllocationWorkspace & pass verified scope to loaders
- [x] Checkpoint C: pgTAP tests for direct RPC and PostgREST isolation
- [x] Checkpoint C: Real-JWT tests for positive cases, multi-location isolation, and security denials
- [x] Checkpoint C: Full regression suite (format, lint, typecheck, vitest)
- [x] Checkpoint D: Author EVIDENCE.md, update docs/v2.0 status, create PR to development
