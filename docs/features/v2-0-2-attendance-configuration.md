# V2.0.2 Attendance Configuration

**Owner:** The Lineup owner

**Status:** approved for feature implementation

**Base:** `development` at `dc2cc8f5f1fddbe0d52b6f0a75534f0e8fa9bd62`

## User outcome and scope

New branches persist `internal_the_lineup` by default. Authorized administrators can inspect and change each branch's attendance mode in the existing branch administration dialog. Existing branches and attendance history are unchanged until individually configured. The three modes remain Internal, External, and Disabled; NULL retains legacy-compatible reads and denies native clocking.

No organization inheritance, new provider, kiosk provisioning, module activation, historical conversion, payroll or tips activation, or PIN change is included.

## Data and authorization

- `public.locations.attendance_mode` receives a database column default. The existing `provision_location` RPC omits this column; its arguments, grants, authorization, and lifecycle checks remain intact. No backfill.
- The existing audited `set_location_attendance_mode` RPC and server actions enforce live identity, administrator authority, reason length, expected `updated_at`, open native-session guard, and tenant/location scoping. Overall Owner/Manager and Organization Owner/GM may configure; branch-only staff and cross-tenant users may not.
- The UI passes a meaningful reason and the last-read timestamp. It rereads the persisted value after saving or conflict.

## UI states and acceptance

- System Administration → Organizations → organization → branch → Attendance shows the branch name, effective mode, and Configured/Unconfigured status.
- Each mode explains its effect. Internal explains registered kiosk requirement; External states that integration setup is separate; Disabled preserves history.
- Mode selection, reason, Save, and Cancel work by keyboard and touch on desktop, tablet, and mobile.
- Loading, denied, conflict, open-session, other failure, and success states have visible text. Archived branches cannot be configured.
- Newly provisioned branches persist Internal; existing NULL, External, and Disabled values remain unchanged. Unauthorized provisioning remains denied.

## Tests, rollout, and risk

- Focused pgTAP checks cover the default, retained existing values, authorized and denied provisioning, and tenant boundaries. Focused action/component tests cover reason validation, error and conflict handling, refresh, and display.
- Run `npm run check`, `npm run test`, `npm run build`, relevant Playwright and database gates once on the final candidate. Review tenant isolation, accessibility, source routing, kiosk guards, and financial non-activation.
- Deploy through feature PR → approved development merge → backed-up/rehearsed DEV migration and acceptance → release PR → separately approved Production merge/configuration. A column default does not change existing rows; rollback is a forward fix that drops the default only if needed.
- Shared-branch merges, hosted migrations, and Production writes require the brief's explicit owner approvals.
