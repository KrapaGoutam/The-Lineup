# Test matrix — DEV Preview & CI Reliability

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
