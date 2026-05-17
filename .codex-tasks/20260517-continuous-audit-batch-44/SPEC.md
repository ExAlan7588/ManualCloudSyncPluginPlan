# Batch 44 - Validate staged map before upload side effects

## Scope

- Audit and minimally fix upload staging when persisted plan staged state is malformed.
- Do not change valid upload behavior, API contracts, or user-visible behavior for valid plans.

## Finding

`stageFile()` and `stageFileStream()` merge `latest.staged || {}` without first validating that persisted `staged` is a plain map. A malformed stored value can be spread into bogus staged keys, and stream staging can write a staged file before the malformed state is exposed later.

## Validation

- Focused regression: `timeout 60s node server/test/storage-run-tests.js`
- Full checks: `timeout 60s npm run check` and `timeout 60s npm test`
