# Progress

## Recovery

- Task: prevent ZIP metadata command false positives in `tools/verify-tauritavern-tt-sync.js`.
- Shape: single-full.
- Truth file: `.codex-tasks/20260514-zip-metadata-verifier-false-positive/TODO.csv`
- Current: Step 1, reproduce false positive.

## Log

- 2026-05-14: Audit found `scanFile()` scans the whole ZIP/APK buffer before decompressed entries. Since a single-file build artifact buffer is trusted when it looks binary, command names in ZIP central directory or entry names can be counted as build-artifact command evidence.
- 2026-05-14T22:58:32+08:00: Added regression coverage showing a ZIP/APK with required commands only in the entry name incorrectly passed before the fix.
- 2026-05-14T22:58:32+08:00: Changed `scanFile()` to scan decompressed ZIP entries as the evidence source and only scan the whole file buffer when no ZIP entries are present. Focused verifier tests and `npm run check` passed.
- 2026-05-14T22:59:20+08:00: Commit blocked by environment: `git add` cannot create `.git/index.lock` because the git index is on a read-only filesystem.
