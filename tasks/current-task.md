# Current task: Recipes V1 R2-A

- [x] Reconcile development, create R-2 branch, and push preflight handoff.
- [x] Read locked R-2 contracts and assess local tooling.
- [x] Complete management and Storage migration, preserving R-1 import; scratch removed.
- [x] Pass focused policy tests, clean replay, full database gate and generated types.
- [ ] Verify DEV target, apply migration, test security and clean synthetic data.
- [ ] Update handoff, review, commit and push; stop before R2-B.

In flight: clean replay 56 migrations PASS; full pgTAP once, 45 files / 1462 assertions PASS (0044 81, 0045 33, import 51). Types regenerated; concurrency harness PASS. Check, Vitest 1708 and both builds PASS; browser regression running. DEV identity independently proven; 55 migrations and no image bucket/policies before apply. Final replay + focused 166 assertions and concurrency recheck PASS; browser 45/45 PASS. Local GO. Next: apply canonical migration via verified DEV connector, validate and clean synthetic data.
