# V2.0.1 — Organization and branch creation

**Status:** approved (owner implementation request, 2026-11-16)
**Branch:** `feature/v2.0.1-organization-creation`
**Base:** synchronized `development` at `cc87e1f377b86b5a0442faff53b0fcb25298c460`

## Outcome and scope

An authenticated, active Overall Owner can open System Administration independently of an active branch, list organizations, create one with a chosen name and immutable slug, and then open its existing Locations administration to create and manage branches. Overall Managers retain existing Locations access but cannot provision organizations. No schema, attendance, module, identity, or staff-copy changes are included.

## Data, authorization, and concurrency

- Reuse `organizations`, `memberships`, `locations`, `overall_roles`, and existing RLS. `provision_organization` creates the organization and owner membership atomically. `provision_location` is a separate operation and remains independently retryable.
- A live session and server-read Overall Owner role gate every System Administration read and create action. The RPC enforces the same creation restriction. Organization IDs passed to the branch view are checked by the existing location actions and RLS.
- The create form normalizes the name, generates a slug until edited, validates both with the existing domain helpers, disables repeat submissions, and preserves input after a duplicate-slug or other recoverable error. The database unique constraint resolves concurrent slug attempts; no alternate slug is chosen automatically.
- Branch creation uses the existing location form and action. A successful organization remains intact if a later branch operation fails.

## UX states

- Settings shows the System Administration destination only after the server confirms Overall Owner authority. The no-location recovery screen offers the same destination to an eligible owner.
- The organization list shows name, slug, branch count, and Manage action. Empty, loading, denied, and error states are explicit. The saved organization opens a branch-management view with a success notice.
- The existing Locations view handles responsive layout, branch loading/empty/error, edit, lifecycle, hours, staff, and modules. The empty state says “No branches yet” and offers “+ Add Branch”.

## Tests and release

- Focused action/component tests cover owner and denied creation, validation, duplicate slug, list and branch handoff, retry after failure, and the zero-branch state. Reuse the existing pgTAP provisioning and RLS tests; run focused browser coverage and repository checks, test, and build.
- Push one feature commit and PR to `development`; require exact-head CI and hosted DEV acceptance for Liquor Tap / League City / NASA through an authenticated Overall Owner. Check for existing records first. Main release needs owner approval and repository gates. No Production pilot writes.
- Code-only rollback: revert the feature merge and redeploy. Created DEV organizations and branches are separate data and are not removed by code rollback.

## Local implementation evidence (2026-11-16)

- `npm run check` passed (format, ESLint, TypeScript). Full Vitest: 314 files, 4,241 passed, 7 existing skips. Focused new and related tests: 5 files, 29 passed.
- Focused local pgTAP `0056`, `0057`, `0062`: 3 files, 159 assertions passed. Four new assertions verify the default creator owner membership and that branch provisioning leaves attendance unconfigured and modules untouched. The tests also exercise unauthorized creation and location tenant boundaries. No V2.0.1 migration or module activation is included.
- Existing Locations Playwright: desktop and server-mobile demo projects, 8/8 passed. This preserves the branch form, navigation and management behavior; authenticated Overall Owner browser acceptance remains for hosted DEV.
- `npm run build` with default Turbopack cannot resolve the Next package outside this isolated worktree. The repository's webpack fallback `npm run build -- --webpack` passed; both new routes are request-rendered (`ƒ`). No schema migration or generated type change.
- Hosted DEV pilot, PR CI, development merge, owner Production approval and Production checks are pending. Liquor Tap / League City / NASA have not been created by this local implementation.
