# Progress

## 2026-05-17

- Started Batch 112.
- Audit finding: `currentPath` uses raw staged keys instead of the validated staged set used for transferred counts.
- Initial currentPath hypothesis was invalid: malformed staged values already fail `sizeBytes` validation instead of silently skipping.
- Revised audit finding: plan response summaries derive delete counts and `partial_upload_safe` from unvalidated `plan.kind`.
- Added focused regression test. It failed before the fix because unknown plan kind was accepted.
- Added `planKind()` validation and used the validated kind for delete summary and partial upload safety.
- Focused validation passed: `node server/test/plan-response-run-tests.js`.
- Full validation passed: `timeout 60s npm run check`, `timeout 60s npm test`, and `git diff --check`.
