# Progress

## Recovery

- Task: reject corrupt zip-like artifacts before raw scan fallback.
- Shape: single-full.
- Truth file: `.codex-tasks/20260515-zip-like-eocd-required/TODO.csv`
- Current: Step 2, add verifier regression test and fix parser.

## Log

- 2026-05-15T00:39:50+08:00: Audited `tools/zip-entries.js`; if no EOCD is found it returns `[]` before checking zip-like extension, causing callers to raw-scan corrupt `.apk`/`.zip` inputs.
- 2026-05-15T00:42:44+08:00: Added a corrupt `.apk` regression test containing all required command strings. It failed before implementation because the verifier raw-scanned the file.
- 2026-05-15T00:42:44+08:00: Updated `zipEntriesFrom()` to throw `ZIP end of central directory not found` for zip-like labels without EOCD; non-zip labels still return an empty entry list.
- 2026-05-15T00:42:44+08:00: Validation passed: `timeout 60s node tools/test/verify-tauritavern-run-tests.js`, `timeout 60s npm run check`.
- 2026-05-15T00:42:44+08:00: File-size check: `tools/zip-entries.js` 170 lines, `tools/test/verify-tauritavern-run-tests.js` 219, `package.json` 18.
- 2026-05-15T00:42:44+08:00: Commit attempt failed before staging: `fatal: Unable to create '/home/alan/opt/ManualCloudSyncPluginPlan/.git/index.lock': Read-only file system`.
