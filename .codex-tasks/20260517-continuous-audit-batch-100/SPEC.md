# Batch 100 - TT-Sync Progress Regressing Snapshot Guard

## Scope

Audit TT-Sync progress tracker behavior when byte counters regress.

## Constraints

- Do not change rendering of the current regress event.
- Do not change valid monotonic speed calculations.
- Prevent regressing counters from overwriting the last valid monotonic snapshot.

## Finding

`speedFrom()` avoids negative speeds when `bytesDone` regresses, but `progressSnapshot()` still stores the regressing snapshot. The next valid event then calculates speed from the regressed value and can overstate transfer speed.

## Validation

- `node tools/test/tt-sync-progress-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
- `git diff --check`
