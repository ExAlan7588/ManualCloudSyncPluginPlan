# Progress

## Recovery

- Task: add context to extension module URL decode errors.
- Shape: single-full.
- Truth file: `.codex-tasks/20260515-module-name-decode-error/TODO.csv`
- Current: Step 2, export/test/fix helper.

## Log

- 2026-05-15T00:09:58+08:00: Audited `index.js`; `resolveModuleName()` calls `decodeURIComponent()` directly, so malformed percent escapes lose extension-path context.
- 2026-05-15T00:11:27+08:00: Added frontend static coverage requiring `resolveModuleName` export, isolated decode helper, and contextual decode error text.
- 2026-05-15T00:11:27+08:00: Exported `resolveModuleName()` and added `decodeExtensionPath()` to wrap `decodeURIComponent()` failures with the original module URL and parser message.
- 2026-05-15T00:11:27+08:00: Validation passed: `timeout 60s node tools/test/frontend-tt-sync-run-tests.js`, `timeout 60s npm run check`.
- 2026-05-15T00:11:27+08:00: File-size check: `index.js` 443 lines, `tools/test/frontend-tt-sync-run-tests.js` 220, `package.json` 18.
- 2026-05-15T00:11:27+08:00: Commit attempt failed before staging: `fatal: Unable to create '/home/alan/opt/ManualCloudSyncPluginPlan/.git/index.lock': Read-only file system`.
