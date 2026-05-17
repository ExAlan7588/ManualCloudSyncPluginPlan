# Progress

## 2026-05-17

- Started Batch 99.
- Audit finding: malformed numeric progress events can overwrite the last valid snapshot and skew later speed/ETA calculations.
- Added focused regression test. It failed before the fix because the next valid event used elapsed fallback speed instead of the last valid snapshot delta.
- Updated progress tracker to update `lastSnapshot` only when the snapshot has a valid `bytesDone` value.
- Focused validation passed: `node tools/test/tt-sync-progress-run-tests.js`.
- Full validation passed: `timeout 60s npm run check`, `timeout 60s npm test`, and `git diff --check`.
