# Batch 99 - TT-Sync Progress Snapshot Pollution

## Scope

Audit TT-Sync progress tracker state updates when malformed numeric payloads arrive.

## Constraints

- Do not change rendering of malformed numeric progress rows.
- Do not change valid speed/ETA calculations.
- Prevent malformed numeric events from overwriting the last valid progress snapshot.

## Finding

`progressSnapshot()` stores every snapshot in `tracker.lastSnapshot`, even when all numeric progress fields are invalid. A malformed event between two valid events erases the previous valid byte snapshot and skews the next speed/ETA calculation.

## Validation

- `node tools/test/tt-sync-progress-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
- `git diff --check`
