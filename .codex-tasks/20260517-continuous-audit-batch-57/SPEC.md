# Batch 57 - Validate persisted plan kind on commit

## Scope

- Audit and minimally fix plan commit handling for malformed persisted plan kind values.
- Do not change valid push or pull commit behavior, response shape, or public API contract.

## Finding

`commitPlan()` only checks `latest.kind === 'push'` to decide whether to create rollback state and mutate remote files. A persisted plan with any other malformed `kind` is therefore treated like a pull commit and can be recorded in history with an unknown kind instead of failing before side effects.

## Validation

- Focused regression: `timeout 60s node server/test/storage-run-tests.js`
- Full checks: `timeout 60s npm run check` and `timeout 60s npm test`
