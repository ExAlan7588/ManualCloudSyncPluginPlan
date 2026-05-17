# Batch 109 - Plan Progress Staged Entry Filtering

## Scope

Audit plan progress summary consistency for staged entries.

## Constraints

- Do not change valid staged upload/download progress.
- Do not mutate plan payloads.
- Ignore only staged entries that do not correspond to current transfer entries.

## Finding

`progressSummary()` counts every key in `plan.staged`. Unrelated or stale staged entries can inflate transferred file and byte counts even when they are not part of the plan uploads/downloads.

## Validation

- `node server/test/plan-response-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
- `git diff --check`
