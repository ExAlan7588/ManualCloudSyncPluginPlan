# Progress

## Recovery

- Task: reject malformed quoted deployment env values.
- Shape: single-full.
- Truth file: `.codex-tasks/20260514-deploy-env-quotes/TODO.csv`
- Current: Step 2, implement validation.

## Log

- 2026-05-14T23:29:15+08:00: Audited `tools/verify-tt-sync-deploy.js`; `trimQuotes()` strips a leading or trailing quote independently, so malformed values can be silently normalized.
- 2026-05-14T23:36:09+08:00: Replaced independent quote trimming with paired-quote parsing. Malformed quoted env values now remain raw and set `quoteError`, and deploy verification reports `env quoted values are well formed` as a visible failed check.
- 2026-05-14T23:36:09+08:00: Split deploy verifier tests into `tools/test/deploy-run-tests.js` so they run before the smoke test's local listen path. Validation passed: `timeout 60s node tools/test/deploy-run-tests.js`, `timeout 60s npm run check`.
- 2026-05-14T23:36:09+08:00: `timeout 60s node tools/test/smoke-deploy-run-tests.js` passed the env-restore and malformed-SSE checks, then failed at the existing sandbox blocker `listen EPERM: operation not permitted 127.0.0.1`.
- 2026-05-14T23:36:09+08:00: File-size check: `tools/verify-tt-sync-deploy.js` 284 lines, `tools/test/deploy-run-tests.js` 56, `tools/test/smoke-deploy-run-tests.js` 150, `package.json` 18.
- 2026-05-14T23:36:09+08:00: Commit attempt failed before staging: `fatal: Unable to create '/home/alan/opt/ManualCloudSyncPluginPlan/.git/index.lock': Read-only file system`.
