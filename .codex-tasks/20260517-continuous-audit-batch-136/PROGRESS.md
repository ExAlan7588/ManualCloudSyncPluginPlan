# Progress

## Audit Finding

`commitPlan()` relies on `historyEntry()` during pre-commit shape checks, but
`historyEntry()` returned `plan.deviceId` without validating it. A corrupted
push plan with an object `deviceId` could mutate remote files and mark the plan
committed before `recordCommittedPlan()` failed on the device update.

## Planned Fix

Validate `plan.deviceId` inside `historyEntry()`, which is already called before
commit mutations. This makes malformed persisted plan state fail early and keeps
valid string identifiers unchanged.

## Implemented Change

`historyEntry()` now rejects non-string plan `deviceId` values during the
pre-commit shape check, so malformed persisted plans fail before any remote file
mutation or committed-plan write can begin.

## Validation

- `node server/test/storage-run-tests.js`
- `node server/test/storage-records-run-tests.js`
- `node server/test/run-tests.js`
- `node server/test/account-run-tests.js`
- `node server/test/tt-sync-server-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
- `git diff --check`
