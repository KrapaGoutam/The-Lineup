# V2-003.003 — Evidence

> Cloud evidence uses the in-memory Supabase double that emulates RLS read rules. It is **not** hosted DEV verification.

Local gate results and exact-head CI are recorded in the PR description.

## Pending hosted DEV real-JWT checks (opmujepkemwcdxxorhfd only; never Production)

1. Single-org/single-location user (Jerry): `/` → workspace, no picker, indicator shows org + Webster.
2. Single-context user of a non-default org: `/` → `/r/<slug>?location=<id>` once, no loop; refresh stays.
3. Tom (two locations): `/r/<slug>` → selection screen; Jack (two orgs): no arbitrary tenant.
4. Revoke assignment → next request denied; sign-out/sign-in; back/forward.
5. Server action with the `Referer` stripped for a multi-location user → denied (no oldest-location write).
