PASSunit tests: SQL/migration/unknown output never retried; transient phrase cannot mask a SQL failure; max 3 attempts |PASSunit tests (scripts/ci/supabase-start.test.ts): observed toomanyrequests output -> registry-transient |PASSlocal: pgTAP 25 files / 387 assertions, Result: PASS |PASSlocal: db reset applied 35 migrations from scratch |PASSlocal: wrapper started the reduced stack via ghcr.io on attempt 1; CI run pending |PASSsuite loads/mutates real DEV Table Allocation state (15/15 under next dev) |PASSreal-mode UI suite signs in as 4 DEV users via the passcode flow (dev server 15/15; prod build setup+S01 pass) |PASSPreview NEXT_PUBLIC_DEMO_MODE=false; build is not demo. Deployed-Preview browser check BLOCKED: Vercel Authentication, no bypass secret created |PASSProduction metadata snapshot before/after is identical (names, types, ages) |PASSDevelopment scope holds the same 5 DEV vars + demo=false (vercel env ls) |PASSsame build: 0 files contain PROD ref; suite guard also asserts bundle has no PROD ref |PASSPreview env holds DEV URL/key (metadata); local Preview-env build contains DEV ref in 12 files |# Test matrix — DEV Preview & CI Reliability

Result: PASS / FAIL / BLOCKED / PENDING, with evidence.

| ID     | Check                                            | Result  | Evidence |
| ------ | ------------------------------------------------ | ------- | -------- |
| ENV-01 | Preview uses DEV Supabase                        | PENDING |          |
| ENV-02 | Preview contains no PROD Supabase ref            | PENDING |          |
| ENV-03 | Development uses DEV Supabase                    | PENDING |          |
| ENV-04 | Production environment unchanged                 | PENDING |          |
| ENV-05 | Demo mode no longer masks real DEV Preview       | PENDING |          |
| ENV-06 | Login works against DEV                          | PENDING |          |
| ENV-07 | Table Allocation reads DEV                       | PENDING |          |
| ENV-08 | Local dev still uses DEV                         | PENDING |          |
| ENV-09 | Real-mode / non-prod guard rejects PROD          | PENDING |          |
| CI-01  | Database workflow starts required services       | PENDING |          |
| CI-02  | Migrations apply from scratch                    | PENDING |          |
| CI-03  | pgTAP passes                                     | PENDING |          |
| CI-04  | Registry transient failure is classified         | PENDING |          |
| CI-05  | Bounded registry retry does not hide SQL failure | PENDING |          |
| CI-06  | Application CI unaffected                        | PENDING |          |
| CI-07  | browser-smoke unaffected                         | PENDING |          |
| CI-08  | Feature PR Preview succeeds                      | PENDING |          |
