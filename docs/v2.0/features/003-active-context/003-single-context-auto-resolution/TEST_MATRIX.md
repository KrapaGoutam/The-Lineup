# V2-003.003 — Test Matrix

✅ automated · ✅✅ also verified on hosted DEV (real JWT / real browser)

| ID      | Scenario                                                     | Cov  | Where                                      |
| ------- | ------------------------------------------------------------ | ---- | ------------------------------------------ |
| AUTO-01 | Unique eligible pair resolves                                | ✅✅ | `page-data-auto-resolution.test.ts`        |
| AUTO-02 | Multiple locations require selection                         | ✅   | same                                       |
| AUTO-03 | Multiple orgs never default arbitrarily                      | ✅   | same                                       |
| AUTO-04 | Inactive/archived location excluded                          | ✅   | same                                       |
| AUTO-05 | Revoked location assignment denied                           | ✅✅ | same                                       |
| AUTO-06 | Revoked org membership denied                                | ✅   | same                                       |
| AUTO-08 | Overall roles: no arbitrary pick                             | ✅   | same                                       |
| AUTO-09 | Org Owner without assignment gains nothing                   | ✅   | same                                       |
| AUTO-10 | Explicit valid selection respected                           | ✅   | same                                       |
| AUTO-11 | Unauthorized explicit selection not overridden               | ✅   | same                                       |
| AUTO-12 | Malformed/stale cookie not silently ignored                  | ✅   | same                                       |
| AUTO-13 | Login completes with no picker (refresh re-resolves)         | ✅✅ | same + `restaurant-entry.test.tsx`         |
| AUTO-14 | Refresh re-verifies each time                                | ✅   | `page-data-auto-resolution.test.ts`        |
| AUTO-15 | Signed-out has no workspace, no redirect                     | ✅   | same                                       |
| AUTO-16 | No cross-tenant redirect; verified-data destination          | ✅✅ | same + `entry-boundary.test.ts`            |
| AUTO-17 | No loops; ambiguous user not redirected                      | ✅   | same                                       |
| AUTO-18 | Demo unchanged                                               | ✅   | same + `single-context-entry-demo.spec.ts` |
| AUTO-19 | Missing `Referer` cannot choose a location                   | ✅   | `primary-location.test.ts`                 |
| AUTO-20 | Initial loaders get one verified location                    | ✅   | `page-data-auto-resolution.test.ts`        |
| —       | Browser back/forward, sign-out → sign-in, session revocation | ✅✅ | hosted DEV / local browser handoff         |
