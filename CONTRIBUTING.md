# Contributing

Work from a small issue or an approved `docs/features/*.md` specification.

1. Branch from current `main`: `feat/<short-name>` or `fix/<short-name>`.
2. Keep database and application changes in the same feature PR when they form one vertical slice.
3. Run `npm ci`, `npm run check`, `npm run test`, and `npm run build`.
4. Add Playwright coverage for critical manager/host/server behavior.
5. Complete the pull request template and attach screenshots for UI changes.

Never merge a schema change that relies on application deployment order without documenting the expand/migrate/contract sequence. Prefer backward-compatible migrations, deploy the compatible app, backfill if needed, then remove old fields in a later pull request.
