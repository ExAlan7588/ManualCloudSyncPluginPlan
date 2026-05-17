# Progress

## Audit Finding

`server/lib/encoding.js` coerces sync path inputs with `String(value || '')`.
That allows malformed non-string path values, such as numbers, to become valid
paths before downstream manifest or storage logic sees them.

## Planned Fix

Reject non-string values before trimming and validating sync path content.
Preserve the existing required-path error for missing values and preserve all
valid string path behavior.

## Implemented Change

`validateSyncPath()` now distinguishes missing values from non-string values.
Numbers and other coerced inputs are rejected with an explicit error instead of
being stringified into a potentially valid sync path.

## Validation

- `node server/test/encoding-run-tests.js`
- `node server/test/manifest-run-tests.js`
- `node server/test/routes-unit-run-tests.js`
- `node server/test/storage-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
- `git diff --check`
