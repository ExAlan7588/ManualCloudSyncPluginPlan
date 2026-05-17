# Continuous Audit Batch 33

## Scope

Audit plan staging after a plan has already been committed.

## Finding

`TtSyncStorage.stageFile()` and `stageFileStream()` update staged upload state
without checking `committedAt`. A late upload against an already committed plan
can recreate staged data after commit, leaving stale state or orphaned staged
files.

## Constraints

- Do not change normal upload, commit, or concurrency behavior for open plans.
- Reject late uploads with the same explicit committed-plan error used by commit.
- Avoid leaving staged files behind when stream upload races with commit.

## Validation

- `timeout 60s node server/test/storage-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
